using System.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Nodeable.Domain.Entities;
using Nodeable.Infrastructure.Telemetry;

namespace Nodeable.Infrastructure.Crawling;

/// <summary>Claims and runs crawl jobs. The Worker's hosted service calls this in a loop.</summary>
public interface ICrawlJobRunner
{
    /// <summary>Claims one job and runs it. False when the queue had nothing ready.</summary>
    Task<bool> RunOnceAsync(CancellationToken cancellationToken);

    /// <summary>Puts back jobs abandoned by a worker that died. Returns how many.</summary>
    Task<int> RecoverStaleAsync(CancellationToken cancellationToken);
}

/// <summary>
/// Runs one job at a time through the whole lifecycle: claim, a <c>crawl.job</c> span that continues the trace of
/// whoever queued the job, the handler for its kind, then done, retry, failed or released.
/// </summary>
public sealed partial class CrawlJobRunner(IServiceScopeFactory scopes, ILogger<CrawlJobRunner> logger) : ICrawlJobRunner
{
    /// <summary>
    /// Names this worker in <c>crawl_jobs.locked_by</c>. The process id and a random part make a restarted process a
    /// different worker, so the old process's lock is never mistaken for the new one's.
    /// </summary>
    public string WorkerId { get; } = $"{Environment.MachineName}:{Environment.ProcessId}:{Guid.NewGuid():N}";

    public async Task<bool> RunOnceAsync(CancellationToken cancellationToken)
    {
        // A scope per job gives every job its own DbContext and handler instances, and disposes them when it ends.
        await using var scope = scopes.CreateAsyncScope();
        var queue = scope.ServiceProvider.GetRequiredService<ICrawlQueue>();

        var job = await queue.ClaimNextAsync(WorkerId, cancellationToken);
        if (job is null)
        {
            return false;
        }

        var kind = job.Kind.ToString().ToLowerInvariant();
        var queueWait = Math.Max(0, (DateTimeOffset.UtcNow - job.RunAfter).TotalSeconds);
        InfrastructureTelemetry.CrawlQueueWait.Record(queueWait, new KeyValuePair<string, object?>("kind", kind));

        // LEARN: LG-02 trace-propagation | A trace context saved as text in the database can be turned back into a parent: the job's span joins the trace of the request that queued it, so one trace shows the click and the background fetch it caused
        _ = ActivityContext.TryParse(job.Traceparent, null, out var parent);
        using var activity = InfrastructureTelemetry.ActivitySource.StartActivity("crawl.job", ActivityKind.Consumer, parent);
        activity?.SetTag("crawl.kind", kind);
        activity?.SetTag("crawl.attempt", job.Attempts);
        activity?.SetTag("crawl.queue_wait_ms", (long)(queueWait * 1000));
        activity?.SetTag("crawl.target_mbid", job.TargetMbid);

        var started = Stopwatch.GetTimestamp();
        var outcome = "done";
        try
        {
            var handler = scope.ServiceProvider.GetKeyedService<ICrawlJobHandler>(job.Kind);
            if (handler is null)
            {
                // Retrying cannot help: no code is registered for this kind.
                outcome = "failed";
                await queue.FailAsync(job, WorkerId, $"No handler is registered for jobs of kind '{kind}'.", permanent: true, CancellationToken.None);
                LogNoHandler(logger, job.Id, kind);
                activity?.SetStatus(ActivityStatusCode.Error, "no handler");
                return true;
            }

            await handler.HandleAsync(job, cancellationToken);
            if (!await queue.CompleteAsync(job, WorkerId, CancellationToken.None))
            {
                LogLockLost(logger, job.Id, kind);
            }

            LogDone(logger, job.Id, kind, job.Attempts);
            await NotifyAsync(scope, observer => observer.OnJobDoneAsync(job, CancellationToken.None), job, kind);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            // The service is stopping. The job is handed back at once, without counting the attempt, instead of
            // sitting "running" until its lock expires.
            outcome = "released";
            await queue.ReleaseAsync(job, WorkerId, CancellationToken.None);
            LogReleased(logger, job.Id, kind);
            throw;
        }
        catch (CrawlJobPermanentFailureException exception)
        {
            // The handler says no number of retries can help (for example MusicBrainz has no such entity).
            outcome = "failed";
            await queue.FailAsync(job, WorkerId, exception.Message, permanent: true, CancellationToken.None);
            activity?.SetStatus(ActivityStatusCode.Error, exception.Message);
            LogPermanentFailure(logger, job.Id, kind, exception.Message);
            await NotifyAsync(scope, observer => observer.OnJobFailedAsync(job, CancellationToken.None), job, kind);
        }
        catch (Exception exception)
        {
            var failed = await queue.FailAsync(job, WorkerId, exception.Message, permanent: false, CancellationToken.None);
            outcome = failed == FailResult.Failed ? "failed" : "retry";
            activity?.SetStatus(ActivityStatusCode.Error, exception.Message);
            activity?.AddException(exception);

            // Spec section 11: Warning for a retry, Error once the retries are used up.
            if (failed == FailResult.Failed)
            {
                LogFailed(logger, exception, job.Id, kind, job.Attempts);
            }
            else
            {
                LogRetry(logger, exception, job.Id, kind, job.Attempts);
            }

            if (failed == FailResult.Failed)
            {
                await NotifyAsync(scope, observer => observer.OnJobFailedAsync(job, CancellationToken.None), job, kind);
            }
        }
        finally
        {
            InfrastructureTelemetry.CrawlJobDuration.Record(
                Stopwatch.GetElapsedTime(started).TotalSeconds,
                new KeyValuePair<string, object?>("kind", kind),
                new KeyValuePair<string, object?>("outcome", outcome));
        }

        return true;
    }

    // Observers run after the queue has recorded the outcome, and their failure is only logged: the job's own work is
    // already stored, and a browser that misses an event loads the snapshot on its next reconnect.
    private async Task NotifyAsync(AsyncServiceScope scope, Func<ICrawlJobObserver, Task> notify, CrawlJob job, string kind)
    {
        foreach (var observer in scope.ServiceProvider.GetServices<ICrawlJobObserver>())
        {
            try
            {
                await notify(observer);
            }
            catch (Exception exception) when (exception is not OperationCanceledException)
            {
                LogObserverFailed(logger, exception, job.Id, kind, observer.GetType().Name);
            }
        }
    }

    public async Task<int> RecoverStaleAsync(CancellationToken cancellationToken)
    {
        await using var scope = scopes.CreateAsyncScope();
        var recovered = await scope.ServiceProvider.GetRequiredService<ICrawlQueue>().RecoverStaleAsync(cancellationToken);
        if (recovered > 0)
        {
            LogRecovered(logger, recovered);
        }

        return recovered;
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "Crawl job {JobId} ({Kind}) done on attempt {Attempt}")]
    private static partial void LogDone(ILogger logger, long jobId, string kind, int attempt);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Crawl job {JobId} ({Kind}) failed on attempt {Attempt} and will be retried")]
    private static partial void LogRetry(ILogger logger, Exception exception, long jobId, string kind, int attempt);

    [LoggerMessage(Level = LogLevel.Error, Message = "Crawl job {JobId} ({Kind}) failed on attempt {Attempt} and is out of attempts")]
    private static partial void LogFailed(ILogger logger, Exception exception, long jobId, string kind, int attempt);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Crawl job {JobId} ({Kind}) cannot succeed and is marked failed: {Reason}")]
    private static partial void LogPermanentFailure(ILogger logger, long jobId, string kind, string reason);

    [LoggerMessage(Level = LogLevel.Error, Message = "Crawl job {JobId} has kind '{Kind}', which has no handler; marked failed")]
    private static partial void LogNoHandler(ILogger logger, long jobId, string kind);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Crawl job {JobId} ({Kind}) was finished after its lock had expired and been handed to another worker")]
    private static partial void LogLockLost(ILogger logger, long jobId, string kind);

    [LoggerMessage(Level = LogLevel.Information, Message = "Crawl job {JobId} ({Kind}) handed back to the queue because the worker is stopping")]
    private static partial void LogReleased(ILogger logger, long jobId, string kind);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Crawl job {JobId} ({Kind}) finished, but {Observer} could not report it")]
    private static partial void LogObserverFailed(ILogger logger, Exception exception, long jobId, string kind, string observer);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Recovered {Count} crawl job(s) abandoned by a worker that stopped")]
    private static partial void LogRecovered(ILogger logger, int count);
}
