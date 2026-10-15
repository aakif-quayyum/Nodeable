using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Nodeable.Api.Endpoints;
using Nodeable.Domain.Entities;
using Nodeable.Domain.Enums;
using Nodeable.Infrastructure.Persistence;
using WireMock.RequestBuilders;
using WireMock.ResponseBuilders;
using WireMock.Server;

namespace Nodeable.Api.Tests;

// FR-PREVIEW-01 over HTTP: the real Api, the real Deezer client pipeline and a real database, with WireMock answering
// as Deezer and a real recorded response as the body.
public sealed class RecordingEndpointTests(ApiFactory factory) : IClassFixture<ApiFactory>, IDisposable
{
    private const string TrackId = "350320101";

    private readonly WireMockServer _deezer = WireMockServer.Start();

    public void Dispose() => _deezer.Dispose();

    [Fact]
    public async Task FR_PREVIEW_01_a_recording_with_a_preview_gets_a_fresh_short_lived_address()
    {
        var ct = TestContext.Current.CancellationToken;
        using var app = App();
        var mbid = await StoreRecordingAsync(app, withPreview: true);
        ServeTrack(File.ReadAllText(Fixture("track-by-id.json")));
        using var client = app.CreateClient();

        var response = await client.GetAsync($"/api/v1/recordings/{mbid:D}/preview", ct);
        var body = await response.Content.ReadFromJsonAsync<PreviewResponse>(ct);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        body!.Url.Should().StartWith("https://cdnt-preview.dzcdn.net/");
        body.ExpiresAt.Should().NotBeNull("the signed address says when it runs out");
        response.Headers.CacheControl!.NoStore.Should().BeTrue("a signed address must not be kept by a cache");
        _deezer.LogEntries.Single().RequestMessage!.Path.Should().Be($"/track/{TrackId}", "the stored track id is what is asked for");
    }

    [Fact]
    public async Task FR_PREVIEW_01_a_recording_with_no_preview_row_is_404_without_asking_deezer()
    {
        var ct = TestContext.Current.CancellationToken;
        using var app = App();
        var mbid = await StoreRecordingAsync(app, withPreview: false);
        using var client = app.CreateClient();

        var response = await client.GetAsync($"/api/v1/recordings/{mbid:D}/preview", ct);

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await response.Content.ReadAsStringAsync(ct)).Should().Contain(ProblemTypes.PreviewNotFound);
        _deezer.LogEntries.Should().BeEmpty();
    }

    [Fact]
    public async Task FR_PREVIEW_01_a_track_deezer_no_longer_has_is_404()
    {
        var ct = TestContext.Current.CancellationToken;
        using var app = App();
        var mbid = await StoreRecordingAsync(app, withPreview: true);
        ServeTrack(File.ReadAllText(Fixture("no-data.json")));
        using var client = app.CreateClient();

        var response = await client.GetAsync($"/api/v1/recordings/{mbid:D}/preview", ct);

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task FR_PREVIEW_01_a_deezer_outage_is_503_with_retry_after_and_not_a_missing_preview()
    {
        var ct = TestContext.Current.CancellationToken;
        using var app = App();
        var mbid = await StoreRecordingAsync(app, withPreview: true);
        _deezer.Given(Request.Create().WithPath($"/track/{TrackId}").UsingGet())
            .RespondWith(Response.Create().WithStatusCode(503));
        using var client = app.CreateClient();

        var response = await client.GetAsync($"/api/v1/recordings/{mbid:D}/preview", ct);

        response.StatusCode.Should().Be(HttpStatusCode.ServiceUnavailable);
        response.Headers.RetryAfter.Should().NotBeNull();
        (await response.Content.ReadAsStringAsync(ct)).Should().Contain(ProblemTypes.UpstreamUnavailable);
    }

    [Fact]
    public async Task NFR_SEC_02_previews_are_limited_per_address()
    {
        var ct = TestContext.Current.CancellationToken;
        using var app = App(("RateLimiting:PreviewPermitsPerMinute", "2"));
        var mbid = await StoreRecordingAsync(app, withPreview: false);
        using var client = app.CreateClient();

        var statuses = new List<HttpStatusCode>();
        for (var i = 0; i < 3; i++)
        {
            statuses.Add((await client.GetAsync($"/api/v1/recordings/{mbid:D}/preview", ct)).StatusCode);
        }

        statuses.Should().Equal(HttpStatusCode.NotFound, HttpStatusCode.NotFound, HttpStatusCode.TooManyRequests);
    }

    // ---- choosing the right version (decision 0026) ----

    [Fact]
    public async Task FR_PREVIEW_01_candidates_are_the_first_five_results_with_a_preview()
    {
        var ct = TestContext.Current.CancellationToken;
        using var app = App();
        var mbid = await StoreRecordingAsync(app, withPreview: false);
        ServeSearch("search-billie-jean.json");
        using var client = app.CreateClient();

        var response = await client.GetAsync($"/api/v1/recordings/{mbid:D}/preview/candidates", ct);
        var body = await response.Content.ReadFromJsonAsync<PreviewCandidatesResponse>(ct);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        response.Headers.CacheControl!.NoStore.Should().BeTrue();
        body!.Candidates.Should().HaveCount(5);
        body.Candidates[0].TrackId.Should().Be("4603408");
        body.Candidates[0].Title.Should().Be("Billie Jean");
        body.Candidates[0].Artist.Should().Be("Michael Jackson");
        body.Candidates[0].DurationSeconds.Should().Be(293);
        body.Candidates[0].CoverMd5.Should().NotBeNullOrEmpty();
        body.Candidates.Select(c => c.TrackId).Should().OnlyHaveUniqueItems();
        _deezer.LogEntries.Single().RequestMessage!.Query!["q"].Should().Equal("Childish Gambino Redbone");
    }

    [Fact]
    public async Task FR_PREVIEW_01_a_pick_is_stored_with_how_and_when_and_then_it_plays_for_everyone()
    {
        var ct = TestContext.Current.CancellationToken;
        using var app = App();
        var mbid = await StoreRecordingAsync(app, withPreview: false);
        ServeSearch("search-billie-jean.json");
        ServeTrackById("4603408", File.ReadAllText(Fixture("track-by-id.json")));
        using var client = app.CreateClient();

        var pick = await client.PostAsJsonAsync($"/api/v1/recordings/{mbid:D}/preview/pick", new PickPreviewRequest("4603408"), ct);

        pick.StatusCode.Should().Be(HttpStatusCode.OK);
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var row = await scope.ServiceProvider.GetRequiredService<NodeableDbContext>().Previews.SingleAsync(p => p.RecordingMbid == mbid, ct);
            row.MatchedBy.Should().Be(PreviewMatch.UserPick);
            row.ProviderTrackId.Should().Be("4603408");
            row.PickedAt.Should().NotBeNull();
            row.PickedAt!.Value.Should().BeCloseTo(DateTimeOffset.UtcNow, TimeSpan.FromMinutes(1));
        }

        // The preview endpoint now answers for every visitor, with no further choice needed.
        var played = await client.GetAsync($"/api/v1/recordings/{mbid:D}/preview", ct);
        played.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Theory]
    [InlineData("")]
    [InlineData("abc")]
    [InlineData("4603408; drop table previews")]
    [InlineData("123456789012345678901")]
    public async Task FR_PREVIEW_01_a_pick_that_is_not_a_deezer_track_id_is_refused_before_deezer_is_asked(string trackId)
    {
        var ct = TestContext.Current.CancellationToken;
        using var app = App();
        var mbid = await StoreRecordingAsync(app, withPreview: false);
        using var client = app.CreateClient();

        var response = await client.PostAsJsonAsync($"/api/v1/recordings/{mbid:D}/preview/pick", new PickPreviewRequest(trackId), ct);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        _deezer.LogEntries.Should().BeEmpty();
    }

    [Fact]
    public async Task FR_PREVIEW_01_a_track_that_was_not_among_the_results_cannot_be_picked()
    {
        var ct = TestContext.Current.CancellationToken;
        using var app = App();
        var mbid = await StoreRecordingAsync(app, withPreview: false);
        ServeSearch("search-billie-jean.json");
        using var client = app.CreateClient();

        var response = await client.PostAsJsonAsync($"/api/v1/recordings/{mbid:D}/preview/pick", new PickPreviewRequest("999999999"), ct);

        response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
        (await response.Content.ReadAsStringAsync(ct)).Should().Contain(ProblemTypes.PreviewNotOffered);
        await using var scope = app.Services.CreateAsyncScope();
        (await scope.ServiceProvider.GetRequiredService<NodeableDbContext>().Previews.CountAsync(ct)).Should().Be(0);
    }

    [Fact]
    public async Task FR_PREVIEW_01_a_recording_that_has_a_preview_already_cannot_be_picked_over()
    {
        var ct = TestContext.Current.CancellationToken;
        using var app = App();
        var mbid = await StoreRecordingAsync(app, withPreview: true);
        ServeSearch("search-billie-jean.json");
        using var client = app.CreateClient();

        var response = await client.PostAsJsonAsync($"/api/v1/recordings/{mbid:D}/preview/pick", new PickPreviewRequest("4603408"), ct);

        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await response.Content.ReadAsStringAsync(ct)).Should().Contain(ProblemTypes.PreviewAlreadyExists);
    }

    [Fact]
    public async Task FR_PREVIEW_01_a_recording_the_cache_does_not_hold_has_no_candidates_and_cannot_be_picked()
    {
        var ct = TestContext.Current.CancellationToken;
        using var app = App();
        using var client = app.CreateClient();
        var unknown = Guid.NewGuid();

        var candidates = await client.GetAsync($"/api/v1/recordings/{unknown:D}/preview/candidates", ct);
        var pick = await client.PostAsJsonAsync($"/api/v1/recordings/{unknown:D}/preview/pick", new PickPreviewRequest("4603408"), ct);

        candidates.StatusCode.Should().Be(HttpStatusCode.NotFound);
        pick.StatusCode.Should().Be(HttpStatusCode.NotFound);
        _deezer.LogEntries.Should().BeEmpty("nothing is asked of Deezer for a recording that is not stored");
    }

    [Fact]
    public async Task FR_PREVIEW_01_a_deezer_outage_while_listing_candidates_is_503_with_retry_after()
    {
        var ct = TestContext.Current.CancellationToken;
        using var app = App();
        var mbid = await StoreRecordingAsync(app, withPreview: false);
        _deezer.Given(Request.Create().WithPath("/search").UsingGet()).RespondWith(Response.Create().WithStatusCode(503));
        using var client = app.CreateClient();

        var response = await client.GetAsync($"/api/v1/recordings/{mbid:D}/preview/candidates", ct);

        response.StatusCode.Should().Be(HttpStatusCode.ServiceUnavailable);
        response.Headers.RetryAfter.Should().NotBeNull();
    }

    [Fact]
    public async Task NFR_SEC_02_candidate_lists_and_picks_share_a_lower_limit_per_address()
    {
        var ct = TestContext.Current.CancellationToken;
        using var app = App(("RateLimiting:PreviewPickPermitsPerMinute", "2"));
        var mbid = await StoreRecordingAsync(app, withPreview: false);
        ServeSearch("search-billie-jean.json");
        using var client = app.CreateClient();

        var statuses = new List<HttpStatusCode>
        {
            (await client.GetAsync($"/api/v1/recordings/{mbid:D}/preview/candidates", ct)).StatusCode,
            (await client.PostAsJsonAsync($"/api/v1/recordings/{mbid:D}/preview/pick", new PickPreviewRequest("999999999"), ct)).StatusCode,
            (await client.GetAsync($"/api/v1/recordings/{mbid:D}/preview/candidates", ct)).StatusCode,
        };

        statuses.Should().Equal(HttpStatusCode.OK, HttpStatusCode.UnprocessableEntity, HttpStatusCode.TooManyRequests);
    }

    private static async Task<Guid> StoreRecordingAsync(WebApplicationFactory<Program> app, bool withPreview)
    {
        var mbid = Guid.NewGuid();
        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<NodeableDbContext>();

        db.Recordings.Add(new Recording { Mbid = mbid, Title = "Redbone", ArtistCredit = "Childish Gambino" });
        if (withPreview)
        {
            db.Previews.Add(new Preview { RecordingMbid = mbid, Provider = PreviewProvider.Deezer, ProviderTrackId = TrackId });
        }

        await db.SaveChangesAsync(TestContext.Current.CancellationToken);
        return mbid;
    }

    // WithWebHostBuilder starts a new host with a database of its own, so a test seeds and calls through the same one.
    private WebApplicationFactory<Program> App(params (string Key, string Value)[] settings) =>
        factory.WithWebHostBuilder(builder =>
        {
            builder.UseSetting("Deezer:BaseUrl", _deezer.Url + "/");
            builder.UseSetting("Deezer:RetryBaseDelay", "00:00:00.010");
            foreach (var (key, value) in settings)
            {
                builder.UseSetting(key, value);
            }
        });

    private void ServeTrack(string body) =>
        _deezer.Given(Request.Create().WithPath($"/track/{TrackId}").UsingGet())
            .RespondWith(Response.Create().WithStatusCode(200).WithHeader("Content-Type", "application/json").WithBody(body));

    private void ServeSearch(string fixture) =>
        _deezer.Given(Request.Create().WithPath("/search").UsingGet())
            .RespondWith(Response.Create().WithStatusCode(200).WithHeader("Content-Type", "application/json").WithBody(File.ReadAllText(Fixture(fixture))));

    private void ServeTrackById(string id, string body) =>
        _deezer.Given(Request.Create().WithPath($"/track/{id}").UsingGet())
            .RespondWith(Response.Create().WithStatusCode(200).WithHeader("Content-Type", "application/json").WithBody(body));

    private static string Fixture(string name) => Path.Combine(AppContext.BaseDirectory, "Fixtures", "deezer", name);
}
