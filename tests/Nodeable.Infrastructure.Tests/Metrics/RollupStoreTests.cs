using System.Diagnostics.Metrics;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Nodeable.Domain.Entities;
using Nodeable.Infrastructure.Metrics;
using Nodeable.Infrastructure.Persistence;
using Nodeable.Infrastructure.Tests.Crawling;
using Nodeable.Infrastructure.Tests.Graphs;
using Nodeable.Tests.Containers;

namespace Nodeable.Infrastructure.Tests.Metrics;

// NFR-OBS-02: the rollup table, over a real PostgreSQL: that a flush adds, that a fold sums and is repeatable, that
// retention deletes, and that a minute nobody wrote is absent rather than zero.
public class RollupStoreTests(PostgresFixture postgres)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    // A fixed moment on a 5-minute boundary plus a little, so windows are easy to read.
    private static readonly DateTimeOffset _now = new(2026, 10, 16, 12, 7, 30, TimeSpan.Zero);

    private static DateTimeOffset Minute(int hour, int minute) => new(2026, 10, 16, hour, minute, 0, TimeSpan.Zero);

    private static RollupDelta Delta(string metric, string dimension, long count, double? sum = null, double? min = null, double? max = null) =>
        new(metric, dimension, count, sum, min, max);

    private static Task<T> InScope<T>(GraphTestHost host, Func<RollupWriter, RollupMaintenance, NodeableDbContext, Task<T>> action) =>
        host.InScopeAsync(services => action(
            services.GetRequiredService<RollupWriter>(),
            services.GetRequiredService<RollupMaintenance>(),
            services.GetRequiredService<NodeableDbContext>()));

    private static Task<List<MetricRollup>> Rows(GraphTestHost host, string resolution, string? metric = null) =>
        InScope(host, (_, _, db) => db.MetricRollups.AsNoTracking()
            .Where(r => r.Resolution == resolution && (metric == null || r.Metric == metric))
            .OrderBy(r => r.BucketStart).ThenBy(r => r.Dimension)
            .ToListAsync(Ct));

    private static Task<int> Write(GraphTestHost host, DateTimeOffset bucket, params RollupDelta[] deltas) =>
        InScope(host, async (writer, _, _) =>
        {
            await writer.AddAsync(bucket, deltas, Ct);
            return 0;
        });

    private static Task<int> Fold(GraphTestHost host, DateTimeOffset now) =>
        InScope(host, async (_, maintenance, _) =>
        {
            await maintenance.FoldAsync(now, Ct);
            return 0;
        });

    [Fact]
    public async Task NFR_OBS_02_a_flush_adds_to_the_row_that_is_there_and_keeps_the_smallest_and_largest()
    {
        await using var host = await GraphTestHost.CreateAsync(postgres);

        await Write(host, Minute(12, 0), Delta("api.latency", "le=300,route=all", 2, 0.5, 0.1, 0.4));
        await Write(host, Minute(12, 0), Delta("api.latency", "le=300,route=all", 3, 0.9, 0.05, 0.3), Delta("cache.lookups", "entity=work,result=hit", 7));

        var rows = await Rows(host, "1m");
        var latency = rows.Single(r => r.Metric == "api.latency");
        latency.Count.Should().Be(5);
        latency.Sum.Should().BeApproximately(1.4, 1e-9);
        latency.Min.Should().Be(0.05);
        latency.Max.Should().Be(0.4);
        rows.Single(r => r.Metric == "cache.lookups").Count.Should().Be(7);
        rows.Single(r => r.Metric == "cache.lookups").Sum.Should().BeNull("a counter has no sum");
    }

    [Fact]
    public async Task NFR_OBS_02_two_processes_flushing_the_same_minute_do_not_lose_each_others_numbers()
    {
        await using var host = await GraphTestHost.CreateAsync(postgres);

        await Task.WhenAll(Enumerable.Range(0, 8).Select(_ => Write(host, Minute(12, 1), Delta("external.requests", "source=musicbrainz,status=200", 5))));

        (await Rows(host, "1m", "external.requests")).Single().Count.Should().Be(40);
    }

    [Fact]
    public async Task NFR_OBS_02_the_flusher_writes_the_recorders_deltas_into_the_minute_it_is_given_and_empties_the_recorder()
    {
        await using var host = await GraphTestHost.CreateAsync(postgres);
        using var meter = new Meter($"Nodeable.Test.{Guid.NewGuid():N}");
        using var recorder = new RollupRecorder(instrument => instrument.Meter == meter);
        meter.CreateCounter<long>("cache.lookups").Add(4, new KeyValuePair<string, object?>("entity", "recording"), new KeyValuePair<string, object?>("result", "miss"));
        var flusher = new RollupFlusher(recorder, host.Provider.GetRequiredService<IServiceScopeFactory>(), TimeProvider.System, NullLogger<RollupFlusher>.Instance);

        await flusher.FlushAsync(Minute(12, 3), Ct);

        var row = (await Rows(host, "1m", "cache.lookups")).Single();
        (row.BucketStart, row.Dimension, row.Count).Should().Be((Minute(12, 3), "entity=recording,result=miss", 4L));
        recorder.Drain().Should().BeEmpty();
    }

    [Fact]
    public async Task NFR_OBS_02_a_flush_that_cannot_write_keeps_its_numbers_for_the_next_one()
    {
        await using var host = await GraphTestHost.CreateAsync(postgres);
        using var meter = new Meter($"Nodeable.Test.{Guid.NewGuid():N}");
        using var recorder = new RollupRecorder(instrument => instrument.Meter == meter);
        meter.CreateCounter<long>("cache.lookups").Add(4, new KeyValuePair<string, object?>("entity", "recording"), new KeyValuePair<string, object?>("result", "miss"));
        var broken = new ServiceCollection().AddScoped<RollupWriter>(_ => throw new InvalidOperationException("database away")).BuildServiceProvider();
        var failing = new RollupFlusher(recorder, broken.GetRequiredService<IServiceScopeFactory>(), TimeProvider.System, NullLogger<RollupFlusher>.Instance);

        await failing.FlushAsync(Minute(12, 4), Ct);

        recorder.Drain().Should().ContainSingle().Which.Count.Should().Be(4);
    }

    [Fact]
    public async Task NFR_OBS_02_a_fold_sums_counters_and_histogram_buckets_and_takes_the_latest_gauge_sample()
    {
        await using var host = await GraphTestHost.CreateAsync(postgres);
        await Write(host, Minute(12, 0), Delta("external.requests", "source=musicbrainz,status=503", 1), Delta("crawl.queue.wait", "le=600", 2, 100, 20, 80));
        await Write(host, Minute(12, 2), Delta("external.requests", "source=musicbrainz,status=503", 4), Delta("crawl.queue.wait", "le=600", 1, 30, 30, 30));
        await InScope(host, async (writer, _, _) =>
        {
            await writer.SetGaugeAsync(Minute(12, 0), "queue.depth", "status=pending", 9, Ct);
            await writer.SetGaugeAsync(Minute(12, 3), "queue.depth", "status=pending", 4, Ct);
            return 0;
        });

        await Fold(host, _now.AddMinutes(1));

        var five = await Rows(host, "5m");
        five.Should().OnlyContain(r => r.BucketStart == Minute(12, 0));
        five.Single(r => r.Metric == "external.requests").Count.Should().Be(5);
        var wait = five.Single(r => r.Metric == "crawl.queue.wait");
        (wait.Count, wait.Sum, wait.Min, wait.Max).Should().Be((3L, 130.0, 20.0, 80.0));
        var depth = five.Single(r => r.Metric == "queue.depth");
        depth.Last.Should().Be(4, "the latest sample of the window");
        (depth.Min, depth.Max, depth.Count).Should().Be((4.0, 9.0, 2L));
    }

    [Fact]
    public async Task NFR_OBS_02_folding_again_gives_the_same_rows_and_a_late_flush_is_picked_up()
    {
        await using var host = await GraphTestHost.CreateAsync(postgres);
        await Write(host, Minute(12, 0), Delta("cache.lookups", "entity=work,result=hit", 10));

        await Fold(host, _now.AddMinutes(1));
        await Fold(host, _now.AddMinutes(1));
        (await Rows(host, "5m", "cache.lookups")).Single().Count.Should().Be(10, "the row is replaced, never added to");

        await Write(host, Minute(12, 1), Delta("cache.lookups", "entity=work,result=hit", 5));
        await Fold(host, _now.AddMinutes(2));
        (await Rows(host, "5m", "cache.lookups")).Single().Count.Should().Be(15);
    }

    [Fact]
    public async Task NFR_OBS_02_a_window_that_has_not_ended_is_not_folded_yet()
    {
        await using var host = await GraphTestHost.CreateAsync(postgres);
        await Write(host, Minute(12, 6), Delta("cache.lookups", "entity=work,result=hit", 3));

        await Fold(host, Minute(12, 7).AddSeconds(30));

        (await Rows(host, "5m")).Should().BeEmpty("12:05 to 12:10 is still in progress");
    }

    [Fact]
    public async Task NFR_OBS_02_a_minute_nobody_wrote_has_no_row_so_it_is_missing_and_not_zero()
    {
        await using var host = await GraphTestHost.CreateAsync(postgres);
        await Write(host, Minute(12, 0), Delta("external.requests", "source=musicbrainz,status=200", 1));
        await Write(host, Minute(12, 2), Delta("external.requests", "source=musicbrainz,status=200", 1));

        var minutes = (await Rows(host, "1m", "external.requests")).Select(r => r.BucketStart.Minute).ToList();

        minutes.Should().Equal(0, 2);
    }

    [Fact]
    public async Task NFR_OBS_02_retention_deletes_one_minute_rows_after_7_days_and_five_minute_rows_after_90()
    {
        await using var host = await GraphTestHost.CreateAsync(postgres);
        await host.SeedAsync(db =>
        {
            db.MetricRollups.AddRange(
                Row("1m", _now.AddDays(-7).AddMinutes(-1), "old-1m"),
                Row("1m", _now.AddDays(-6), "new-1m"),
                Row("5m", _now.AddDays(-90).AddMinutes(-1), "old-5m"),
                Row("5m", _now.AddDays(-80), "new-5m"),
                Row("5m", _now.AddDays(-8), "five-minute-row-kept-past-the-one-minute-limit"));
            return Task.CompletedTask;
        });

        await InScope(host, async (_, maintenance, _) =>
        {
            await maintenance.PruneAsync(_now, Ct);
            return 0;
        });

        var left = (await Rows(host, "1m")).Concat(await Rows(host, "5m")).Select(r => r.Metric).ToList();
        left.Should().BeEquivalentTo("new-1m", "new-5m", "five-minute-row-kept-past-the-one-minute-limit");

        static MetricRollup Row(string resolution, DateTimeOffset bucket, string metric) =>
            new() { Resolution = resolution, BucketStart = bucket, Metric = metric, Dimension = string.Empty, Count = 1 };
    }

    [Fact]
    public async Task NFR_OBS_04_the_queue_sample_has_depth_by_status_and_the_age_of_the_oldest_job_that_is_ready()
    {
        await using var host = await GraphTestHost.CreateAsync(postgres);
        await CrawlTestSupport.SqlAsync(
            host.ConnectionString,
            $"""
            INSERT INTO crawl_jobs (kind, target_mbid, priority, status, attempts, run_after) VALUES
              ('recording', {Guid.NewGuid()}, 10, 'pending', 0, {_now.AddSeconds(-90)}),
              ('recording', {Guid.NewGuid()}, 10, 'pending', 0, {_now.AddSeconds(-30)}),
              ('work', {Guid.NewGuid()}, 10, 'pending', 0, {_now.AddMinutes(40)}),
              ('release', {Guid.NewGuid()}, 10, 'running', 1, {_now.AddSeconds(-500)})
            """);

        await InScope(host, async (_, maintenance, _) =>
        {
            await maintenance.SampleQueueAsync(_now, Ct);
            return 0;
        });

        var rows = await Rows(host, "1m");
        rows.Single(r => r.Metric == "queue.depth" && r.Dimension == "status=pending").Last.Should().Be(3);
        rows.Single(r => r.Metric == "queue.depth" && r.Dimension == "status=running").Last.Should().Be(1);
        rows.Single(r => r.Metric == "queue.oldest_pending").Last.Should().Be(90, "the delayed job is not ready yet and does not count as waiting");
        rows.Should().OnlyContain(r => r.BucketStart == Minute(12, 7));
    }

    [Fact]
    public async Task NFR_OBS_04_an_empty_queue_is_measured_as_zero_not_left_out()
    {
        await using var host = await GraphTestHost.CreateAsync(postgres);

        await InScope(host, async (_, maintenance, _) =>
        {
            await maintenance.SampleQueueAsync(_now, Ct);
            return 0;
        });

        var rows = await Rows(host, "1m");
        rows.Should().HaveCount(3);
        rows.Should().OnlyContain(r => r.Last == 0);
    }
}
