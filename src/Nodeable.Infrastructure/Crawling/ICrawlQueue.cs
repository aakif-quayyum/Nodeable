using Nodeable.Domain.Entities;
using Nodeable.Domain.Enums;

namespace Nodeable.Infrastructure.Crawling;

/// <summary>What <see cref="ICrawlQueue.EnqueueAsync"/> did.</summary>
public enum EnqueueResult
{
    /// <summary>A new pending job was added.</summary>
    Enqueued,

    /// <summary>The same fetch was already pending or running, so nothing was added (spec section 8, crawl_jobs index).</summary>
    AlreadyQueued,
}

/// <summary>What <see cref="ICrawlQueue.FailAsync"/> did with the job.</summary>
public enum FailResult
{
    /// <summary>The job is pending again, to run after a backoff.</summary>
    WillRetry,

    /// <summary>The job used its attempts, or cannot succeed, and is marked failed.</summary>
    Failed,

    /// <summary>The job was no longer this worker's (its lock expired and it was handed on), so nothing changed.</summary>
    LockLost,
}

/// <summary>
/// The durable crawl queue (spec sections 7 and 8): a table in PostgreSQL, so jobs survive a restart of any service
/// (NFR-REL-01). Every method is one SQL statement, and every time comparison uses the database's own clock, so
/// workers on different machines agree.
/// </summary>
[System.Diagnostics.CodeAnalysis.SuppressMessage("Naming", "CA1711:Identifiers should not have incorrect suffix", Justification = "This is the spec's crawl queue (sections 7 and 8), not a collection type; the rule is about types that implement ICollection or IEnumerable.")]
public interface ICrawlQueue
{
    /// <summary>
    /// Adds a fetch, unless the same kind and target is already pending or running. The trace context of the current
    /// activity is stored on the job, so the background fetch appears in the trace of the request that asked for it.
    /// </summary>
    Task<EnqueueResult> EnqueueAsync(CrawlJobKind kind, Guid targetMbid, int priority, CancellationToken cancellationToken = default);

    /// <summary>
    /// Takes the highest-priority job that is ready, marks it running for <paramref name="workerId"/>, and counts the
    /// attempt. Returns null when nothing is ready. Several workers may call this at once; each gets a different job.
    /// </summary>
    Task<CrawlJob?> ClaimNextAsync(string workerId, CancellationToken cancellationToken = default);

    /// <summary>Marks a claimed job done. False when the job was no longer this worker's.</summary>
    Task<bool> CompleteAsync(CrawlJob job, string workerId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Records a failed attempt. The job goes back to pending after a backoff while attempts remain and
    /// <paramref name="permanent"/> is false; otherwise it is marked failed.
    /// </summary>
    Task<FailResult> FailAsync(CrawlJob job, string workerId, string errorMessage, bool permanent = false, CancellationToken cancellationToken = default);

    /// <summary>
    /// Hands a claimed job back unfinished, for example when the worker is shutting down. The attempt is not counted,
    /// because stopping the service is not the job's fault.
    /// </summary>
    Task<bool> ReleaseAsync(CrawlJob job, string workerId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Finds jobs whose worker stopped without finishing them (running for longer than the lock timeout) and puts them
    /// back in the queue, or fails them when they have used their attempts. Returns how many were handled.
    /// </summary>
    Task<int> RecoverStaleAsync(CancellationToken cancellationToken = default);
}
