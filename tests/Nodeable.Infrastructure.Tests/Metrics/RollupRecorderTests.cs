using System.Diagnostics.Metrics;
using Nodeable.Infrastructure.Metrics;

namespace Nodeable.Infrastructure.Tests.Metrics;

// NFR-OBS-02: what the recorder turns each instrument's measurements into. No database: it is the in-memory half. Each test
// owns a Meter and tells the recorder to listen to that one only, so other tests' real instruments cannot add to the counts.
public sealed class RollupRecorderTests : IDisposable
{
    private readonly Meter _meter = new($"Nodeable.Test.{Guid.NewGuid():N}");
    private readonly RollupRecorder _recorder;

    public RollupRecorderTests() => _recorder = new RollupRecorder(instrument => instrument.Meter == _meter);

    public void Dispose()
    {
        _recorder.Dispose();
        _meter.Dispose();
    }

    private static KeyValuePair<string, object?> T(string key, object? value) => new(key, value);

    private RollupDelta Row(string metric, string dimension) =>
        _recorder.Drain().Single(d => d.Metric == metric && d.Dimension == dimension);

    [Fact]
    public void NFR_OBS_02_a_counter_adds_to_one_row_per_label_set_with_sorted_labels()
    {
        var requests = _meter.CreateCounter<long>("external.requests");

        requests.Add(1, T("status_code", "503"), T("source", "musicbrainz"));
        requests.Add(1, T("source", "musicbrainz"), T("status_code", "503"));
        requests.Add(1, T("source", "musicbrainz"), T("status_code", "200"));

        var rows = _recorder.Drain();
        rows.Should().HaveCount(2);
        rows.Single(r => r.Dimension == "source=musicbrainz,status=503").Count.Should().Be(2, "the same labels in any order are one row");
        rows.Single(r => r.Dimension == "source=musicbrainz,status=200").Count.Should().Be(1);
    }

    [Fact]
    public void NFR_OBS_02_cache_lookups_and_preview_lookups_keep_their_labels()
    {
        _meter.CreateCounter<long>("cache.lookups").Add(3, T("entity", "work"), T("result", "stale"));
        _meter.CreateCounter<long>("preview.lookups").Add(1, T("result", "found"), T("method", "isrc"));

        var rows = _recorder.Drain();

        rows.Should().Contain(r => r.Metric == "cache.lookups" && r.Dimension == "entity=work,result=stale" && r.Count == 3);
        rows.Should().Contain(r => r.Metric == "preview.lookups" && r.Dimension == "method=isrc,result=found" && r.Count == 1);
    }

    [Theory]
    [InlineData(0.5, "1")]
    [InlineData(1.0, "1")]
    [InlineData(1.001, "10")]
    [InlineData(599.0, "600")]
    [InlineData(600.0, "600")]
    [InlineData(601.0, "inf")]
    public void NFR_OBS_02_queue_wait_goes_in_the_first_bound_at_or_above_it_and_600_seconds_is_a_bound(double seconds, string bound)
    {
        _meter.CreateHistogram<double>("crawl.queue.wait").Record(seconds, T("kind", "recording"));

        Row("crawl.queue.wait", $"le={bound}").Count.Should().Be(1);
    }

    [Fact]
    public void NFR_OBS_02_a_job_is_counted_by_outcome_with_its_total_time()
    {
        var duration = _meter.CreateHistogram<double>("crawl.job.duration");
        duration.Record(2, T("kind", "recording"), T("outcome", "done"));
        duration.Record(4, T("kind", "work"), T("outcome", "done"));
        duration.Record(1, T("kind", "work"), T("outcome", "failed"));

        var done = Row("crawl.jobs", "outcome=done");
        done.Count.Should().Be(2);
        done.Sum.Should().Be(6);
        done.Min.Should().Be(2);
        done.Max.Should().Be(4);
    }

    [Fact]
    public void NFR_OBS_02_an_api_request_is_counted_by_status_class_and_its_latency_is_bucketed_for_all_routes_and_the_slo_routes()
    {
        var duration = _meter.CreateHistogram<double>("http.server.request.duration");
        duration.Record(0.2, T("http.response.status_code", 200), T("http.route", RollupMetrics.SearchRoute), T("http.request.method", "GET"));
        duration.Record(4, T("http.response.status_code", 200), T("http.route", RollupMetrics.SearchRoute), T("http.request.method", "GET"));
        duration.Record(0.05, T("http.response.status_code", 200), T("http.route", RollupMetrics.GraphLoadRoute), T("http.request.method", "GET"));
        duration.Record(0.05, T("http.response.status_code", 500), T("http.route", "/api/v1/other"), T("http.request.method", "GET"));
        duration.Record(0.05, T("http.response.status_code", 201), T("http.route", RollupMetrics.GraphLoadRoute), T("http.request.method", "POST"));

        var rows = _recorder.Drain();

        rows.Single(r => r.Metric == "api.requests" && r.Dimension == "class=2xx").Count.Should().Be(4);
        rows.Single(r => r.Metric == "api.requests" && r.Dimension == "class=5xx").Count.Should().Be(1);
        rows.Single(r => r.Metric == "api.latency" && r.Dimension == "le=300,route=search").Count.Should().Be(1, "200 ms is at or under 300 ms");
        rows.Single(r => r.Metric == "api.latency" && r.Dimension == "le=inf,route=search").Count.Should().Be(1, "4 s is above the last bound");
        rows.Single(r => r.Metric == "api.latency" && r.Dimension == "le=100,route=graph_load").Count.Should().Be(1, "only the GET is a graph load");
        rows.Where(r => r.Metric == "api.latency" && r.Dimension.EndsWith("route=all", StringComparison.Ordinal)).Sum(r => r.Count).Should().Be(5);
    }

    [Fact]
    public void NFR_OBS_02_external_latency_is_bucketed_by_source()
    {
        _meter.CreateHistogram<double>("external.request.duration").Record(0.4, T("source", "deezer"), T("status_code", "200"));

        Row("external.latency", "le=0.5,source=deezer").Count.Should().Be(1);
    }

    [Fact]
    public void NFR_OBS_02_draining_takes_everything_and_starts_again_and_restoring_puts_it_back()
    {
        _meter.CreateCounter<long>("cache.lookups").Add(2, T("entity", "recording"), T("result", "hit"));

        var taken = _recorder.Drain();
        _recorder.Drain().Should().BeEmpty();

        _recorder.Restore(taken);
        _meter.CreateCounter<long>("cache.lookups").Add(1, T("entity", "recording"), T("result", "hit"));

        _recorder.Drain().Should().ContainSingle().Which.Count.Should().Be(3, "the restored two and the new one");
    }

    [Fact]
    public void NFR_OBS_02_an_instrument_the_rollup_does_not_keep_is_not_listened_to()
    {
        _meter.CreateCounter<long>("something.else").Add(5);

        _recorder.Drain().Should().BeEmpty();
    }
}
