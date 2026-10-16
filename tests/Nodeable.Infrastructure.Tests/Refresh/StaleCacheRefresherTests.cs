using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Nodeable.Domain.Crawling;
using Nodeable.Domain.Entities;
using Nodeable.Domain.Enums;
using Nodeable.Infrastructure.Crawling;
using Nodeable.Infrastructure.Persistence;
using Nodeable.Infrastructure.Refresh;
using Nodeable.Infrastructure.Tests.Crawling;
using Nodeable.Infrastructure.Tests.Graphs;
using Nodeable.Tests.Containers;

namespace Nodeable.Infrastructure.Tests.Refresh;

// NFR-REL-03: the selection half of the 30-day refresh, over a real PostgreSQL and the real crawl queue. The fetches it
// queues are run by the Worker's handlers (CreditIngestionTests covers what a refetch changes).
public class StaleCacheRefresherTests(PostgresFixture postgres)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static Guid Id(int n) => Guid.Parse($"00000000-0000-4000-8000-{n:D12}");

    private static async Task<int> Run(GraphTestHost host, RefreshOptions? options = null) =>
        await host.InScopeAsync(async services =>
            await new StaleCacheRefresher(
                services.GetRequiredService<NodeableDbContext>(),
                services.GetRequiredService<ICrawlQueue>(),
                Options.Create(options ?? new RefreshOptions { IsrcBackfillBefore = null })).RunAsync(Ct));

    private static Task AgeRecording(GraphTestHost host, Guid mbid, int days) =>
        CrawlTestSupport.SqlAsync(host.ConnectionString, $"UPDATE recordings SET fetched_at = now() - ({days} * interval '1 day') WHERE mbid = {mbid}");

    private static Task AgeWork(GraphTestHost host, Guid mbid, int days) =>
        CrawlTestSupport.SqlAsync(host.ConnectionString, $"UPDATE works SET fetched_at = now() - ({days} * interval '1 day') WHERE mbid = {mbid}");

    private static Task AgeRelease(GraphTestHost host, Guid mbid, int days) =>
        CrawlTestSupport.SqlAsync(host.ConnectionString, $"UPDATE releases SET fetched_at = now() - ({days} * interval '1 day') WHERE mbid = {mbid}");

    private async Task<GraphTestHost> HostAsync() => await GraphTestHost.CreateAsync(postgres);

    private static async Task SeedRelease(GraphTestHost host, Guid mbid) =>
        await host.SeedAsync(db =>
        {
            db.Releases.Add(new Release { Mbid = mbid, Title = "Album", FetchedAt = DateTimeOffset.UtcNow });
            return Task.CompletedTask;
        });

    [Fact]
    public async Task NFR_REL_03_a_recording_work_or_release_older_than_30_days_is_queued_at_the_scheduled_priority()
    {
        await using var host = await HostAsync();
        await host.SeedRecordingAsync(Id(1), "Old recording", "Band");
        await host.SeedRecordingAsync(Id(2), "Fresh recording", "Band");
        await host.SeedWorkAsync(Id(3), Id(1));
        await SeedRelease(host, Id(4));
        await AgeRecording(host, Id(1), 31);
        await AgeWork(host, Id(3), 45);
        await AgeRelease(host, Id(4), 90);
        await AgeRecording(host, Id(2), 29);

        var queued = await Run(host);

        queued.Should().Be(3);
        var jobs = await CrawlTestSupport.JobsAsync(host.ConnectionString);
        jobs.Select(j => (j.Kind, j.TargetMbid)).Should().BeEquivalentTo(
            new[] { (CrawlJobKind.Recording, Id(1)), (CrawlJobKind.Work, Id(3)), (CrawlJobKind.Release, Id(4)) });
        jobs.Should().OnlyContain(j => j.Priority == CrawlPriority.Scheduled && j.Status == CrawlJobStatus.Pending);
    }

    [Fact]
    public async Task NFR_REL_03_a_run_queues_the_oldest_first_and_no_more_than_its_batch()
    {
        await using var host = await HostAsync();
        for (var n = 1; n <= 5; n++)
        {
            await host.SeedRecordingAsync(Id(n), $"Song {n}", "Band");
            await AgeRecording(host, Id(n), 30 + n);
        }

        var queued = await Run(host, new RefreshOptions { BatchPerRun = 2, IsrcBackfillBefore = null });

        queued.Should().Be(2);
        (await CrawlTestSupport.JobsAsync(host.ConnectionString)).Select(j => j.TargetMbid).Should().BeEquivalentTo([Id(5), Id(4)]);
    }

    [Fact]
    public async Task NFR_REL_03_a_second_run_does_not_queue_a_row_whose_fetch_is_already_waiting_so_the_next_oldest_are_taken()
    {
        await using var host = await HostAsync();
        for (var n = 1; n <= 4; n++)
        {
            await host.SeedRecordingAsync(Id(n), $"Song {n}", "Band");
            await AgeRecording(host, Id(n), 30 + n);
        }

        var options = new RefreshOptions { BatchPerRun = 2, IsrcBackfillBefore = null };
        await Run(host, options);
        await Run(host, options);

        (await CrawlTestSupport.JobsAsync(host.ConnectionString)).Select(j => j.TargetMbid).Should().BeEquivalentTo([Id(4), Id(3), Id(2), Id(1)]);
    }

    [Fact]
    public async Task NFR_REL_03_a_row_whose_fetch_failed_for_good_within_the_window_is_left_alone()
    {
        await using var host = await HostAsync();
        await host.SeedRecordingAsync(Id(1), "Deleted at MusicBrainz", "Band");
        await AgeRecording(host, Id(1), 40);
        await host.EnqueueAsync(CrawlJobKind.Recording, Id(1));
        await host.SetJobStatusAsync(CrawlJobKind.Recording, Id(1), CrawlJobStatus.Failed);

        (await Run(host)).Should().Be(0);
    }

    [Fact]
    public async Task NFR_REL_03_each_queued_fetch_waits_a_random_time_inside_the_window()
    {
        await using var host = await HostAsync();
        for (var n = 1; n <= 6; n++)
        {
            await host.SeedRecordingAsync(Id(n), $"Song {n}", "Band");
            await AgeRecording(host, Id(n), 40);
        }

        await Run(host, new RefreshOptions { MaxDelay = TimeSpan.FromMinutes(50), IsrcBackfillBefore = null });

        var waits = (await CrawlTestSupport.JobsAsync(host.ConnectionString)).Select(j => (j.RunAfter - DateTimeOffset.UtcNow).TotalMinutes).ToList();
        waits.Should().OnlyContain(w => w > -1 && w <= 50, "no fetch is claimed later than the window");
        waits.Distinct().Should().HaveCountGreaterThan(1, "the delays are spread, not one fixed number");
    }

    [Fact]
    public async Task NFR_REL_03_a_recording_stored_before_isrcs_were_kept_is_refreshed_even_when_young_and_only_once()
    {
        await using var host = await HostAsync();
        var cutoff = DateTimeOffset.UtcNow.AddDays(1);
        await host.SeedRecordingAsync(Id(1), "No ISRC yet", "Band");
        await host.SeedRecordingAsync(Id(2), "Has an ISRC", "Band");
        await host.SeedAsync(async db => (await db.Recordings.SingleAsync(r => r.Mbid == Id(2), Ct)).Isrcs = ["USUM71612345"]);

        var options = new RefreshOptions { IsrcBackfillBefore = cutoff };
        var queued = await Run(host, options);

        queued.Should().Be(1);
        (await CrawlTestSupport.JobsAsync(host.ConnectionString)).Should().ContainSingle().Which.TargetMbid.Should().Be(Id(1));

        // The refetch rewrites fetched_at; a row fetched after the cut-off is no longer a backfill candidate.
        var later = new RefreshOptions { IsrcBackfillBefore = DateTimeOffset.UtcNow.AddDays(-1) };
        await CrawlTestSupport.SqlAsync(host.ConnectionString, $"DELETE FROM crawl_jobs");
        (await Run(host, later)).Should().Be(0);
    }
}
