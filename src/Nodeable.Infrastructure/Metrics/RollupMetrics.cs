using System.Globalization;

namespace Nodeable.Infrastructure.Metrics;

/// <summary>
/// The names, dimensions and histogram bounds of the metrics rollup (spec section 8, <c>metric_rollups</c>, and section 11;
/// decision 0023). The bounds are chosen for the service level objectives, so an SLO is a sum of buckets, not an estimate
/// from a percentile: 300 ms and 1 s for the Api, 10 minutes for the queue.
/// </summary>
public static class RollupMetrics
{
    // Metric names as stored. They are not the instrument names: one instrument can feed several rows (an Api request is
    // counted by status class and bucketed by latency).
    public const string ExternalRequests = "external.requests";
    public const string ExternalLatency = "external.latency";
    public const string CacheLookups = "cache.lookups";
    public const string PreviewLookups = "preview.lookups";
    public const string CrawlJobs = "crawl.jobs";
    public const string CrawlQueueWait = "crawl.queue.wait";
    public const string ApiRequests = "api.requests";
    public const string ApiLatency = "api.latency";
    public const string QueueDepth = "queue.depth";
    public const string QueueOldestPending = "queue.oldest_pending";

    /// <summary>
    /// A process writes one of these every minute it is running, even when it has nothing else to add, so a minute with no
    /// request in it (an idle Api, <c>0</c>) can be told from a minute in which the process was not there (<c>null</c>).
    /// </summary>
    public const string ProcessUp = "process.up";

    /// <summary>Upper bounds in seconds of MusicBrainz and Deezer response times; a measurement above the last goes in <c>inf</c>.</summary>
    public static readonly IReadOnlyList<double> ExternalLatencyBounds = [0.25, 0.5, 1, 2, 5];

    /// <summary>Upper bounds in seconds of how long a job waited ready before being claimed; 600 is the freshness SLO.</summary>
    public static readonly IReadOnlyList<double> QueueWaitBounds = [1, 10, 60, 600];

    /// <summary>Upper bounds in milliseconds of Api response times; 300 and 1000 are the SLOs.</summary>
    public static readonly IReadOnlyList<double> ApiLatencyBounds = [100, 300, 1000, 3000];

    /// <summary>The Api route whose latency is the search SLO, as ASP.NET names it (<c>http.route</c>).</summary>
    public const string SearchRoute = "/api/v1/search/recordings";

    /// <summary>The Api route whose latency is the cached graph load SLO (a GET of a graph's snapshot).</summary>
    public const string GraphLoadRoute = "/api/v1/graphs/{id:guid}";

    /// <summary>
    /// The dimension text for a set of labels: <c>key=value</c> pairs sorted by key and joined by commas, so the same
    /// labels always give the same text whatever order they were given in, and a row is found again by its key.
    /// </summary>
    public static string Dimension(params (string Key, string Value)[] labels) =>
        string.Join(',', labels.OrderBy(l => l.Key, StringComparer.Ordinal).Select(l => $"{l.Key}={l.Value}"));

    /// <summary>The <c>le</c> label for an observation: the first bound that is at or above it, or <c>inf</c>.</summary>
    public static string Bound(double value, IReadOnlyList<double> bounds)
    {
        foreach (var bound in bounds)
        {
            if (value <= bound)
            {
                return bound.ToString(CultureInfo.InvariantCulture);
            }
        }

        return "inf";
    }

    /// <summary>The labels of a dimension text, as a lookup: <c>"le=300,route=search"</c> gives <c>le</c> and <c>route</c>.</summary>
    public static IReadOnlyDictionary<string, string> ParseDimension(string dimension) =>
        dimension.Length == 0
            ? new Dictionary<string, string>()
            : dimension.Split(',').Select(pair => pair.Split('=', 2)).Where(parts => parts.Length == 2).ToDictionary(parts => parts[0], parts => parts[1]);

    /// <summary>The status class of an HTTP status code: <c>2xx</c>, <c>3xx</c>, <c>4xx</c> or <c>5xx</c>.</summary>
    public static string StatusClass(int status) => $"{status / 100}xx";
}
