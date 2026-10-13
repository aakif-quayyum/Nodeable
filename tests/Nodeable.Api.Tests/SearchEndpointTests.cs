using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Nodeable.Api.Endpoints;
using Nodeable.Domain.Enums;
using Nodeable.Domain.Search;
using Nodeable.Infrastructure.Search;
using WireMock.RequestBuilders;
using WireMock.ResponseBuilders;
using WireMock.Server;

namespace Nodeable.Api.Tests;

// The whole path of a search: HTTP request, Api, cache, the real MusicBrainz client pipeline and the Redis rate gate,
// with WireMock answering as MusicBrainz and real recorded responses as the bodies.
public sealed class SearchEndpointTests(ApiFactory factory) : IClassFixture<ApiFactory>, IDisposable
{
    private static readonly JsonSerializerOptions _json = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) },
    };

    private readonly WireMockServer _server = WireMockServer.Start();

    public void Dispose() => _server.Dispose();

    [Fact]
    public async Task FR_SEARCH_01_a_search_returns_ranked_results_with_duplicates_folded_behind_the_original()
    {
        var ct = TestContext.Current.CancellationToken;
        ServeSearch(HttpStatusCode.OK, File.ReadAllText(Fixture("search-recordings-duplicates.json")));
        using var client = Client();

        var response = await client.GetAsync("/api/v1/search/recordings?q=Redbone&artist=Childish%20Gambino", ct);
        var body = await response.Content.ReadFromJsonAsync<SearchResponse>(_json, ct);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        body!.Source.Should().Be(SearchSource.MusicBrainz);
        body.Results.Should().HaveCount(5);

        var song = body.Results[0];
        song.Mbid.Should().Be(Guid.Parse("7408f11c-6c4e-41e5-b81b-6a15bf6cb268"));
        song.Title.Should().Be("Redbone");
        song.Artist.Should().Be("Childish Gambino");
        song.FirstReleaseTitle.Should().Be("Awaken, My Love!");
        song.Year.Should().Be(2016);
        song.Score.Should().Be(100);

        // FR-ART-01: the cover is the original's earliest official studio release, and its group is the fallback.
        song.ArtReleaseMbid.Should().Be(Guid.Parse("2017e952-42c9-41e0-9e39-69d5aa7b17a6"));
        song.ArtReleaseGroupMbid.Should().Be(Guid.Parse("fd817615-3d43-4f07-9509-d0a46b2bc278"));
        song.CreditsStatus.Should().BeNull("the recording is not in the cache");
        song.Versions.Should().HaveCount(6);
        song.Versions.Select(v => v.Kind).Should().Contain([VersionKind.Live, VersionKind.Compilation]);
    }

    [Fact]
    public async Task FR_SEARCH_02_separate_recordings_say_what_they_are_and_the_song_itself_says_nothing()
    {
        var ct = TestContext.Current.CancellationToken;
        ServeSearch(HttpStatusCode.OK, File.ReadAllText(Fixture("search-recordings-duplicates.json")));
        using var client = Client();

        var response = await client.GetAsync("/api/v1/search/recordings?q=Redbone&artist=Childish%20Gambino", ct);
        var body = await response.Content.ReadFromJsonAsync<SearchResponse>(_json, ct);

        var kinds = body!.Results.ToDictionary(r => r.Title, r => r.Kind);
        kinds["Redbone"].Should().BeNull();
        kinds["Redbone (radio edit)"].Should().Be(RecordingKind.Edit);
        kinds["Redbone (WBBL remix)"].Should().Be(RecordingKind.Remix);
        kinds["Redbone (Tsunxmi remix)"].Should().Be(RecordingKind.Remix);
        kinds["Redbone (Nick Bike edit)"].Should().Be(RecordingKind.Edit);
    }

    [Fact]
    public async Task FR_SEARCH_01_the_wire_format_names_enums_in_camel_case_and_ids_as_strings()
    {
        var ct = TestContext.Current.CancellationToken;
        ServeSearch(HttpStatusCode.OK, File.ReadAllText(Fixture("search-recordings-duplicates.json")));
        using var client = Client();

        var text = await client.GetStringAsync("/api/v1/search/recordings?q=Redbone", ct);
        using var document = JsonDocument.Parse(text);

        document.RootElement.GetProperty("source").GetString().Should().Be("musicBrainz");
        var first = document.RootElement.GetProperty("results")[0];
        first.GetProperty("mbid").GetString().Should().Be("7408f11c-6c4e-41e5-b81b-6a15bf6cb268");
        first.GetProperty("versions")[0].GetProperty("kind").GetString().Should().BeOneOf("live", "compilation", "remaster", "other");

        // Null stays null: no cached status, and never a made-up "none" (spec principle 5).
        first.GetProperty("creditsStatus").ValueKind.Should().Be(JsonValueKind.Null);
    }

    [Fact]
    public async Task FR_SEARCH_01_requests_to_musicbrainz_carry_the_user_agent_and_the_artist_filter()
    {
        var ct = TestContext.Current.CancellationToken;
        ServeSearch(HttpStatusCode.OK, File.ReadAllText(Fixture("search-recordings-duplicates.json")));
        using var client = Client();

        await client.GetAsync("/api/v1/search/recordings?q=Redbone&artist=Childish%20Gambino", ct);

        var request = _server.LogEntries.Single().RequestMessage!;
        request.Query!["query"].Single().Should().Be("+recording:\"Redbone\" +artist:\"Childish Gambino\" status:official^10");
        request.Headers!["User-Agent"].Single().Should().StartWith("Nodeable/").And.Contain("https://github.com/aakif-quayyum/Nodeable");
    }

    [Theory]
    [InlineData("")]
    [InlineData("?q=")]
    [InlineData("?q=%20%20")]
    [InlineData("?q=a")]
    public async Task FR_SEARCH_01_a_missing_or_one_letter_title_is_a_400_problem(string query)
    {
        var ct = TestContext.Current.CancellationToken;
        using var client = Client();

        var response = await client.GetAsync("/api/v1/search/recordings" + query, ct);
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>(ct);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        response.Content.Headers.ContentType!.MediaType.Should().Be("application/problem+json");
        problem.GetProperty("type").GetString().Should().Be(ProblemTypes.InvalidSearch);
        _server.LogEntries.Should().BeEmpty("an invalid search never reaches MusicBrainz");
    }

    [Fact]
    public async Task FR_SEARCH_01_a_title_over_the_length_limit_is_a_400_problem()
    {
        var ct = TestContext.Current.CancellationToken;
        using var client = Client();

        var response = await client.GetAsync("/api/v1/search/recordings?q=" + new string('x', 201), ct);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task NFR_RATE_01_a_search_that_cannot_get_a_gate_slot_in_time_is_429_with_retry_after_and_never_waits()
    {
        var ct = TestContext.Current.CancellationToken;
        ServeSearch(HttpStatusCode.OK, File.ReadAllText(Fixture("search-recordings-duplicates.json")));

        // One request per hour: the first search takes the only slot, so the second would have to wait about an hour,
        // which is far past the 2 second cap the Api uses for interactive calls.
        using var client = Client(("MusicBrainz:MinRequestInterval", "01:00:00"));

        var first = await client.GetAsync("/api/v1/search/recordings?q=Redbone", ct);
        var second = await client.GetAsync("/api/v1/search/recordings?q=Something+else", ct);
        var problem = await second.Content.ReadFromJsonAsync<JsonElement>(ct);

        first.StatusCode.Should().Be(HttpStatusCode.OK);
        second.StatusCode.Should().Be(HttpStatusCode.TooManyRequests);
        second.Headers.RetryAfter!.Delta.Should().Be(TimeSpan.FromSeconds(2));
        problem.GetProperty("type").GetString().Should().Be(ProblemTypes.RateLimited);
        _server.LogEntries.Should().ContainSingle("the refused search never reached MusicBrainz");
    }

    [Fact]
    public async Task NFR_SEC_02_one_address_cannot_exceed_its_searches_per_minute()
    {
        var ct = TestContext.Current.CancellationToken;
        using var client = Client(("RateLimiting:SearchPermitsPerMinute", "2"));

        // Invalid searches still count: the limit is on requests, and they cost the server nothing to refuse.
        var statuses = new List<HttpStatusCode>();
        for (var i = 0; i < 3; i++)
        {
            statuses.Add((await client.GetAsync("/api/v1/search/recordings?q=a", ct)).StatusCode);
        }

        var refused = await client.GetAsync("/api/v1/search/recordings?q=a", ct);
        var problem = await refused.Content.ReadFromJsonAsync<JsonElement>(ct);

        statuses.Should().Equal(HttpStatusCode.BadRequest, HttpStatusCode.BadRequest, HttpStatusCode.TooManyRequests);
        refused.Headers.RetryAfter!.Delta.Should().BeGreaterThan(TimeSpan.Zero);
        problem.GetProperty("type").GetString().Should().Be(ProblemTypes.RateLimited);
    }

    [Fact]
    public async Task NFR_RATE_03_a_musicbrainz_that_keeps_answering_503_is_a_503_problem_with_retry_after()
    {
        var ct = TestContext.Current.CancellationToken;
        ServeSearch(HttpStatusCode.ServiceUnavailable, File.ReadAllText(Fixture("error-503.json")));
        using var client = Client(("MusicBrainz:RetryBaseDelay", "00:00:00.010"));

        var response = await client.GetAsync("/api/v1/search/recordings?q=Redbone", ct);
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>(ct);

        response.StatusCode.Should().Be(HttpStatusCode.ServiceUnavailable);
        response.Headers.RetryAfter!.Delta.Should().Be(TimeSpan.FromSeconds(5));
        problem.GetProperty("type").GetString().Should().Be(ProblemTypes.UpstreamUnavailable);

        // The Api's interactive profile allows one retry: two requests, not six.
        _server.LogEntries.Should().HaveCount(2);
    }

    [Fact]
    public async Task FR_SEARCH_01_openapi_document_describes_the_search_endpoint_and_its_problems()
    {
        var ct = TestContext.Current.CancellationToken;
        using var client = Client();

        var json = await client.GetStringAsync("/openapi/v1.json", ct);
        using var document = JsonDocument.Parse(json);

        var responses = document.RootElement
            .GetProperty("paths").GetProperty("/api/v1/search/recordings")
            .GetProperty("get").GetProperty("responses");
        responses.EnumerateObject().Select(r => r.Name).Should().BeEquivalentTo("200", "400", "429", "502", "503");
    }

    private HttpClient Client(params (string Key, string Value)[] settings) =>
        factory.WithWebHostBuilder(builder =>
        {
            builder.UseSetting("MusicBrainz:BaseUrl", _server.Url + "/ws/2/");
            foreach (var (key, value) in settings)
            {
                builder.UseSetting(key, value);
            }
        }).CreateClient();

    private void ServeSearch(HttpStatusCode status, string body) =>
        _server.Given(Request.Create().WithPath("/ws/2/recording").UsingGet())
            .RespondWith(Response.Create()
                .WithStatusCode(status)
                .WithHeader("Content-Type", "application/json")
                .WithBody(body));

    private static string Fixture(string name) => Path.Combine(AppContext.BaseDirectory, "Fixtures", "musicbrainz", name);
}
