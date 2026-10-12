using Nodeable.Domain.Entities;

namespace Nodeable.Infrastructure.Crawling;

/// <summary>
/// Told how each crawl job ended, after the queue has recorded it. The Worker registers one that sends the result to
/// the browsers watching the songs the job concerned (spec section 7, step 6). An observer's failure is logged and
/// never changes the job's outcome: the job's work is already stored.
/// </summary>
public interface ICrawlJobObserver
{
    /// <summary>The job finished and its results are stored.</summary>
    Task OnJobDoneAsync(CrawlJob job, CancellationToken cancellationToken);

    /// <summary>The job is marked failed: it ran out of attempts, or can never succeed. A job that will be retried is not reported.</summary>
    Task OnJobFailedAsync(CrawlJob job, CancellationToken cancellationToken);
}
