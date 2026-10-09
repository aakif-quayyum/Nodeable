using Nodeable.Domain.Enums;

namespace Nodeable.Domain.Entities;

/// <summary>A row in the durable crawl queue (spec section 8, <c>crawl_jobs</c>; section 7 for how the Worker claims them).</summary>
public class CrawlJob
{
    /// <summary>Database-generated surrogate key.</summary>
    public long Id { get; init; }

    public required CrawlJobKind Kind { get; init; }

    public required Guid TargetMbid { get; init; }

    /// <summary>Higher runs first. Interactive users outrank scheduled work (spec section 7).</summary>
    public int Priority { get; set; }

    public CrawlJobStatus Status { get; set; } = CrawlJobStatus.Pending;

    public int Attempts { get; set; }

    public DateTimeOffset RunAfter { get; set; }

    public string? LockedBy { get; set; }

    public DateTimeOffset? LockedAt { get; set; }

    public string? LastError { get; set; }

    /// <summary>W3C trace context of the request that queued the job, so the background fetch joins the same trace.</summary>
    public string? Traceparent { get; set; }
}
