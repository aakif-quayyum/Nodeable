using System.Diagnostics;
using System.Diagnostics.Metrics;

namespace Nodeable.Infrastructure.Telemetry;

/// <summary>
/// The spans and metrics of the code that talks to external services and runs the crawl queue (spec section 11).
/// ServiceDefaults subscribes to every source and meter named "Nodeable.*", so adding an <see cref="ActivitySource"/>
/// here is all it takes to export.
/// </summary>
internal static class InfrastructureTelemetry
{
    public const string Name = "Nodeable.Infrastructure";

    // LEARN: LG-02 activity-source | An ActivitySource is .NET's tracer: StartActivity returns null when nobody is listening, so tracing costs nothing until an exporter subscribes
    public static readonly ActivitySource ActivitySource = new(Name);

    private static readonly Meter _meter = new(Name);

    /// <summary>One count per HTTP attempt to an external API, so retries are visible (the 503 SLO in spec section 11).</summary>
    public static readonly Counter<long> ExternalRequests = _meter.CreateCounter<long>(
        "external.requests",
        unit: "{request}",
        description: "Requests sent to external APIs, by source and HTTP status code (\"error\" when no response arrived).");

    /// <summary>Time from sending an attempt to an external API to its response, by source and status code: the latency heatmap on /status.</summary>
    public static readonly Histogram<double> ExternalRequestDuration = _meter.CreateHistogram<double>(
        "external.request.duration",
        unit: "s",
        description: "Time of one HTTP attempt to an external API until its response arrived, by source and HTTP status code.");

    /// <summary>
    /// Lookups answered by the local cache (hit) or that had to go to an external API (miss). The cache hit ratio on the
    /// About page is hit over hit plus miss (spec section 11).
    /// </summary>
    public static readonly Counter<long> CacheLookups = _meter.CreateCounter<long>(
        "cache.lookups",
        unit: "{lookup}",
        description: "Lookups served from the cache or sent to an external API, by entity and result (hit, miss).");

    /// <summary>
    /// Preview jobs, by result: found (with method isrc or title_artist), rejected (Deezer had candidates and the guard refused
    /// them all) or none (Deezer had nothing). Hit rate is found over the three (FR-PREVIEW-01).
    /// </summary>
    public static readonly Counter<long> PreviewLookups = _meter.CreateCounter<long>(
        "preview.lookups",
        unit: "{lookup}",
        description: "Preview jobs that looked a recording up at Deezer, by result (found, rejected, none) and, for found, the method (isrc, title_artist).");

    /// <summary>Browsers connected to the graph hub right now: live users (spec section 11).</summary>
    public static readonly UpDownCounter<long> SignalRConnections = _meter.CreateUpDownCounter<long>(
        "signalr.connections",
        unit: "{connection}",
        description: "Open SignalR connections to the graph hub.");

    /// <summary>How long each request waited for the rate gate: the number that shows the limit is the bottleneck.</summary>
    public static readonly Histogram<double> RateGateWait = _meter.CreateHistogram<double>(
        "ratelimit.wait",
        unit: "s",
        description: "Time a request waited for its slot in a shared rate gate, by source.");

    /// <summary>How long a claimed job took, by kind and how it ended: done, retry, failed or released.</summary>
    public static readonly Histogram<double> CrawlJobDuration = _meter.CreateHistogram<double>(
        "crawl.job.duration",
        unit: "s",
        description: "Time from claiming a crawl job to finishing it, by kind and outcome.");

    /// <summary>How long a job had been ready to run when a worker claimed it: the delay users feel.</summary>
    public static readonly Histogram<double> CrawlQueueWait = _meter.CreateHistogram<double>(
        "crawl.queue.wait",
        unit: "s",
        description: "Time a crawl job waited, ready to run, before a worker claimed it, by kind.");
}
