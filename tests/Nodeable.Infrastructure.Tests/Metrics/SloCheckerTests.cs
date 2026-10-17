using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Nodeable.Domain.Entities;
using Nodeable.Infrastructure.Metrics;
using Nodeable.Infrastructure.Persistence;
using Nodeable.Infrastructure.Tests.Graphs;
using Nodeable.Tests.Containers;

namespace Nodeable.Infrastructure.Tests.Metrics;

// NFR-OBS-04: the daily SLO check, over a real PostgreSQL. Each objective is worked out from counted buckets, so each test
// puts counts on either side of a limit and checks which side the check lands on.
public class SloCheckerTests(PostgresFixture postgres)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static readonly DateTimeOffset _now = new(2026, 10, 12, 12, 0, 0, TimeSpan.Zero);

    private static MetricRollup Row(string metric, string dimension, long count, int daysAgo = 3, string resolution = "5m") =>
        new() { Resolution = resolution, BucketStart = _now.AddDays(-daysAgo), Metric = metric, Dimension = dimension, Count = count };

    private sealed class CapturingLogger : ILogger<SloChecker>
    {
        public List<(LogLevel Level, string Message)> Entries { get; } = [];

        public IDisposable? BeginScope<TState>(TState state)
            where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter) =>
            Entries.Add((logLevel, formatter(state, exception)));
    }

    private static async Task<(IReadOnlyList<SloCheck> Checks, CapturingLogger Log)> Check(GraphTestHost host, params MetricRollup[] rows)
    {
        await host.SeedAsync(db =>
        {
            db.MetricRollups.AddRange(rows);
            return Task.CompletedTask;
        });

        var log = new CapturingLogger();
        var checks = await host.InScopeAsync(services => new SloChecker(services.GetRequiredService<NodeableDbContext>(), host.Time, log).RunAsync(Ct));
        return (checks, log);
    }

    private static SloCheck For(IReadOnlyList<SloCheck> checks, string slo) => checks.Single(c => c.Slo == slo);

    [Fact]
    public async Task NFR_OBS_04_availability_is_the_share_of_requests_that_were_not_5xx_and_breaches_below_99_5_percent()
    {
        await using var host = await GraphTestHost.CreateAsync(postgres);

        var (ok, _) = await Check(host, Row(RollupMetrics.ApiRequests, "class=2xx", 996), Row(RollupMetrics.ApiRequests, "class=5xx", 4));
        For(ok, SloDefinitions.ApiAvailability).Observed.Should().BeApproximately(0.996, 1e-9);
        For(ok, SloDefinitions.ApiAvailability).Breached.Should().BeFalse();

        await using var other = await GraphTestHost.CreateAsync(postgres);
        var (bad, log) = await Check(other, Row(RollupMetrics.ApiRequests, "class=2xx", 994), Row(RollupMetrics.ApiRequests, "class=5xx", 6));
        For(bad, SloDefinitions.ApiAvailability).Breached.Should().BeTrue();
        log.Entries.Should().Contain(e => e.Level == LogLevel.Warning && e.Message.Contains(SloDefinitions.ApiAvailability, StringComparison.Ordinal));
    }

    [Fact]
    public async Task NFR_OBS_04_exactly_on_a_target_is_a_pass_for_the_at_least_objectives()
    {
        await using var host = await GraphTestHost.CreateAsync(postgres);

        // 95 of 100 searches at or under 1 s is exactly 95 percent: the target is met, not breached.
        var (checks, _) = await Check(
            host,
            Row(RollupMetrics.ApiLatency, "le=1000,route=search", 95),
            Row(RollupMetrics.ApiLatency, "le=3000,route=search", 4),
            Row(RollupMetrics.ApiLatency, "le=inf,route=search", 1));

        For(checks, SloDefinitions.SearchLatency).Observed.Should().Be(0.95);
        For(checks, SloDefinitions.SearchLatency).Breached.Should().BeFalse();
    }

    [Fact]
    public async Task NFR_OBS_04_search_and_graph_load_are_judged_on_their_own_routes_and_their_own_bounds()
    {
        await using var host = await GraphTestHost.CreateAsync(postgres);

        var (checks, _) = await Check(
            host,
            Row(RollupMetrics.ApiLatency, "le=100,route=search", 50),
            Row(RollupMetrics.ApiLatency, "le=300,route=search", 25),
            Row(RollupMetrics.ApiLatency, "le=1000,route=search", 20),
            Row(RollupMetrics.ApiLatency, "le=3000,route=search", 5),
            Row(RollupMetrics.ApiLatency, "le=100,route=graph_load", 80),
            Row(RollupMetrics.ApiLatency, "le=300,route=graph_load", 10),
            Row(RollupMetrics.ApiLatency, "le=1000,route=graph_load", 10),
            Row(RollupMetrics.ApiLatency, "le=100,route=all", 5000));

        For(checks, SloDefinitions.SearchLatency).Observed.Should().Be(0.95, "100 + 300 + 1000 ms buckets are under 1 s");
        For(checks, SloDefinitions.GraphLoadLatency).Observed.Should().Be(0.9, "only 100 and 300 ms buckets are under 300 ms");
        For(checks, SloDefinitions.GraphLoadLatency).Breached.Should().BeTrue();
    }

    [Fact]
    public async Task NFR_OBS_04_crawl_freshness_counts_jobs_claimed_within_600_seconds_by_the_queue_wait_bound()
    {
        await using var host = await GraphTestHost.CreateAsync(postgres);

        var (checks, _) = await Check(
            host,
            Row(RollupMetrics.CrawlQueueWait, "le=10", 980),
            Row(RollupMetrics.CrawlQueueWait, "le=600", 10),
            Row(RollupMetrics.CrawlQueueWait, "le=inf", 10));

        For(checks, SloDefinitions.CrawlFreshness).Observed.Should().Be(0.99);
        For(checks, SloDefinitions.CrawlFreshness).Breached.Should().BeFalse();
    }

    [Theory]
    [InlineData(99, 1, true)]
    [InlineData(991, 9, false)]
    public async Task NFR_OBS_04_the_musicbrainz_503_rate_is_a_breach_at_one_percent_and_not_below(long ok, long unavailable, bool breached)
    {
        await using var host = await GraphTestHost.CreateAsync(postgres);

        var (checks, _) = await Check(
            host,
            Row(RollupMetrics.ExternalRequests, "source=musicbrainz,status=200", ok),
            Row(RollupMetrics.ExternalRequests, "source=musicbrainz,status=503", unavailable),
            Row(RollupMetrics.ExternalRequests, "source=deezer,status=503", 5000));

        For(checks, SloDefinitions.MusicBrainz503Rate).Breached.Should().Be(breached);
        For(checks, SloDefinitions.MusicBrainz503Rate).Observed.Should().BeApproximately((double)unavailable / (ok + unavailable), 1e-9, "Deezer's 503s are not MusicBrainz's");
    }

    [Fact]
    public async Task NFR_OBS_04_with_no_data_an_objective_is_unmeasured_and_not_a_breach_and_a_row_is_still_written()
    {
        await using var host = await GraphTestHost.CreateAsync(postgres);

        var (checks, log) = await Check(host);

        checks.Should().HaveCount(5);
        checks.Should().OnlyContain(c => c.Observed == null && !c.Breached && c.WindowDays == 30);
        log.Entries.Should().NotContain(e => e.Level == LogLevel.Warning);
        (await host.InScopeAsync(services => services.GetRequiredService<NodeableDbContext>().SloChecks.CountAsync(Ct))).Should().Be(5);
    }

    [Fact]
    public async Task NFR_OBS_04_only_the_last_30_days_of_five_minute_rows_are_counted()
    {
        await using var host = await GraphTestHost.CreateAsync(postgres);

        var (checks, _) = await Check(
            host,
            Row(RollupMetrics.ApiRequests, "class=2xx", 100, daysAgo: 5),
            Row(RollupMetrics.ApiRequests, "class=5xx", 900, daysAgo: 31),
            Row(RollupMetrics.ApiRequests, "class=5xx", 900, daysAgo: 2, resolution: "1m"));

        For(checks, SloDefinitions.ApiAvailability).Observed.Should().Be(1.0, "a 31-day-old row and the 1-minute rows are not in the window");
    }

    [Fact]
    public void NFR_OBS_04_an_unmeasured_objective_is_never_breached_whichever_side_is_good()
    {
        SloDefinitions.All.Should().OnlyContain(slo => !slo.IsBreachedBy(null));
        SloDefinitions.All.Select(s => s.Id).Should().OnlyHaveUniqueItems();
    }
}
