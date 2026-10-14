using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Nodeable.Domain.Crawling;
using Nodeable.Domain.Entities;
using Nodeable.Domain.Enums;
using Nodeable.Infrastructure.Crawling;
using Nodeable.Infrastructure.Ingestion;
using Nodeable.Infrastructure.Persistence;
using Nodeable.Infrastructure.Tests.Crawling;
using Nodeable.Infrastructure.Tests.Deezer;
using Nodeable.Infrastructure.Tests.MusicBrainz;
using Nodeable.Tests.Containers;
using WireMock.RequestBuilders;
using WireMock.ResponseBuilders;
using WireMock.Server;
using static Nodeable.Infrastructure.Tests.Crawling.CrawlTestSupport;

namespace Nodeable.Infrastructure.Tests.Ingestion;

// FR-PREVIEW-01 end to end: the recording job stores a recording's ISRCs and queues a preview job, which asks Deezer
// and stores the track ID and cover ID. The real queue, runner and handlers over a real PostgreSQL, with MusicBrainz
// and Deezer both served by WireMock.
[Collection(CrawlTestSupport.SpanListenerCollection)]
public sealed class PreviewIngestionTests(PostgresFixture postgres) : IDisposable
{
    private static readonly Guid _recordingMbid = Guid.Parse("7408f11c-6c4e-41e5-b81b-6a15bf6cb268");
    private static readonly Guid _workMbid = Guid.Parse("c44370d6-70af-454f-8381-021d1f7b6fac");
    private const string Isrc = "USYAH1600107";

    private readonly WireMockServer _musicBrainz = WireMockServer.Start();
    private readonly WireMockServer _deezer = WireMockServer.Start();

    public void Dispose()
    {
        _musicBrainz.Dispose();
        _deezer.Dispose();
    }

    [Fact]
    public async Task FR_PREVIEW_01_a_recordings_isrcs_are_stored_with_it()
    {
        var ct = TestContext.Current.CancellationToken;
        ServeRecording();
        await using var world = await WorldAsync();

        await world.Queue(CrawlJobKind.Recording, _recordingMbid, CrawlPriority.Interactive);
        await world.RunOnceAsync();

        await using var db = Context(world.ConnectionString);
        (await db.Recordings.AsNoTracking().SingleAsync(ct)).Isrcs.Should().Equal(Isrc);
    }

    [Fact]
    public async Task FR_PREVIEW_01_the_preview_job_stores_the_track_id_and_cover_id_and_never_the_url()
    {
        var ct = TestContext.Current.CancellationToken;
        ServeRecording();
        ServeDeezer($"/track/isrc:{Isrc}", "track-by-isrc.json");
        await using var world = await WorldAsync();
        await world.Queue(CrawlJobKind.Recording, _recordingMbid, CrawlPriority.Interactive);

        await world.DrainAsync();

        var jobs = await JobsAsync(world.ConnectionString);
        jobs.Should().Contain(j => j.Kind == CrawlJobKind.Preview && j.Status == CrawlJobStatus.Done);

        await using var db = Context(world.ConnectionString);
        var preview = await db.Previews.AsNoTracking().SingleAsync(ct);
        preview.RecordingMbid.Should().Be(_recordingMbid);
        preview.Provider.Should().Be(PreviewProvider.Deezer);
        preview.ProviderTrackId.Should().Be("350320101");
        preview.CoverMd5.Should().Be("52a01335022b31b52b96106583ead686");

        // The signed address must not be in any column of the row: it expires in minutes (decision 0022).
        var columns = await db.Database
            .SqlQuery<string>($"""SELECT concat_ws(' ', provider, provider_track_id, cover_md5) AS "Value" FROM previews""")
            .SingleAsync(ct);
        columns.Should().NotContain("hdnea").And.NotContain("http");
    }

    [Fact]
    public async Task FR_PREVIEW_01_a_recording_deezer_does_not_know_ends_its_job_without_a_row()
    {
        var ct = TestContext.Current.CancellationToken;
        ServeRecording();
        ServeDeezer($"/track/isrc:{Isrc}", "no-data.json");
        await using var world = await WorldAsync();
        await world.Queue(CrawlJobKind.Recording, _recordingMbid, CrawlPriority.Interactive);

        await world.DrainAsync();

        (await JobsAsync(world.ConnectionString)).Should().OnlyContain(j => j.Status == CrawlJobStatus.Done);
        await using var db = Context(world.ConnectionString);
        (await db.Previews.CountAsync(ct)).Should().Be(0);
    }

    [Fact]
    public async Task FR_PREVIEW_01_a_track_without_a_preview_is_not_stored_as_one()
    {
        var ct = TestContext.Current.CancellationToken;
        ServeRecording();
        var recorded = DeezerTestHost.FixtureText("track-by-isrc.json");
        var withoutPreview = System.Text.RegularExpressions.Regex.Replace(recorded, "\"preview\":\"[^\"]*\"", "\"preview\":\"\"");
        _deezer.Given(Request.Create().WithPath($"/track/isrc:{Isrc}").UsingGet())
            .RespondWith(Response.Create().WithStatusCode(200).WithBody(withoutPreview));
        await using var world = await WorldAsync();
        await world.Queue(CrawlJobKind.Recording, _recordingMbid, CrawlPriority.Interactive);

        await world.DrainAsync();

        await using var db = Context(world.ConnectionString);
        (await db.Previews.CountAsync(ct)).Should().Be(0, "a row means there is a preview to play");
    }

    [Fact]
    public async Task NFR_REL_01_a_deezer_quota_error_leaves_the_preview_job_to_retry_later()
    {
        ServeRecording();
        _deezer.Given(Request.Create().WithPath($"/track/isrc:{Isrc}").UsingGet())
            .RespondWith(Response.Create().WithStatusCode(200).WithBody("""{"error":{"type":"Exception","message":"Quota limit exceeded","code":4}}"""));
        await using var world = await WorldAsync();
        await world.Queue(CrawlJobKind.Recording, _recordingMbid, CrawlPriority.Interactive);

        // The retry is not ready yet, so draining stops with the preview job waiting.
        await world.DrainAsync();

        var preview = (await JobsAsync(world.ConnectionString)).Single(j => j.Kind == CrawlJobKind.Preview);
        preview.Status.Should().Be(CrawlJobStatus.Pending);
        preview.Attempts.Should().Be(1);
        preview.RunAfter.Should().BeAfter(DateTimeOffset.UtcNow);
    }

    [Fact]
    public async Task FR_PREVIEW_01_running_the_preview_job_twice_leaves_one_row_with_the_newer_answer()
    {
        var ct = TestContext.Current.CancellationToken;
        ServeRecording();
        ServeDeezer($"/track/isrc:{Isrc}", "track-by-isrc.json");
        await using var world = await WorldAsync();
        await world.Queue(CrawlJobKind.Recording, _recordingMbid, CrawlPriority.Interactive);
        await world.DrainAsync();

        await world.Queue(CrawlJobKind.Preview, _recordingMbid, CrawlPriority.Scheduled);
        await world.DrainAsync();

        await using var db = Context(world.ConnectionString);
        (await db.Previews.CountAsync(ct)).Should().Be(1);
    }

    // ---- helpers ----

    private async Task<World> WorldAsync()
    {
        var connectionString = await NewDatabaseAsync(postgres);

        var services = new ServiceCollection();
        services.AddLogging();
        MusicBrainzTestHost.AddTo(services, _musicBrainz, settings: DeezerTestHost.Settings(_deezer));
        DeezerTestHost.AddServices(services);
        services.AddDbContext<NodeableDbContext>(options => options.UseNpgsql(connectionString).UseNodeableConventions());
        services.AddCrawling();
        services.AddIngestion();

        return new World(services.BuildServiceProvider(), connectionString);
    }

    private void ServeRecording()
    {
        _musicBrainz.Given(Request.Create().WithPath($"/ws/2/recording/{_recordingMbid:D}").UsingGet())
            .RespondWith(Response.Create().WithStatusCode(200).WithBody(MusicBrainzTestHost.FixtureText("recording-lookup.json")));
        _musicBrainz.Given(Request.Create().WithPath($"/ws/2/work/{_workMbid:D}").UsingGet())
            .RespondWith(Response.Create().WithStatusCode(200).WithBody(MusicBrainzTestHost.FixtureText("work-lookup.json")));
    }

    private void ServeDeezer(string path, string fixture) =>
        _deezer.Given(Request.Create().WithPath(path).UsingGet())
            .RespondWith(Response.Create().WithStatusCode(200)
                .WithHeader("Content-Type", "application/json; charset=utf-8")
                .WithBody(DeezerTestHost.FixtureText(fixture)));
}
