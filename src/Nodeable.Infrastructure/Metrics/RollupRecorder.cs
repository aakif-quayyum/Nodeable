using System.Diagnostics.Metrics;
using System.Globalization;

namespace Nodeable.Infrastructure.Metrics;

/// <summary>One number added to a metric in memory: what the recorder holds between two flushes.</summary>
public sealed record RollupDelta(string Metric, string Dimension, long Count, double? Sum, double? Min, double? Max);

/// <summary>
/// Listens to the process's own meters and adds what it sees to an in-memory table, which the flusher writes to
/// <c>metric_rollups</c> once a minute (decision 0023, "each process flushes its own deltas"). It is the Meter API's
/// listening half: the instruments in <c>InfrastructureTelemetry</c> and ASP.NET's request histogram publish
/// measurements, and this class subscribes to the ones the rollup keeps.
/// </summary>
public sealed class RollupRecorder : IDisposable
{
    private sealed class Cell
    {
        public long Count;
        public double? Sum;
        public double? Min;
        public double? Max;

        public void Add(long count, double? sum, double? min, double? max)
        {
            Count += count;
            Sum = sum is null ? Sum : (Sum ?? 0) + sum;
            Min = min is null ? Min : Min is null ? min : Math.Min(Min.Value, min.Value);
            Max = max is null ? Max : Max is null ? max : Math.Max(Max.Value, max.Value);
        }
    }

    private static readonly HashSet<string> _instruments =
    [
        "external.requests",
        "external.request.duration",
        "cache.lookups",
        "preview.lookups",
        "crawl.job.duration",
        "crawl.queue.wait",
        "http.server.request.duration",
    ];

    private readonly MeterListener _listener = new();
    private readonly Lock _gate = new();
    private Dictionary<(string Metric, string Dimension), Cell> _cells = [];

    /// <summary>Listens to Nodeable's own meters and to ASP.NET's request duration, which is the Api's request count and latency.</summary>
    public RollupRecorder()
        : this(instrument => instrument.Meter.Name.StartsWith("Nodeable.", StringComparison.Ordinal)
            || (instrument.Meter.Name == "Microsoft.AspNetCore.Hosting" && instrument.Name == "http.server.request.duration"))
    {
    }

    /// <summary>For tests: listen to the instruments this predicate accepts (still only the ones the rollup keeps, by name).</summary>
    public RollupRecorder(Func<Instrument, bool> wants)
    {
        // LEARN: LG-04 meter-listener | MeterListener is the other half of the Meter API: instruments publish measurements, a listener decides which instruments it wants and gets a callback for each measurement, so the app can read its own metrics in-process (for the rollup) while OpenTelemetry reads the same ones for export
        _listener.InstrumentPublished = (instrument, listener) =>
        {
            if (_instruments.Contains(instrument.Name) && wants(instrument))
            {
                listener.EnableMeasurementEvents(instrument);
            }
        };
        _listener.SetMeasurementEventCallback<long>((instrument, value, tags, _) => Observe(instrument.Name, value, tags));
        _listener.SetMeasurementEventCallback<double>((instrument, value, tags, _) => Observe(instrument.Name, value, tags));
        _listener.Start();
    }

    private static string? Tag(ReadOnlySpan<KeyValuePair<string, object?>> tags, string key)
    {
        foreach (var tag in tags)
        {
            if (tag.Key == key)
            {
                return Convert.ToString(tag.Value, CultureInfo.InvariantCulture);
            }
        }

        return null;
    }

    private void Observe(string instrument, double value, ReadOnlySpan<KeyValuePair<string, object?>> tags)
    {
        switch (instrument)
        {
            case "external.requests":
                Add(RollupMetrics.ExternalRequests, RollupMetrics.Dimension(("source", Tag(tags, "source") ?? "unknown"), ("status", Tag(tags, "status_code") ?? "unknown")), (long)value);
                break;

            case "external.request.duration":
                Observation(RollupMetrics.ExternalLatency, ("source", Tag(tags, "source") ?? "unknown"), value, RollupMetrics.ExternalLatencyBounds);
                break;

            case "cache.lookups":
                Add(RollupMetrics.CacheLookups, RollupMetrics.Dimension(("entity", Tag(tags, "entity") ?? "unknown"), ("result", Tag(tags, "result") ?? "unknown")), (long)value);
                break;

            case "preview.lookups":
                Add(RollupMetrics.PreviewLookups, RollupMetrics.Dimension(("method", Tag(tags, "method") ?? "none"), ("result", Tag(tags, "result") ?? "unknown")), (long)value);
                break;

            case "crawl.job.duration":
                Add(RollupMetrics.CrawlJobs, RollupMetrics.Dimension(("outcome", Tag(tags, "outcome") ?? "unknown")), 1, value);
                break;

            case "crawl.queue.wait":
                Observation(RollupMetrics.CrawlQueueWait, null, value, RollupMetrics.QueueWaitBounds);
                break;

            case "http.server.request.duration":
                ObserveApiRequest(value, tags);
                break;
        }
    }

    private void ObserveApiRequest(double seconds, ReadOnlySpan<KeyValuePair<string, object?>> tags)
    {
        if (!int.TryParse(Tag(tags, "http.response.status_code"), CultureInfo.InvariantCulture, out var status))
        {
            return;
        }

        Add(RollupMetrics.ApiRequests, RollupMetrics.Dimension(("class", RollupMetrics.StatusClass(status))), 1);

        // Latency is bucketed in milliseconds, for every route and again for the two routes the SLOs name. A request that
        // failed is slow or fast like any other, so no status is excluded.
        var milliseconds = seconds * 1000;
        Observation(RollupMetrics.ApiLatency, ("route", "all"), milliseconds, RollupMetrics.ApiLatencyBounds);

        var route = Tag(tags, "http.route");
        var method = Tag(tags, "http.request.method");
        if (route == RollupMetrics.SearchRoute)
        {
            Observation(RollupMetrics.ApiLatency, ("route", "search"), milliseconds, RollupMetrics.ApiLatencyBounds);
        }
        else if (route == RollupMetrics.GraphLoadRoute && method == "GET")
        {
            Observation(RollupMetrics.ApiLatency, ("route", "graph_load"), milliseconds, RollupMetrics.ApiLatencyBounds);
        }
    }

    private void Observation(string metric, (string Key, string Value)? label, double value, IReadOnlyList<double> bounds)
    {
        var dimension = label is { } l
            ? RollupMetrics.Dimension(("le", RollupMetrics.Bound(value, bounds)), l)
            : RollupMetrics.Dimension(("le", RollupMetrics.Bound(value, bounds)));
        Add(metric, dimension, 1, value);
    }

    private void Add(string metric, string dimension, long count, double? observed = null)
    {
        lock (_gate)
        {
            if (!_cells.TryGetValue((metric, dimension), out var cell))
            {
                _cells[(metric, dimension)] = cell = new Cell();
            }

            cell.Add(count, observed, observed, observed);
        }
    }

    /// <summary>Takes everything recorded since the last call and starts again from nothing.</summary>
    public IReadOnlyList<RollupDelta> Drain()
    {
        Dictionary<(string Metric, string Dimension), Cell> taken;
        lock (_gate)
        {
            taken = _cells;
            _cells = [];
        }

        return taken.Select(pair => new RollupDelta(pair.Key.Metric, pair.Key.Dimension, pair.Value.Count, pair.Value.Sum, pair.Value.Min, pair.Value.Max)).ToList();
    }

    /// <summary>Puts drained deltas back, when writing them failed, so the next flush carries them.</summary>
    public void Restore(IEnumerable<RollupDelta> deltas)
    {
        lock (_gate)
        {
            foreach (var delta in deltas)
            {
                if (!_cells.TryGetValue((delta.Metric, delta.Dimension), out var cell))
                {
                    _cells[(delta.Metric, delta.Dimension)] = cell = new Cell();
                }

                cell.Add(delta.Count, delta.Sum, delta.Min, delta.Max);
            }
        }
    }

    public void Dispose() => _listener.Dispose();
}
