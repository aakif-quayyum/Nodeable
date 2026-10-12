using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Nodeable.Api.Endpoints;
using Nodeable.Infrastructure.Graphs;
using WireMock.RequestBuilders;
using WireMock.ResponseBuilders;
using WireMock.Server;

namespace Nodeable.Api.Tests;

// The graph endpoints through the whole stack: HTTP, token check, the real database and the real MusicBrainz client
// pipeline, with WireMock answering as MusicBrainz for the one lookup that confirms a recording before it is stored.
public sealed class GraphEndpointTests(ApiFactory factory) : IClassFixture<ApiFactory>, IDisposable
{
    private static readonly Guid _redbone = Guid.Parse("7408f11c-6c4e-41e5-b81b-6a15bf6cb268");

    private static readonly JsonSerializerOptions _json = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) },
    };

    private readonly WireMockServer _server = WireMockServer.Start();

    public void Dispose() => _server.Dispose();

    [Fact]
    public async Task FR_GRAPH_01_creating_a_graph_returns_201_with_its_address_and_a_token_that_opens_it()
    {
        var ct = TestContext.Current.CancellationToken;
        using var client = Client();

        var response = await client.PostAsJsonAsync("/api/v1/graphs", new CreateGraphRequest("Road trip"), ct);
        var created = await response.Content.ReadFromJsonAsync<CreateGraphResponse>(_json, ct);

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        response.Headers.Location!.ToString().Should().Be($"/api/v1/graphs/{created!.Id}");
        created.Name.Should().Be("Road trip");
        created.AnonToken.Should().HaveLength(43);

        var opened = await Get(client, created.Id, created.AnonToken, ct);
        opened.StatusCode.Should().Be(HttpStatusCode.OK);
        var snapshot = await opened.Content.ReadFromJsonAsync<GraphSnapshot>(_json, ct);
        (snapshot!.Id, snapshot.Name, snapshot.Seq).Should().Be((created.Id, "Road trip", 0L));
        snapshot.Songs.Should().BeEmpty();
    }

    [Fact]
    public async Task FR_GRAPH_01_a_graph_can_be_created_with_no_body_at_all()
    {
        var ct = TestContext.Current.CancellationToken;
        using var client = Client();

        var response = await client.PostAsync("/api/v1/graphs", content: null, ct);
        var created = await response.Content.ReadFromJsonAsync<CreateGraphResponse>(_json, ct);

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        created!.Name.Should().Be("Untitled graph");
    }

    [Fact]
    public async Task FR_GRAPH_01_the_token_is_required_and_must_be_the_graphs_own()
    {
        var ct = TestContext.Current.CancellationToken;
        using var client = Client();
        var mine = await Create(client, ct);
        var theirs = await Create(client, ct);

        var missing = await Get(client, mine.Id, null, ct);
        var wrong = await Get(client, mine.Id, theirs.AnonToken, ct);
        var unknown = await Get(client, Guid.NewGuid(), mine.AnonToken, ct);

        missing.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        wrong.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await ProblemType(missing, ct)).Should().Be(ProblemTypes.InvalidGraphToken);
        (await ProblemType(wrong, ct)).Should().Be(ProblemTypes.InvalidGraphToken);
        unknown.StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await ProblemType(unknown, ct)).Should().Be(ProblemTypes.GraphNotFound);
    }

    [Fact]
    public async Task FR_GRAPH_02_adding_a_song_answers_202_with_the_song_loading_and_one_fetch_pending()
    {
        var ct = TestContext.Current.CancellationToken;
        ServeRecording(_redbone, "Redbone", "Childish Gambino");
        using var client = Client();
        var graph = await Create(client, ct);

        var response = await Add(client, graph, _redbone, ct);
        var body = await response.Content.ReadFromJsonAsync<AddSongResponse>(_json, ct);

        response.StatusCode.Should().Be(HttpStatusCode.Accepted);
        body!.PendingJobs.Should().Be(1);
        body.Song.Should().Match<GraphSongItem>(s =>
            s.Mbid == _redbone && s.Title == "Redbone" && s.Artist == "Childish Gambino" && s.CreditsStatus == SongStatus.Loading);

        // The title came from MusicBrainz, never from the request: the request carries only the MBID.
        var lookup = _server.LogEntries.Single().RequestMessage!;
        lookup.Path.Should().Be($"/ws/2/recording/{_redbone}");
        lookup.Query!["inc"].Single().Should().Be("artist-credits");

        var snapshot = await (await Get(client, graph.Id, graph.AnonToken, ct)).Content.ReadFromJsonAsync<GraphSnapshot>(_json, ct);
        snapshot!.Songs.Should().ContainSingle().Which.Title.Should().Be("Redbone");
        snapshot.Crawl.Queued.Should().Be(1);
    }

    [Fact]
    public async Task FR_GRAPH_02_the_wire_format_names_the_status_in_camel_case()
    {
        var ct = TestContext.Current.CancellationToken;
        ServeRecording(_redbone, "Redbone", "Childish Gambino");
        using var client = Client();
        var graph = await Create(client, ct);

        var response = await Add(client, graph, _redbone, ct);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));

        document.RootElement.GetProperty("song").GetProperty("creditsStatus").GetString().Should().Be("loading");
        document.RootElement.GetProperty("pendingJobs").GetInt32().Should().Be(1);
    }

    [Fact]
    public async Task FR_GRAPH_02_adding_a_song_that_is_already_in_the_graph_answers_200_and_changes_nothing()
    {
        var ct = TestContext.Current.CancellationToken;
        ServeRecording(_redbone, "Redbone", "Childish Gambino");
        using var client = Client();
        var graph = await Create(client, ct);

        await Add(client, graph, _redbone, ct);
        var again = await Add(client, graph, _redbone, ct);

        again.StatusCode.Should().Be(HttpStatusCode.OK);
        _server.LogEntries.Should().ContainSingle("the second add never asks MusicBrainz");
    }

    [Fact]
    public async Task FR_GRAPH_02_a_recording_musicbrainz_does_not_have_is_404_and_stores_nothing()
    {
        var ct = TestContext.Current.CancellationToken;
        _server.Given(Request.Create().WithPath($"/ws/2/recording/{_redbone}").UsingGet())
            .RespondWith(Response.Create().WithStatusCode(404).WithBody("{\"error\":\"Not Found\"}"));
        using var client = Client();
        var graph = await Create(client, ct);

        var response = await Add(client, graph, _redbone, ct);

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await ProblemType(response, ct)).Should().Be(ProblemTypes.RecordingNotFound);
        var snapshot = await (await Get(client, graph.Id, graph.AnonToken, ct)).Content.ReadFromJsonAsync<GraphSnapshot>(_json, ct);
        snapshot!.Songs.Should().BeEmpty();
        snapshot.Crawl.Queued.Should().Be(0);
    }

    [Fact]
    public async Task NFR_RATE_03_a_musicbrainz_that_keeps_answering_503_makes_adding_a_503_with_retry_after()
    {
        var ct = TestContext.Current.CancellationToken;
        _server.Given(Request.Create().WithPath($"/ws/2/recording/{_redbone}").UsingGet())
            .RespondWith(Response.Create().WithStatusCode(503).WithBody("{\"error\":\"busy\"}"));
        using var client = Client(("MusicBrainz:RetryBaseDelay", "00:00:00.010"));
        var graph = await Create(client, ct);

        var response = await Add(client, graph, _redbone, ct);

        response.StatusCode.Should().Be(HttpStatusCode.ServiceUnavailable);
        (await ProblemType(response, ct)).Should().Be(ProblemTypes.UpstreamUnavailable);
        response.Headers.RetryAfter!.Delta.Should().Be(TimeSpan.FromSeconds(5));
    }

    [Fact]
    public async Task FR_GRAPH_01_a_full_graph_refuses_another_song_with_409()
    {
        var ct = TestContext.Current.CancellationToken;
        ServeRecording(_redbone, "Redbone", "Childish Gambino");
        var second = Guid.Parse("ac5977af-d4dc-4636-b867-b02e15d2f6d8");
        ServeRecording(second, "Stay", "Rihanna");
        using var client = Client(("Graphs:MaxSongs", "1"));
        var graph = await Create(client, ct);

        await Add(client, graph, _redbone, ct);
        var refused = await Add(client, graph, second, ct);

        refused.StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await ProblemType(refused, ct)).Should().Be(ProblemTypes.GraphFull);
    }

    [Fact]
    public async Task FR_GRAPH_01_adding_with_the_wrong_token_is_401_and_queues_nothing()
    {
        var ct = TestContext.Current.CancellationToken;
        ServeRecording(_redbone, "Redbone", "Childish Gambino");
        using var client = Client();
        var graph = await Create(client, ct);
        var other = await Create(client, ct);

        var response = await Add(client, graph with { AnonToken = other.AnonToken }, _redbone, ct);

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        _server.LogEntries.Should().BeEmpty("a request without the token must not cost a MusicBrainz request");
    }

    [Fact]
    public async Task FR_GRAPH_02_a_request_with_no_recording_is_400()
    {
        var ct = TestContext.Current.CancellationToken;
        using var client = Client();
        var graph = await Create(client, ct);

        var response = await Add(client, graph, Guid.Empty, ct);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await ProblemType(response, ct)).Should().Be(ProblemTypes.InvalidRequest);
    }

    [Fact]
    public async Task FR_GRAPH_01_removing_a_song_answers_204_and_a_second_time_404()
    {
        var ct = TestContext.Current.CancellationToken;
        ServeRecording(_redbone, "Redbone", "Childish Gambino");
        using var client = Client();
        var graph = await Create(client, ct);
        await Add(client, graph, _redbone, ct);

        var first = await Remove(client, graph, _redbone, graph.AnonToken, ct);
        var second = await Remove(client, graph, _redbone, graph.AnonToken, ct);
        var wrongToken = await Remove(client, graph, _redbone, "nope", ct);

        first.StatusCode.Should().Be(HttpStatusCode.NoContent);
        second.StatusCode.Should().Be(HttpStatusCode.NotFound);
        wrongToken.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        var snapshot = await (await Get(client, graph.Id, graph.AnonToken, ct)).Content.ReadFromJsonAsync<GraphSnapshot>(_json, ct);
        snapshot!.Songs.Should().BeEmpty();
    }

    [Fact]
    public async Task NFR_SEC_02_one_address_cannot_add_more_songs_than_its_limit_in_a_minute()
    {
        var ct = TestContext.Current.CancellationToken;
        ServeRecording(_redbone, "Redbone", "Childish Gambino");
        using var client = Client(("RateLimiting:SongAdditionPermitsPerMinute", "2"));
        var graph = await Create(client, ct);

        var statuses = new List<HttpStatusCode>();
        for (var i = 0; i < 3; i++)
        {
            statuses.Add((await Add(client, graph, _redbone, ct)).StatusCode);
        }

        // The first adds the song, the second finds it already there; both count. The third is over the limit.
        statuses.Should().Equal(HttpStatusCode.Accepted, HttpStatusCode.OK, HttpStatusCode.TooManyRequests);
    }

    [Fact]
    public async Task FR_GRAPH_01_openapi_document_describes_the_graph_endpoints()
    {
        var ct = TestContext.Current.CancellationToken;
        using var client = Client();

        using var document = JsonDocument.Parse(await client.GetStringAsync("/openapi/v1.json", ct));
        var paths = document.RootElement.GetProperty("paths");

        paths.GetProperty("/api/v1/graphs").TryGetProperty("post", out _).Should().BeTrue();
        paths.GetProperty("/api/v1/graphs/{id}").TryGetProperty("get", out _).Should().BeTrue();
        paths.GetProperty("/api/v1/graphs/{id}/songs").TryGetProperty("post", out _).Should().BeTrue();
        paths.GetProperty("/api/v1/graphs/{id}/songs/{mbid}").TryGetProperty("delete", out _).Should().BeTrue();
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

    // The shape of MusicBrainz's answer to recording/{mbid}?inc=artist-credits, with the names MusicBrainz uses.
    private void ServeRecording(Guid mbid, string title, string artist)
    {
        var body = JsonSerializer.Serialize(new Dictionary<string, object?>
        {
            ["id"] = mbid,
            ["title"] = title,
            ["artist-credit"] = new[]
            {
                new Dictionary<string, object?>
                {
                    ["name"] = artist,
                    ["artist"] = new { id = Guid.NewGuid(), name = artist },
                },
            },
        });

        _server.Given(Request.Create().WithPath($"/ws/2/recording/{mbid}").UsingGet())
            .RespondWith(Response.Create().WithStatusCode(200).WithHeader("Content-Type", "application/json").WithBody(body));
    }

    private static async Task<CreateGraphResponse> Create(HttpClient client, CancellationToken ct)
    {
        var response = await client.PostAsJsonAsync("/api/v1/graphs", new CreateGraphRequest(null), ct);
        return (await response.Content.ReadFromJsonAsync<CreateGraphResponse>(_json, ct))!;
    }

    private static async Task<HttpResponseMessage> Get(HttpClient client, Guid id, string? token, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, $"/api/v1/graphs/{id}");
        if (token is not null)
        {
            request.Headers.Add(GraphEndpoints.TokenHeader, token);
        }

        return await client.SendAsync(request, ct);
    }

    private static async Task<HttpResponseMessage> Add(HttpClient client, CreateGraphResponse graph, Guid recording, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/graphs/{graph.Id}/songs")
        {
            Content = JsonContent.Create(new AddSongRequest(recording)),
        };
        request.Headers.Add(GraphEndpoints.TokenHeader, graph.AnonToken);
        return await client.SendAsync(request, ct);
    }

    private static async Task<HttpResponseMessage> Remove(HttpClient client, CreateGraphResponse graph, Guid recording, string token, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(HttpMethod.Delete, $"/api/v1/graphs/{graph.Id}/songs/{recording}");
        request.Headers.Add(GraphEndpoints.TokenHeader, token);
        return await client.SendAsync(request, ct);
    }

    private static async Task<string?> ProblemType(HttpResponseMessage response, CancellationToken ct) =>
        (await response.Content.ReadFromJsonAsync<JsonElement>(ct)).GetProperty("type").GetString();
}
