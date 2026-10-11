using Microsoft.EntityFrameworkCore;
using Nodeable.Domain.Crawling;
using Nodeable.Domain.Entities;
using Nodeable.Domain.Enums;
using Nodeable.Infrastructure.Crawling;
using Nodeable.Tests.Containers;
using static Nodeable.Infrastructure.Tests.Crawling.CrawlTestSupport;

namespace Nodeable.Infrastructure.Tests.Crawling;

// Decision 0009: the Api's half of adding a song queues exactly one job, the recording fetch.
public class SongIngestionServiceTests(PostgresFixture postgres)
{
    [Fact]
    public async Task FR_GRAPH_03_a_new_song_is_recorded_and_one_recording_fetch_is_queued_at_interactive_priority()
    {
        var ct = TestContext.Current.CancellationToken;
        var connectionString = await NewDatabaseAsync(postgres);
        await using var db = Context(connectionString);
        var service = new SongIngestionService(db, Queue(db));

        var result = await service.RequestAsync(Mbid(1), "Redbone", "Childish Gambino", ct);

        result.Should().Be(IngestionRequestResult.Queued);
        var recording = await Context(connectionString).Recordings.AsNoTracking().SingleAsync(ct);
        recording.Title.Should().Be("Redbone");
        recording.ArtistCredit.Should().Be("Childish Gambino");
        recording.CreditsStatus.Should().Be(CreditsStatus.None);

        var job = (await JobsAsync(connectionString)).Should().ContainSingle().Subject;
        job.Kind.Should().Be(CrawlJobKind.Recording);
        job.TargetMbid.Should().Be(Mbid(1));
        job.Priority.Should().Be(CrawlPriority.Interactive);
    }

    [Fact]
    public async Task FR_GRAPH_03_the_api_never_queues_work_release_or_preview_jobs()
    {
        var ct = TestContext.Current.CancellationToken;
        var connectionString = await NewDatabaseAsync(postgres);
        await using var db = Context(connectionString);
        var service = new SongIngestionService(db, Queue(db));

        await service.RequestAsync(Mbid(1), "Redbone", "Childish Gambino", ct);
        await service.RequestAsync(Mbid(2), "Me and Your Mama", "Childish Gambino", ct);

        // Their MBIDs are only known from the recording's response, so the Worker queues them (decision 0009).
        (await JobsAsync(connectionString)).Select(j => j.Kind).Should().OnlyContain(kind => kind == CrawlJobKind.Recording);
    }

    [Fact]
    public async Task NFR_REL_01_asking_again_while_the_fetch_is_outstanding_does_not_queue_a_second_one()
    {
        var ct = TestContext.Current.CancellationToken;
        var connectionString = await NewDatabaseAsync(postgres);
        await using var db = Context(connectionString);
        var service = new SongIngestionService(db, Queue(db));
        await service.RequestAsync(Mbid(1), "Redbone", "Childish Gambino", ct);

        var second = await service.RequestAsync(Mbid(1), "Redbone", "Childish Gambino", ct);

        second.Should().Be(IngestionRequestResult.AlreadyQueued);
        (await JobsAsync(connectionString)).Should().ContainSingle();
    }

    [Theory]
    [InlineData(CreditsStatus.Complete)]
    [InlineData(CreditsStatus.Partial)]
    public async Task FR_GRAPH_03_a_song_with_stored_credits_is_answered_from_the_cache_and_queues_nothing(CreditsStatus status)
    {
        var ct = TestContext.Current.CancellationToken;
        var connectionString = await NewDatabaseAsync(postgres);
        await using (var seed = Context(connectionString))
        {
            seed.Recordings.Add(new Recording { Mbid = Mbid(1), Title = "Redbone", ArtistCredit = "Childish Gambino", CreditsStatus = status });
            await seed.SaveChangesAsync(ct);
        }

        await using var db = Context(connectionString);
        var result = await new SongIngestionService(db, Queue(db)).RequestAsync(Mbid(1), "Redbone", "Childish Gambino", ct);

        result.Should().Be(IngestionRequestResult.Cached);
        (await JobsAsync(connectionString)).Should().BeEmpty();
    }

    [Fact]
    public async Task FR_GRAPH_03_a_recording_row_the_worker_already_filled_in_is_not_overwritten()
    {
        var ct = TestContext.Current.CancellationToken;
        var connectionString = await NewDatabaseAsync(postgres);
        await using (var seed = Context(connectionString))
        {
            // Known to the database, but its credits were never fetched.
            seed.Recordings.Add(new Recording { Mbid = Mbid(1), Title = "Redbone (Full Title)", ArtistCredit = "Childish Gambino", CreditsStatus = CreditsStatus.None });
            await seed.SaveChangesAsync(ct);
        }

        await using var db = Context(connectionString);
        await new SongIngestionService(db, Queue(db)).RequestAsync(Mbid(1), "Redbone", "Childish Gambino", ct);

        (await Context(connectionString).Recordings.AsNoTracking().SingleAsync(ct)).Title.Should().Be("Redbone (Full Title)");
        (await JobsAsync(connectionString)).Should().ContainSingle();
    }

    [Fact]
    public async Task FR_GRAPH_03_a_request_without_a_title_is_rejected()
    {
        var ct = TestContext.Current.CancellationToken;
        var connectionString = await NewDatabaseAsync(postgres);
        await using var db = Context(connectionString);
        var service = new SongIngestionService(db, Queue(db));

        Func<Task> act = () => service.RequestAsync(Mbid(1), " ", "Childish Gambino", ct);

        await act.Should().ThrowAsync<ArgumentException>();
        (await JobsAsync(connectionString)).Should().BeEmpty();
    }
}
