using System.Diagnostics;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Nodeable.Domain.Crawling;
using Nodeable.Domain.Entities;
using Nodeable.Domain.Enums;
using Nodeable.Infrastructure.Persistence;
using Nodeable.Infrastructure.Telemetry;
using OpenTelemetry;

namespace Nodeable.Infrastructure.Crawling;

/// <summary>
/// The crawl queue on PostgreSQL. EF Core is used for the connection and for turning rows into entities; the
/// statements themselves are SQL, because "claim one row that nobody else holds" and "insert unless it exists" are
/// things the database does atomically and an object-mapper cannot express.
/// </summary>
[System.Diagnostics.CodeAnalysis.SuppressMessage("Naming", "CA1711:Identifiers should not have incorrect suffix", Justification = "This is the spec's crawl queue (sections 7 and 8), not a collection type; the rule is about types that implement ICollection or IEnumerable.")]
public sealed class CrawlQueue(NodeableDbContext db, IOptions<CrawlOptions> options) : ICrawlQueue
{
    private const int MaxErrorLength = 1000;

    private readonly CrawlOptions _options = options.Value;

    public Task<EnqueueResult> EnqueueAsync(CrawlJobKind kind, Guid targetMbid, int priority, CancellationToken cancellationToken = default) =>
        EnqueueAsync(kind, targetMbid, priority, TimeSpan.Zero, cancellationToken);

    public async Task<EnqueueResult> EnqueueAsync(CrawlJobKind kind, Guid targetMbid, int priority, TimeSpan delay, CancellationToken cancellationToken = default)
    {
        using var activity = InfrastructureTelemetry.ActivitySource.StartActivity("crawl.enqueue");
        activity?.SetTag("crawl.kind", ToText(kind));
        activity?.SetTag("crawl.target_mbid", targetMbid);

        // The trace context is read from the span just started (or, when no one is listening for spans, from the
        // request that is running), so the job's own span becomes a child of this one.
        var traceparent = TraceparentOf(activity ?? Activity.Current);
        var kindText = ToText(kind);
        var delaySeconds = Math.Max(0, delay.TotalSeconds);

        // LEARN: LG-02 on-conflict-do-nothing | ON CONFLICT DO NOTHING lets the database's unique index decide "is this already queued?" atomically, so two requests at the same instant cannot both insert; the conflict target repeats the index's WHERE clause so only outstanding jobs count
        var inserted = await db.Database.ExecuteSqlAsync(
            $"""
            INSERT INTO crawl_jobs (kind, target_mbid, priority, status, attempts, run_after, traceparent)
            VALUES ({kindText}, {targetMbid}, {priority}, 'pending', 0, now() + ({delaySeconds} * interval '1 second'), {traceparent})
            ON CONFLICT (kind, target_mbid) WHERE status IN ('pending', 'running') DO NOTHING
            """,
            cancellationToken);

        var result = inserted == 1 ? EnqueueResult.Enqueued : EnqueueResult.AlreadyQueued;
        activity?.SetTag("crawl.deduplicated", result == EnqueueResult.AlreadyQueued);

        if (result == EnqueueResult.AlreadyQueued)
        {
            // A person asking for something that a background refresh already queued must not wait behind the
            // background work, so the waiting job takes the higher priority.
            var raised = await db.Database.ExecuteSqlAsync(
                $"""
                UPDATE crawl_jobs SET priority = {priority}
                WHERE kind = {kindText} AND target_mbid = {targetMbid} AND status = 'pending' AND priority < {priority}
                """,
                cancellationToken);
            activity?.SetTag("crawl.priority_raised", raised > 0);
        }

        return result;
    }

    public async Task<CrawlJob?> ClaimNextAsync(string workerId, CancellationToken cancellationToken = default)
    {
        // A worker polls every second and most polls find nothing. Left alone, each poll becomes a trace of its own
        // (about one a second: 204 after three and a half minutes, measured) and buries the traces that matter, so instrumentation is switched off for
        // housekeeping queries. The crawl.job span records what a claim found.
        using var suppressed = SuppressInstrumentationScope.Begin();

        // LEARN: LG-02 skip-locked | FOR UPDATE SKIP LOCKED makes each worker pass over rows another worker is already claiming instead of waiting on them, so any number of workers can pull from one table without a broker, and the claim is a single atomic UPDATE
        var claimed = db.CrawlJobs
            .FromSql(
                $"""
                UPDATE crawl_jobs
                SET status = 'running', locked_by = {workerId}, locked_at = now(), attempts = attempts + 1
                WHERE id = (
                    SELECT id FROM crawl_jobs
                    WHERE status = 'pending' AND run_after <= now()
                    ORDER BY priority DESC, run_after ASC
                    LIMIT 1
                    FOR UPDATE SKIP LOCKED)
                RETURNING *
                """)
            .AsNoTracking()
            .AsAsyncEnumerable();

        // AsAsyncEnumerable stops EF from wrapping the statement in a SELECT, which an UPDATE cannot sit inside.
        await foreach (var job in claimed.WithCancellation(cancellationToken))
        {
            return job;
        }

        return null;
    }

    public async Task<bool> CompleteAsync(CrawlJob job, string workerId, CancellationToken cancellationToken = default)
    {
        // Guarded by locked_by: if this worker was too slow and the job was handed to another one, finishing it here would overwrite the other worker's claim.
        var changed = await db.Database.ExecuteSqlAsync(
            $"""
            UPDATE crawl_jobs
            SET status = 'done', locked_by = NULL, locked_at = NULL, last_error = NULL
            WHERE id = {job.Id} AND status = 'running' AND locked_by = {workerId}
            """,
            cancellationToken);

        return changed == 1;
    }

    public async Task<FailResult> FailAsync(CrawlJob job, string workerId, string errorMessage, bool permanent = false, CancellationToken cancellationToken = default)
    {
        var policy = RetryPolicy();
        var retry = !permanent && policy.CanRetry(job.Attempts);
        var status = retry ? "pending" : "failed";
        var delaySeconds = retry ? policy.DelayAfter(job.Attempts, Random.Shared.NextDouble()).TotalSeconds : 0d;
        var message = errorMessage.Length <= MaxErrorLength ? errorMessage : errorMessage[..MaxErrorLength];

        var changed = await db.Database.ExecuteSqlAsync(
            $"""
            UPDATE crawl_jobs
            SET status = {status},
                run_after = now() + ({delaySeconds} * interval '1 second'),
                locked_by = NULL, locked_at = NULL, last_error = {message}
            WHERE id = {job.Id} AND status = 'running' AND locked_by = {workerId}
            """,
            cancellationToken);

        if (changed == 0)
        {
            return FailResult.LockLost;
        }

        return retry ? FailResult.WillRetry : FailResult.Failed;
    }

    public async Task<bool> ReleaseAsync(CrawlJob job, string workerId, CancellationToken cancellationToken = default)
    {
        var changed = await db.Database.ExecuteSqlAsync(
            $"""
            UPDATE crawl_jobs
            SET status = 'pending', attempts = attempts - 1, locked_by = NULL, locked_at = NULL
            WHERE id = {job.Id} AND status = 'running' AND locked_by = {workerId}
            """,
            cancellationToken);

        return changed == 1;
    }

    public async Task<int> RecoverStaleAsync(CancellationToken cancellationToken = default)
    {
        // Housekeeping, run every minute by every worker: not worth a trace of its own (see ClaimNextAsync).
        using var suppressed = SuppressInstrumentationScope.Begin();

        var lockTimeoutSeconds = _options.LockTimeout.TotalSeconds;
        var maxAttempts = _options.MaxAttempts;

        // A job that keeps killing its worker would otherwise be recovered for ever, so recovery spends attempts too.
        return await db.Database.ExecuteSqlAsync(
            $"""
            UPDATE crawl_jobs
            SET status = CASE WHEN attempts >= {maxAttempts} THEN 'failed' ELSE 'pending' END,
                run_after = now(),
                locked_by = NULL, locked_at = NULL,
                last_error = 'The worker stopped before finishing this job (its lock expired).'
            WHERE status = 'running' AND locked_at < now() - ({lockTimeoutSeconds} * interval '1 second')
            """,
            cancellationToken);
    }

    private CrawlRetryPolicy RetryPolicy() => new(_options.MaxAttempts, _options.RetryBaseDelay, _options.RetryMaxDelay);

    private static string ToText(CrawlJobKind kind) => kind.ToString().ToLowerInvariant();

    /// <summary>The W3C <c>traceparent</c> of an activity, or null when there is none or it is not in W3C format.</summary>
    private static string? TraceparentOf(Activity? activity) =>
        activity is { IdFormat: ActivityIdFormat.W3C } ? activity.Id : null;
}
