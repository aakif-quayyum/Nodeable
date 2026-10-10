namespace Nodeable.Api.Endpoints;

/// <summary>
/// Crawl health for the About page (FR-ABOUT-01, spec section 9).
/// </summary>
/// <param name="QueueDepth">Jobs waiting in the crawl queue.</param>
/// <param name="FetchRatePerMinute">External fetches per minute. Null until the Worker records fetch telemetry (M2 and M4): unmeasured is not the same as zero.</param>
/// <param name="CacheHitRatio">Share of lookups served from the cache, 0 to 1. Null until cache lookups are counted (M2 and M4).</param>
public sealed record CrawlStatusResponse(int QueueDepth, double? FetchRatePerMinute, double? CacheHitRatio);
