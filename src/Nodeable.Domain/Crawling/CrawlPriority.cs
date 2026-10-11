namespace Nodeable.Domain.Crawling;

/// <summary>
/// Priorities for <c>crawl_jobs.priority</c>. The Worker claims the highest priority first, so a person waiting for a
/// song is never queued behind background refreshes (spec section 7, "Flow: scheduled work").
/// </summary>
public static class CrawlPriority
{
    /// <summary>A person is waiting: adding a song, opening a person's page.</summary>
    public const int Interactive = 100;

    /// <summary>Background work: stale-cache refresh, producer radar.</summary>
    public const int Scheduled = 10;
}
