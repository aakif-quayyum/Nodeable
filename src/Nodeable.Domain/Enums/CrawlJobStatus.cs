namespace Nodeable.Domain.Enums;

/// <summary>Lifecycle of a row in the durable crawl queue (spec section 7).</summary>
public enum CrawlJobStatus
{
    Pending,
    Running,
    Done,
    Failed,
}
