namespace Nodeable.Infrastructure.Metrics;

/// <summary>One service level objective of spec section 11: its id, what it says, its target, and which side of it is good.</summary>
/// <param name="Id">The stable name stored in <c>slo_checks.slo</c>.</param>
/// <param name="Label">The words on the status page.</param>
/// <param name="Target">A share between 0 and 1.</param>
/// <param name="AtLeast">True when the observed share must reach the target (availability); false when it must stay under it (the 503 rate).</param>
public sealed record SloDefinition(string Id, string Label, double Target, bool AtLeast)
{
    /// <summary>Whether <paramref name="observed"/> breaks the target. An unmeasured SLO (null) is not a breach.</summary>
    public bool IsBreachedBy(double? observed) =>
        observed is { } value && (AtLeast ? value < Target : value >= Target);
}

/// <summary>The five objectives of spec section 11, checked daily (decision 0023).</summary>
public static class SloDefinitions
{
    public const string ApiAvailability = "api-availability";
    public const string SearchLatency = "search-latency";
    public const string GraphLoadLatency = "graph-load-latency";
    public const string CrawlFreshness = "crawl-freshness";
    public const string MusicBrainz503Rate = "musicbrainz-503-rate";

    public static readonly IReadOnlyList<SloDefinition> All =
    [
        new(ApiAvailability, "API availability", 0.995, AtLeast: true),
        new(SearchLatency, "Search latency (under 1 s)", 0.95, AtLeast: true),
        new(GraphLoadLatency, "Cached graph load (under 300 ms)", 0.95, AtLeast: true),
        new(CrawlFreshness, "Crawl freshness (claimed within 10 minutes)", 0.99, AtLeast: true),
        new(MusicBrainz503Rate, "MusicBrainz 503 rate", 0.01, AtLeast: false),
    ];

    /// <summary>The window every check looks back over: spec section 11 states the SLOs over 30 days.</summary>
    public const int WindowDays = 30;
}
