using Microsoft.Extensions.DependencyInjection;
using Nodeable.Domain.Entities;
using Nodeable.Infrastructure.Metrics;
using Nodeable.Infrastructure.Persistence;
using Nodeable.Infrastructure.Tests.Graphs;
using Nodeable.Tests.Containers;

namespace Nodeable.Infrastructure.Tests.Metrics;

// NFR-OBS-03: the status page's data, over a real PostgreSQL. The clock is the test host's fixed one (2026-10-12 12:00 UTC),
// so every window is easy to read.
public class StatusMetricsReaderTests(PostgresFixture postgres)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static readonly DateTimeOffset _now = new(2026, 10, 12, 12, 0, 0, TimeSpan.Zero);

    private static DateTimeOffset At(int minutesAgo) => _now.AddMinutes(-minutesAgo);

    private static MetricRollup Row(string resolution, DateTimeOffset bucket, string metric, string dimension, long count, double? last = null) =>
        new() { Resolution = resolution, BucketStart = bucket, Metric = metric, Dimension = dimension, Count = count, Last = last, Sum = last };

    private static Task Seed(GraphTestHost host, params MetricRollup[] rows) =>
        host.SeedAsync(db =>
        {
            db.MetricRollups.AddRange(rows);
            return Task.CompletedTask;
        });

    private static Task<MetricsResponse> Read(GraphTestHost host, DateTimeOffset from, DateTimeOffset to, int width, MetricsScope scope) =>
        host.InScopeAsync(services => services.GetRequiredService<StatusMetricsReader>().GetAsync(from, to, width, scope, Ct));

    private static MetricSeries Series(MetricsResponse response, string id) => response.Series.Single(s => s.Id == id);

    [Fact]
    public async Task NFR_OBS_03_a_window_is_cut_into_no_more_steps_than_the_width_and_every_series_has_a_value_for_every_time()
    {
        await using var host = await GraphTestHost.CreateAsync(postgres);
        await Seed(host, Row("1m", At(30), RollupMetrics.ProcessUp, "process=api", 1));

        var response = await Read(host, At(60), _now, 10, MetricsScope.Private);

        response.StepSeconds.Should().Be(6 * 60);
        response.Times.Should().HaveCount(10);
        response.Resolution.Should().Be("1m");
        response.Series.Should().OnlyContain(s => s.Points.Count == response.Times.Count);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(17)]
    [InlineData(59)]
    public async Task NFR_OBS_03_a_start_that_is_not_on_a_minute_never_adds_a_step_beyond_the_width(int secondsPastTheMinute)
    {
        await using var host = await GraphTestHost.CreateAsync(postgres);

        var response = await Read(host, At(60).AddSeconds(secondsPastTheMinute), _now.AddSeconds(secondsPastTheMinute), 30, MetricsScope.Public);

        response.Times.Count.Should().BeLessThanOrEqualTo(30);
    }

    [Fact]
    public async Task NFR_OBS_03_a_minute_the_process_was_up_with_no_requests_is_zero_and_a_minute_it_was_not_there_is_null()
    {
        await using var host = await GraphTestHost.CreateAsync(postgres);
        await Seed(
            host,
            Row("1m", At(5), RollupMetrics.ProcessUp, "process=api", 1),
            Row("1m", At(5), RollupMetrics.ApiRequests, "class=2xx", 7),
            Row("1m", At(4), RollupMetrics.ProcessUp, "process=api", 1),
            // nothing at all for At(3): the Api was not running
            Row("1m", At(2), RollupMetrics.ProcessUp, "process=api", 1),
            Row("1m", At(2), RollupMetrics.ApiRequests, "class=5xx", 1));

        var response = await Read(host, At(6), At(1), 600, MetricsScope.Private);

        var requests = Series(response, "api.requests").Points;
        requests.Should().Equal(null, 7, 0, null, 1);
        Series(response, "api.errors").Points.Should().Equal(null, 0, 0, null, 1);
    }

    [Fact]
    public async Task NFR_OBS_03_a_ratio_is_null_when_nothing_was_counted_to_divide_by()
    {
        await using var host = await GraphTestHost.CreateAsync(postgres);
        await Seed(
            host,
            Row("1m", At(3), RollupMetrics.ProcessUp, "process=worker", 1),
            Row("1m", At(2), RollupMetrics.ProcessUp, "process=worker", 1),
            Row("1m", At(2), RollupMetrics.CacheLookups, "entity=work,result=hit", 3),
            Row("1m", At(2), RollupMetrics.CacheLookups, "entity=work,result=miss", 1));

        var response = await Read(host, At(3), At(1), 600, MetricsScope.Public);

        Series(response, "cache.hitRatio").Points.Should().Equal(null, 0.75);
        Series(response, "cache.hit").Points.Should().Equal(0, 3);
    }

    [Fact]
    public async Task NFR_OBS_03_the_musicbrainz_503_rate_is_the_share_of_its_requests_and_other_sources_are_left_out()
    {
        await using var host = await GraphTestHost.CreateAsync(postgres);
        await Seed(
            host,
            Row("1m", At(2), RollupMetrics.ProcessUp, "process=worker", 1),
            Row("1m", At(2), RollupMetrics.ExternalRequests, "source=musicbrainz,status=200", 9),
            Row("1m", At(2), RollupMetrics.ExternalRequests, "source=musicbrainz,status=503", 1),
            Row("1m", At(2), RollupMetrics.ExternalRequests, "source=deezer,status=503", 50));

        var response = await Read(host, At(2), At(1), 600, MetricsScope.Public);

        Series(response, "mb.rate503").Points.Should().ContainSingle().Which.Should().Be(0.1);
        Series(response, "mb.requests.2xx").Points.Should().ContainSingle().Which.Should().Be(9);
        Series(response, "mb.requests.5xx").Points.Should().ContainSingle().Which.Should().Be(1);
    }

    [Fact]
    public async Task NFR_OBS_03_gauges_show_the_sampled_value_and_a_minute_without_a_sample_is_null()
    {
        await using var host = await GraphTestHost.CreateAsync(postgres);
        await Seed(
            host,
            Row("1m", At(3), RollupMetrics.QueueDepth, "status=pending", 1, 12),
            Row("1m", At(1), RollupMetrics.QueueDepth, "status=pending", 1, 0));

        var response = await Read(host, At(3), At(0), 600, MetricsScope.Public);

        Series(response, "queue.depth").Points.Should().Equal(12, null, 0);
    }

    [Fact]
    public async Task NFR_OBS_03_the_public_answer_has_the_crawlers_series_only_and_no_slos_heatmap_or_api_numbers()
    {
        await using var host = await GraphTestHost.CreateAsync(postgres);

        var response = await Read(host, At(60), _now, 60, MetricsScope.Public);

        response.Series.Select(s => s.Id).Should().NotContain(id => id.StartsWith("api.", StringComparison.Ordinal) || id.StartsWith("preview.", StringComparison.Ordinal));
        response.Series.Select(s => s.Id).Should().Contain(["queue.depth", "jobs.done", "mb.rate503", "cache.hitRatio"]);
        response.Heatmap.Should().BeNull();
        response.Slos.Should().BeNull();
        response.Breaches.Should().BeNull();
    }

    [Fact]
    public async Task NFR_OBS_03_the_private_answer_has_the_musicbrainz_latency_heatmap_by_time_and_bound()
    {
        await using var host = await GraphTestHost.CreateAsync(postgres);
        await Seed(
            host,
            Row("1m", At(2), RollupMetrics.ExternalLatency, "le=0.5,source=musicbrainz", 4),
            Row("1m", At(2), RollupMetrics.ExternalLatency, "le=inf,source=musicbrainz", 1),
            Row("1m", At(1), RollupMetrics.ExternalLatency, "le=0.5,source=musicbrainz", 2),
            Row("1m", At(1), RollupMetrics.ExternalLatency, "le=0.25,source=deezer", 99));

        var response = await Read(host, At(2), At(0), 600, MetricsScope.Private);

        response.Heatmap!.Bounds.Should().Equal("0.25", "0.5", "1", "2", "5", "inf");
        response.Heatmap.Cells.Select(c => (c[0], c[1], c[2])).Should().BeEquivalentTo([(0, 1, 4), (0, 5, 1), (1, 1, 2)], "Deezer is not in the MusicBrainz heatmap");
    }

    [Fact]
    public async Task NFR_OBS_03_the_private_answer_lists_every_slo_with_its_threshold_even_before_a_check_and_marks_breaches()
    {
        await using var host = await GraphTestHost.CreateAsync(postgres);
        var before = await Read(host, At(60), _now, 60, MetricsScope.Private);
        before.Slos!.Should().HaveCount(5);
        before.Slos!.Should().OnlyContain(s => s.Observed == null && !s.Breached && s.CheckedAt == null);

        await host.SeedAsync(db =>
        {
            db.SloChecks.Add(new SloCheck { CheckedAt = At(30), Slo = SloDefinitions.SearchLatency, WindowDays = 30, Observed = 0.93, Target = 0.95, Breached = true });
            db.SloChecks.Add(new SloCheck { CheckedAt = At(30), Slo = SloDefinitions.MusicBrainz503Rate, WindowDays = 30, Observed = 0.02, Target = 0.01, Breached = true });
            db.SloChecks.Add(new SloCheck { CheckedAt = At(30), Slo = SloDefinitions.ApiAvailability, WindowDays = 30, Observed = 0.999, Target = 0.995, Breached = false });
            return Task.CompletedTask;
        });

        var after = await Read(host, At(60), _now, 60, MetricsScope.Private);

        after.Slos!.Single(s => s.Slo == SloDefinitions.SearchLatency).Should().Match<SloStatus>(s => s.Observed == 0.93 && s.Breached && s.Target == 0.95);
        after.Breaches!.Select(b => b.Text).Should().BeEquivalentTo(["Search latency (under 1 s) 93%, target 95%", "MusicBrainz 503 rate 2%, limit 1%"]);
    }

    [Fact]
    public async Task NFR_OBS_03_a_window_that_starts_before_the_one_minute_rows_reach_is_read_from_the_five_minute_rows()
    {
        await using var host = await GraphTestHost.CreateAsync(postgres);
        var tenDaysAgo = _now.AddDays(-10);
        await Seed(
            host,
            Row("5m", tenDaysAgo, RollupMetrics.ProcessUp, "process=worker", 5),
            Row("5m", tenDaysAgo, RollupMetrics.CrawlJobs, "outcome=done", 40),
            Row("1m", tenDaysAgo, RollupMetrics.CrawlJobs, "outcome=done", 1000));

        var response = await Read(host, tenDaysAgo, tenDaysAgo.AddHours(1), 12, MetricsScope.Public);

        response.Resolution.Should().Be("5m");
        response.StepSeconds.Should().Be(5 * 60);
        Series(response, "jobs.done").Points[0].Should().Be(40);
    }

    [Fact]
    public async Task NFR_OBS_03_the_crawl_figures_are_null_while_unmeasured_and_computed_from_the_rollup_when_there_is_data()
    {
        await using var host = await GraphTestHost.CreateAsync(postgres);
        var empty = await host.InScopeAsync(services => services.GetRequiredService<StatusMetricsReader>().GetCrawlFiguresAsync(Ct));
        empty.Should().Be((null, null));

        await Seed(
            host,
            Row("1m", At(2), RollupMetrics.ProcessUp, "process=worker", 1),
            Row("1m", At(2), RollupMetrics.ExternalRequests, "source=musicbrainz,status=200", 25),
            Row("1m", At(20), RollupMetrics.ExternalRequests, "source=musicbrainz,status=200", 500),
            Row("1m", At(2), RollupMetrics.CacheLookups, "entity=recording,result=hit", 3),
            Row("1m", At(30), RollupMetrics.CacheLookups, "entity=recording,result=miss", 1));

        var figures = await host.InScopeAsync(services => services.GetRequiredService<StatusMetricsReader>().GetCrawlFiguresAsync(Ct));

        figures.FetchRatePerMinute.Should().Be(2.5, "25 requests in the last 10 minutes; the 500 at 20 minutes ago is outside");
        figures.CacheHitRatio.Should().Be(0.75);
    }

    [Fact]
    public async Task NFR_OBS_03_a_worker_with_a_heartbeat_and_no_requests_has_a_fetch_rate_of_zero_not_null()
    {
        await using var host = await GraphTestHost.CreateAsync(postgres);
        await Seed(host, Row("1m", At(2), RollupMetrics.ProcessUp, "process=worker", 1));

        var figures = await host.InScopeAsync(services => services.GetRequiredService<StatusMetricsReader>().GetCrawlFiguresAsync(Ct));

        figures.FetchRatePerMinute.Should().Be(0);
        figures.CacheHitRatio.Should().BeNull("no lookup was made, so there is no ratio");
    }
}
