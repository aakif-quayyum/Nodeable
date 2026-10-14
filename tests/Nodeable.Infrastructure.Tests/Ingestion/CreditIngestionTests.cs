using System.Diagnostics;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Nodeable.Domain.Art;
using Nodeable.Domain.Crawling;
using Nodeable.Domain.Entities;
using Nodeable.Domain.Enums;
using Nodeable.Infrastructure.Crawling;
using Nodeable.Infrastructure.Graphs;
using Nodeable.Infrastructure.Ingestion;
using Nodeable.Infrastructure.MusicBrainz;
using Nodeable.Infrastructure.Persistence;
using Nodeable.Infrastructure.Tests.Crawling;
using Nodeable.Infrastructure.Tests.MusicBrainz;
using Nodeable.Tests.Containers;
using WireMock.RequestBuilders;
using WireMock.ResponseBuilders;
using WireMock.Server;
using static Nodeable.Infrastructure.Tests.Crawling.CrawlTestSupport;

namespace Nodeable.Infrastructure.Tests.Ingestion;

// The whole ingestion chain, composed the way the Worker composes it: the real queue, runner, handlers and
// MusicBrainz client, against a real PostgreSQL, with real MusicBrainz responses served by WireMock. Only the rate
// gate is a no-op here (its own tests, and the combined client tests, cover it).
// A span listener is global to the process: while one is registered, every Nodeable span in every test is recorded and
// its trace context stored. Classes that register a listener, or assert that none exists, run one after the other.
[Collection(CrawlTestSupport.SpanListenerCollection)]
public sealed class CreditIngestionTests(PostgresFixture postgres) : IDisposable
{
    private static readonly Guid _recordingMbid = Guid.Parse("7408f11c-6c4e-41e5-b81b-6a15bf6cb268");
    private static readonly Guid _workMbid = Guid.Parse("c44370d6-70af-454f-8381-021d1f7b6fac");
    private static readonly Guid _bareRecordingMbid = Guid.Parse("ac5977af-d4dc-4636-b867-b02e15d2f6d8");
    private static readonly Guid _bareReleaseMbid = Guid.Parse("104f2b00-57e9-46ee-b8a3-6813f270d9e8");

    private readonly WireMockServer _server = WireMockServer.Start();

    public void Dispose() => _server.Dispose();

    [Fact]
    public async Task FR_GRAPH_03_adding_a_song_stores_the_recording_its_work_releases_and_credits()
    {
        var ct = TestContext.Current.CancellationToken;
        Serve($"/ws/2/recording/{_recordingMbid:D}", "recording-lookup.json");
        Serve($"/ws/2/work/{_workMbid:D}", "work-lookup.json");
        await using var world = await WorldAsync();

        var requested = await world.RequestSongAsync(_recordingMbid, "Redbone", "Childish Gambino");
        await world.DrainAsync();

        requested.Should().Be(IngestionRequestResult.Queued);

        // Two jobs ran: the recording, then the work it linked to. The producer was found, so no release job exists.
        var jobs = await JobsAsync(world.ConnectionString);
        jobs.Select(j => (j.Kind, j.Status)).Should().BeEquivalentTo(
            new[] { (CrawlJobKind.Recording, CrawlJobStatus.Done), (CrawlJobKind.Work, CrawlJobStatus.Done) });
        _server.LogEntries.Should().HaveCount(2, "one request for the recording and one for its work");

        await using var db = Context(world.ConnectionString);
        var recording = await db.Recordings.AsNoTracking().SingleAsync(ct);
        recording.Title.Should().Be("Redbone");
        recording.ArtistCredit.Should().Be("Childish Gambino");
        recording.FirstReleaseDate.Should().Be(new DateOnly(2016, 11, 17));
        recording.FirstReleaseDatePrecision.Should().Be(DatePrecision.Day);
        recording.LengthMs.Should().Be(326933);
        recording.CreditsStatus.Should().Be(CreditsStatus.Complete, "a producer and songwriters are credited");

        (await db.Works.AsNoTracking().SingleAsync(ct)).Title.Should().Be("Redbone");
        (await db.RecordingWorks.CountAsync(ct)).Should().Be(1);
        (await db.Releases.CountAsync(ct)).Should().Be(15);
        (await db.RecordingReleases.CountAsync(ct)).Should().Be(15);

        // MusicBrainz gave one release only a year: it keeps its precision instead of becoming a made-up day.
        var releases = await db.Releases.AsNoTracking().ToListAsync(ct);
        releases.Should().Contain(r => r.DatePrecision == DatePrecision.Year);
        releases.Should().Contain(r => r.DatePrecision == DatePrecision.Day);
        releases.Should().OnlyContain(r => (r.Date == null) == (r.DatePrecision == null));
    }

    [Fact]
    public async Task FR_ART_01_releases_are_stored_with_their_status_and_release_group()
    {
        var ct = TestContext.Current.CancellationToken;
        Serve($"/ws/2/recording/{_recordingMbid:D}", "recording-lookup-release-groups.json");
        Serve($"/ws/2/work/{_workMbid:D}", "work-lookup.json");
        await using var world = await WorldAsync();

        await world.RequestSongAsync(_recordingMbid, "Redbone", "Childish Gambino");
        await world.DrainAsync();

        await using var db = Context(world.ConnectionString);
        var releases = await db.Releases.AsNoTracking().ToListAsync(ct);

        releases.Should().HaveCount(15);
        releases.Should().OnlyContain(r => r.ReleaseGroupMbid != null && r.Status == "Official");

        var single = releases.Single(r => r.Mbid == Guid.Parse("60b98e3b-a038-40b8-b17a-c0b1606c41a8"));
        single.ReleaseGroupMbid.Should().Be(Guid.Parse("e1adb327-2619-427c-acec-d8bb3efb5dca"));
        single.ReleaseGroupType.Should().Be("Single");
        single.ReleaseGroupSecondaryTypes.Should().BeEmpty();

        // Five of the fifteen releases are on compilations, and that is what keeps them from being the cover.
        releases.Count(r => r.ReleaseGroupSecondaryTypes.Contains("Compilation")).Should().Be(5);
    }

    [Fact]
    public async Task FR_ART_01_the_cover_of_a_song_is_its_earliest_official_studio_release_and_that_releases_group()
    {
        var ct = TestContext.Current.CancellationToken;
        Serve($"/ws/2/recording/{_recordingMbid:D}", "recording-lookup-release-groups.json");
        Serve($"/ws/2/work/{_workMbid:D}", "work-lookup.json");
        await using var world = await WorldAsync();
        await world.RequestSongAsync(_recordingMbid, "Redbone", "Childish Gambino");
        await world.DrainAsync();

        await using var db = Context(world.ConnectionString);
        var read = new GraphReadModel(db, Microsoft.Extensions.Options.Options.Create(new MusicBrainzOptions()));

        var covers = await read.GetCoversAsync([_recordingMbid], ct);

        // The album release that MusicBrainz dates only "2016" counts as 2016-01-01 (decision 0008), so it is earlier
        // than the single's exact day in November; both are official studio releases and the album is the cover.
        covers[_recordingMbid].Should().Be(new CoverChoice(
            Guid.Parse("2017e952-42c9-41e0-9e39-69d5aa7b17a6"),
            Guid.Parse("fd817615-3d43-4f07-9509-d0a46b2bc278")));
    }

    [Fact]
    public async Task FR_GRAPH_03_credits_are_stored_once_per_person_role_and_detail_at_each_level()
    {
        var ct = TestContext.Current.CancellationToken;
        Serve($"/ws/2/recording/{_recordingMbid:D}", "recording-lookup.json");
        Serve($"/ws/2/work/{_workMbid:D}", "work-lookup.json");
        await using var world = await WorldAsync();
        await world.RequestSongAsync(_recordingMbid, "Redbone", "Childish Gambino");

        await world.DrainAsync();

        await using var db = Context(world.ConnectionString);
        var rows = await db.Database.SqlQuery<CreditRow>(
            $"""
            SELECT c.subject_type AS "Level", p.name AS "Person", c.role AS "Role", c.detail AS "Detail"
            FROM credits c JOIN people p ON p.mbid = c.person_mbid
            """).ToListAsync(ct);

        // 16 artist relationships on the recording. "mix" by Ludwig Goransson appears twice, once with the
        // attribute "additional", which maps to the same (mixing, "") credit, so 15 distinct credits remain.
        var recordingLevel = rows.Where(r => r.Level == "recording").ToList();
        recordingLevel.Should().HaveCount(15);
        recordingLevel.Should().Contain(r => r.Person == "Ludwig Göransson" && r.Role == "producer" && r.Detail == "");
        recordingLevel.Should().Contain(r => r.Person == "Ludwig Göransson" && r.Role == "instrument" && r.Detail == "bass guitar");
        recordingLevel.Should().Contain(r => r.Person == "Riley Mackin" && r.Role == "engineering" && r.Detail == "");
        recordingLevel.Should().Contain(r => r.Person == "Donald Glover" && r.Role == "vocal" && r.Detail == "");
        recordingLevel.Count(r => r.Role == "mixing").Should().Be(3);

        // 5 relationships on the work; Donald Glover is both composer and lyricist, which is one songwriter credit.
        var workLevel = rows.Where(r => r.Level == "work").ToList();
        workLevel.Should().HaveCount(4);
        workLevel.Should().OnlyContain(r => r.Role == "songwriter");

        (await db.People.CountAsync(ct)).Should().Be(6);
    }

    [Fact]
    public async Task NFR_REL_01_running_the_same_jobs_again_changes_nothing()
    {
        var ct = TestContext.Current.CancellationToken;
        Serve($"/ws/2/recording/{_recordingMbid:D}", "recording-lookup.json");
        Serve($"/ws/2/work/{_workMbid:D}", "work-lookup.json");
        await using var world = await WorldAsync();
        await world.RequestSongAsync(_recordingMbid, "Redbone", "Childish Gambino");
        await world.DrainAsync();
        var before = await CountsAsync(world.ConnectionString);

        // A refresh: the finished jobs are history, so the same fetches can be queued and run again.
        await world.Queue(CrawlJobKind.Recording, _recordingMbid, CrawlPriority.Scheduled);
        await world.DrainAsync();

        (await CountsAsync(world.ConnectionString)).Should().Be(before);
        (await JobsAsync(world.ConnectionString)).Should().HaveCount(4, "two runs of two jobs, kept as history");
    }

    [Fact]
    public async Task FR_GRAPH_03_a_recording_without_a_producer_queues_one_release_fetch_and_stores_its_credits()
    {
        var ct = TestContext.Current.CancellationToken;
        Serve($"/ws/2/recording/{_bareRecordingMbid:D}", "recording-lookup-no-credits.json");

        // No real release in the captured fixtures carries relationships, so this body is constructed.
        _server.Given(Request.Create().WithPath($"/ws/2/release/{_bareReleaseMbid:D}").UsingGet())
            .RespondWith(Response.Create().WithStatusCode(200).WithHeader("Content-Type", "application/json").WithBody(
                $$$"""
                {"id":"{{{_bareReleaseMbid}}}","title":"Promo Only: Modern Rock Radio, January 2017","date":"2016-12-25",
                 "relations":[{"type":"producer","target-type":"artist","attributes":[],
                   "artist":{"id":"00000000-0000-0000-0000-0000000000f1","name":"A. Producer","sort-name":"Producer, A.","type":"Person"}}]}
                """));
        await using var world = await WorldAsync();
        await world.RequestSongAsync(_bareRecordingMbid, "Redbone", "Childish Gambino");

        await world.DrainAsync();

        var jobs = await JobsAsync(world.ConnectionString);
        jobs.Select(j => (j.Kind, j.TargetMbid, j.Status)).Should().BeEquivalentTo(new[]
        {
            (CrawlJobKind.Recording, _bareRecordingMbid, CrawlJobStatus.Done),
            (CrawlJobKind.Release, _bareReleaseMbid, CrawlJobStatus.Done),
        });

        await using var db = Context(world.ConnectionString);
        var release = await db.Releases.AsNoTracking().SingleAsync(ct);
        release.Date.Should().Be(new DateOnly(2016, 12, 25));
        release.DatePrecision.Should().Be(DatePrecision.Day);

        var credit = await db.Credits.AsNoTracking().SingleAsync(ct);
        credit.SubjectType.Should().Be(CreditSubjectType.Release);
        credit.Role.Should().Be(CreditRole.Producer);

        // A producer was found, but nobody is credited as a songwriter, so the song is partial and says so.
        (await db.Recordings.AsNoTracking().SingleAsync(ct)).CreditsStatus.Should().Be(CreditsStatus.Partial);
    }

    [Fact]
    public async Task FR_GRAPH_03_a_recording_with_no_releases_and_no_producer_has_no_release_to_fetch()
    {
        var ct = TestContext.Current.CancellationToken;
        _server.Given(Request.Create().WithPath($"/ws/2/recording/{_bareRecordingMbid:D}").UsingGet())
            .RespondWith(Response.Create().WithStatusCode(200).WithHeader("Content-Type", "application/json")
                .WithBody($$$"""{"id":"{{{_bareRecordingMbid}}}","title":"Redbone","artist-credit":[{"name":"Childish Gambino","joinphrase":"","artist":{"id":"{{{Guid.NewGuid()}}}","name":"Childish Gambino"}}]}"""));
        await using var world = await WorldAsync();
        await world.RequestSongAsync(_bareRecordingMbid, "Redbone", "Childish Gambino");

        await world.DrainAsync();

        (await JobsAsync(world.ConnectionString)).Should().ContainSingle().Which.Status.Should().Be(CrawlJobStatus.Done);
        await using var db = Context(world.ConnectionString);
        (await db.Recordings.AsNoTracking().SingleAsync(ct)).CreditsStatus.Should().Be(CreditsStatus.None);
    }

    [Fact]
    public async Task NFR_OBS_01_the_work_job_is_in_the_trace_of_the_request_that_added_the_song()
    {
        Serve($"/ws/2/recording/{_recordingMbid:D}", "recording-lookup.json");
        Serve($"/ws/2/work/{_workMbid:D}", "work-lookup.json");
        using var spans = new SpanCollector();
        await using var world = await WorldAsync();

        ActivityTraceId traceId;
        using (var request = spans.TestSource.StartActivity("test.add_song")!)
        {
            traceId = request.TraceId;
            await world.RequestSongAsync(_recordingMbid, "Redbone", "Childish Gambino");
        }

        Activity.Current = null;
        await world.DrainAsync();

        var inTrace = spans.Stopped.Where(a => a.TraceId == traceId).ToList();
        var recordingJob = inTrace.Single(a => a.OperationName == "crawl.job" && Equals(a.GetTagItem("crawl.kind"), "recording"));
        var workJob = inTrace.Single(a => a.OperationName == "crawl.job" && Equals(a.GetTagItem("crawl.kind"), "work"));
        var workEnqueue = inTrace.Single(a => a.OperationName == "crawl.enqueue" && Equals(a.GetTagItem("crawl.kind"), "work"));

        // click -> crawl.enqueue(recording) -> crawl.job(recording) -> crawl.enqueue(work) -> crawl.job(work)
        workEnqueue.ParentSpanId.Should().Be(recordingJob.SpanId);
        workJob.ParentSpanId.Should().Be(workEnqueue.SpanId);
        inTrace.Should().Contain(a => a.OperationName == "credits.persist");
        inTrace.Should().Contain(a => a.OperationName == "musicbrainz.fetch" && Equals(a.GetTagItem("mb.entity"), "recording"));
    }

    [Theory]
    [InlineData(CrawlPriority.Interactive)]
    [InlineData(CrawlPriority.Scheduled)]
    public async Task NFR_REL_01_follow_up_jobs_inherit_the_priority_of_the_job_that_queued_them(int priority)
    {
        Serve($"/ws/2/recording/{_recordingMbid:D}", "recording-lookup.json");
        await using var world = await WorldAsync();
        await world.Queue(CrawlJobKind.Recording, _recordingMbid, priority);

        await world.RunOnceAsync();

        var followUp = (await JobsAsync(world.ConnectionString)).Single(j => j.Kind == CrawlJobKind.Work);
        followUp.Priority.Should().Be(priority);
        followUp.Status.Should().Be(CrawlJobStatus.Pending);
    }

    [Fact]
    public async Task FR_PREVIEW_01_a_preview_job_is_queued_for_a_recording_with_an_isrc_only_when_enabled()
    {
        Serve($"/ws/2/recording/{_recordingMbid:D}", "recording-lookup.json");

        await using (var off = await WorldAsync())
        {
            await off.Queue(CrawlJobKind.Recording, _recordingMbid, CrawlPriority.Interactive);
            await off.RunOnceAsync();
            (await JobsAsync(off.ConnectionString)).Should().NotContain(j => j.Kind == CrawlJobKind.Preview);
        }

        await using var on = await WorldAsync(new() { ["Ingestion:QueuePreviewJobs"] = "true" });
        await on.Queue(CrawlJobKind.Recording, _recordingMbid, CrawlPriority.Interactive);
        await on.RunOnceAsync();

        var preview = (await JobsAsync(on.ConnectionString)).Single(j => j.Kind == CrawlJobKind.Preview);
        preview.TargetMbid.Should().Be(_recordingMbid);
        preview.Priority.Should().Be(CrawlPriority.Interactive);
    }

    [Fact]
    public async Task NFR_REL_01_a_chain_cut_short_by_a_restart_is_finished_by_the_next_process()
    {
        var ct = TestContext.Current.CancellationToken;
        Serve($"/ws/2/recording/{_recordingMbid:D}", "recording-lookup.json");
        Serve($"/ws/2/work/{_workMbid:D}", "work-lookup.json");
        var connectionString = await NewDatabaseAsync(postgres);

        // Process one runs the recording job, then claims the work job and dies before finishing it.
        await using (var first = await WorldAsync(connectionString: connectionString))
        {
            await first.RequestSongAsync(_recordingMbid, "Redbone", "Childish Gambino");
            await first.RunOnceAsync();

            await using var scope = first.Provider.CreateAsyncScope();
            var claimed = await scope.ServiceProvider.GetRequiredService<ICrawlQueue>().ClaimNextAsync("process-one", ct);
            claimed!.Kind.Should().Be(CrawlJobKind.Work);
        }

        // Its lock has aged past the timeout by the time process two starts.
        await SqlAsync(connectionString, $"UPDATE crawl_jobs SET locked_at = now() - interval '1 hour' WHERE status = 'running'");

        await using var second = await WorldAsync(connectionString: connectionString);
        (await second.Provider.GetRequiredService<ICrawlJobRunner>().RecoverStaleAsync(ct)).Should().Be(1);
        await second.DrainAsync();

        (await JobsAsync(connectionString)).Should().OnlyContain(j => j.Status == CrawlJobStatus.Done);
        await using var db = Context(connectionString);
        (await db.Recordings.AsNoTracking().SingleAsync(ct)).CreditsStatus.Should().Be(CreditsStatus.Complete);
        (await db.Credits.CountAsync(c => c.SubjectType == CreditSubjectType.Work, ct)).Should().Be(4);
    }

    [Fact]
    public async Task FR_GRAPH_03_a_recording_musicbrainz_does_not_know_is_failed_at_once()
    {
        _server.Given(Request.Create().WithPath($"/ws/2/recording/{_recordingMbid:D}").UsingGet())
            .RespondWith(Response.Create().WithStatusCode(404).WithBody("""{"error":"Not Found"}"""));
        await using var world = await WorldAsync();
        await world.Queue(CrawlJobKind.Recording, _recordingMbid, CrawlPriority.Interactive);

        await world.RunOnceAsync();

        var job = (await JobsAsync(world.ConnectionString)).Single();
        job.Status.Should().Be(CrawlJobStatus.Failed);
        job.Attempts.Should().Be(1, "retrying cannot make MusicBrainz know the recording");
        job.LastError.Should().Contain(_recordingMbid.ToString());
    }

    [Fact]
    public async Task NFR_RATE_03_busy_responses_are_retried_inside_the_call_without_failing_the_job()
    {
        ServeSequence(
            $"/ws/2/recording/{_recordingMbid:D}",
            Response.Create().WithStatusCode(503).WithBody(MusicBrainzTestHost.FixtureText("error-503.json")),
            Response.Create().WithStatusCode(503).WithBody(MusicBrainzTestHost.FixtureText("error-503.json")),
            Ok("recording-lookup.json"));
        await using var world = await WorldAsync();
        await world.Queue(CrawlJobKind.Recording, _recordingMbid, CrawlPriority.Interactive);

        await world.RunOnceAsync();

        var job = (await JobsAsync(world.ConnectionString)).Single(j => j.Kind == CrawlJobKind.Recording);
        job.Status.Should().Be(CrawlJobStatus.Done);
        job.Attempts.Should().Be(1, "the HTTP layer absorbed the two 503s, so the job needed one attempt");
        _server.LogEntries.Should().HaveCount(3);
    }

    [Fact]
    public async Task NFR_REL_01_an_outage_longer_than_the_http_retries_leaves_the_job_to_retry_later()
    {
        _server.Given(Request.Create().WithPath($"/ws/2/recording/{_recordingMbid:D}").UsingGet())
            .RespondWith(Response.Create().WithStatusCode(503).WithBody(MusicBrainzTestHost.FixtureText("error-503.json")));
        await using var world = await WorldAsync();
        await world.Queue(CrawlJobKind.Recording, _recordingMbid, CrawlPriority.Interactive);

        await world.RunOnceAsync();

        var job = (await JobsAsync(world.ConnectionString)).Single();
        job.Status.Should().Be(CrawlJobStatus.Pending);
        job.Attempts.Should().Be(1);
        job.LastError.Should().Contain("currently busy");
        job.RunAfter.Should().BeAfter(DateTimeOffset.UtcNow.AddSeconds(20));
        _server.LogEntries.Should().HaveCount(6, "one attempt and five retries inside the one call");
    }

    // ---- helpers ----

    private async Task<World> WorldAsync(Dictionary<string, string?>? settings = null, string? connectionString = null)
    {
        connectionString ??= await NewDatabaseAsync(postgres);

        // The tests here are about credits; previews have their own (PreviewIngestionTests).
        settings = new Dictionary<string, string?>(settings ?? []);
        settings.TryAdd("Ingestion:QueuePreviewJobs", "false");

        var services = new ServiceCollection();
        services.AddLogging();
        MusicBrainzTestHost.AddTo(services, _server, settings: settings);
        services.AddDbContext<NodeableDbContext>(options => options.UseNpgsql(connectionString).UseNodeableConventions());
        services.AddCrawling();
        services.AddIngestion();

        // MusicBrainzTestHost.AddTo registered its configuration; settings for Ingestion ride along in the same source.
        return new World(services.BuildServiceProvider(), connectionString);
    }

    private static async Task<(int People, int Credits, int Works, int Releases, int Links)> CountsAsync(string connectionString)
    {
        await using var db = Context(connectionString);
        var ct = TestContext.Current.CancellationToken;
        return (
            await db.People.CountAsync(ct),
            await db.Credits.CountAsync(ct),
            await db.Works.CountAsync(ct),
            await db.Releases.CountAsync(ct),
            await db.RecordingWorks.CountAsync(ct) + await db.RecordingReleases.CountAsync(ct));
    }

    private static IResponseBuilder Ok(string fixture) => Response.Create()
        .WithStatusCode(200)
        .WithHeader("Content-Type", "application/json; charset=utf-8")
        .WithBody(MusicBrainzTestHost.FixtureText(fixture));

    private void Serve(string path, string fixture) =>
        _server.Given(Request.Create().WithPath(path).UsingGet()).RespondWith(Ok(fixture));

    private void ServeSequence(string path, params IResponseBuilder[] responses)
    {
        const string scenario = "sequence";
        for (var i = 0; i < responses.Length; i++)
        {
            var mapping = _server.Given(Request.Create().WithPath(path).UsingGet()).InScenario(scenario);
            if (i > 0)
            {
                mapping = mapping.WhenStateIs($"step-{i}");
            }

            if (i < responses.Length - 1)
            {
                mapping = mapping.WillSetStateTo($"step-{i + 1}");
            }

            mapping.RespondWith(responses[i]);
        }
    }

    public sealed record CreditRow(string Level, string Person, string Role, string Detail);
}
