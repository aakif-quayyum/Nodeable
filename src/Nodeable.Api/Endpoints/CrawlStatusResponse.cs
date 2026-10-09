namespace Nodeable.Api.Endpoints;

/// <summary>
/// Crawl health for the About page (FR-ABOUT-01, spec section 9).
/// </summary>
/// <param name="QueueDepth">Jobs waiting in the crawl queue.</param>
/// <param name="FetchRatePerMinute">External fetches per minute. Null until the Worker records fetch telemetry (M2 and M4): unmeasured is not the same as zero.</param>
/// <param name="CacheHitRatio">Share of lookups served from the cache, 0 to 1. Null until cache lookups are counted (M2 and M4).</param>
// LEARN: LG-01 record-dto | A positional record is a one-line immutable data class with value equality; the compiler writes the constructor, properties and ToString, and the framework serialises it straight to JSON, like returning a plain object literal from an Express handler
public sealed record CrawlStatusResponse(int QueueDepth, double? FetchRatePerMinute, double? CacheHitRatio);
