using Nodeable.Domain.Entities;

namespace Nodeable.Infrastructure.Crawling;

/// <summary>
/// Does the work of one kind of crawl job (for example fetch a recording from MusicBrainz and store its credits).
/// Handlers are registered with the job kind as the service key, and the runner picks the one for each claimed job.
/// </summary>
/// <remarks>
/// A handler signals failure by throwing. The runner records the error and the queue schedules a retry, so a handler
/// does not need its own retry loop. A handler must be safe to run twice for the same job: a worker can die after the
/// work is stored but before the job is marked done (credit upserts are idempotent for this reason).
/// </remarks>
public interface ICrawlJobHandler
{
    Task HandleAsync(CrawlJob job, CancellationToken cancellationToken);
}
