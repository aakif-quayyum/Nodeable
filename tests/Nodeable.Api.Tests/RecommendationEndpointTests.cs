using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Nodeable.Api.Endpoints;
using Nodeable.Domain.Entities;
using Nodeable.Domain.Enums;
using Nodeable.Infrastructure.Graphs;
using Nodeable.Infrastructure.Persistence;
using Nodeable.Infrastructure.Recommendations;

namespace Nodeable.Api.Tests;

// FR-REC-01 and FR-REC-02 over HTTP: the real Api and a real database. Nothing external is involved: recommendations read the cache.
public sealed class RecommendationEndpointTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private static readonly JsonSerializerOptions _json = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) },
    };

    private WebApplicationFactory<Program> App(params (string Key, string Value)[] settings) =>
        factory.WithWebHostBuilder(builder =>
        {
            foreach (var (key, value) in settings)
            {
                builder.UseSetting(key, value);
            }
        });

    // A graph of two songs that share one producer (so the producer is a hub), and one stored song outside it by the same producer.
    private static async Task<(CreateGraphResponse Graph, Guid Candidate)> SeedAsync(HttpClient client, WebApplicationFactory<Program> app)
    {
        var ct = TestContext.Current.CancellationToken;
        var created = await client.PostAsJsonAsync("/api/v1/graphs", new CreateGraphRequest(null), ct);
        var graph = (await created.Content.ReadFromJsonAsync<CreateGraphResponse>(_json, ct))!;

        var person = Guid.NewGuid();
        var inGraph = new[] { Guid.NewGuid(), Guid.NewGuid() };
        var candidate = Guid.NewGuid();

        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<NodeableDbContext>();
        db.People.Add(new Person { Mbid = person, Name = "Ann Arranger", FetchedAt = DateTimeOffset.UtcNow });
        foreach (var mbid in inGraph.Append(candidate))
        {
            db.Recordings.Add(new Recording { Mbid = mbid, Title = $"Song {mbid.ToString()[..4]}", ArtistCredit = "The Band", FetchedAt = DateTimeOffset.UtcNow });
        }

        await db.SaveChangesAsync(ct);
        foreach (var mbid in inGraph)
        {
            db.GraphSongs.Add(new GraphSong { GraphId = graph.Id, RecordingMbid = mbid });
        }

        foreach (var mbid in inGraph.Append(candidate))
        {
            db.Credits.Add(new Credit { PersonMbid = person, SubjectType = CreditSubjectType.Recording, SubjectMbid = mbid, Role = CreditRole.Producer, Detail = string.Empty });
        }

        await db.SaveChangesAsync(ct);
        return (graph, candidate);
    }

    private static HttpRequestMessage Get(CreateGraphResponse graph, string query = "", string? token = null)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, $"/api/v1/graphs/{graph.Id}/recommendations{query}");
        request.Headers.Add(GraphEndpoints.TokenHeader, token ?? graph.AnonToken);
        return request;
    }

    [Fact]
    public async Task FR_REC_01_the_graph_owner_gets_ranked_recommendations_with_a_reason()
    {
        var ct = TestContext.Current.CancellationToken;
        using var app = App();
        using var client = app.CreateClient();
        var (graph, candidate) = await SeedAsync(client, app);

        var response = await client.SendAsync(Get(graph), ct);
        var body = await response.Content.ReadFromJsonAsync<RecommendationsResponse>(_json, ct);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var item = body!.Items.Should().ContainSingle().Subject;
        item.Mbid.Should().Be(candidate);
        item.HubCount.Should().Be(1);
        item.Reason.Should().StartWith("Credited with Ann Arranger (producer, on 2 of your songs)");
    }

    [Fact]
    public async Task FR_REC_01_a_wrong_token_is_401_and_an_unknown_graph_is_404()
    {
        var ct = TestContext.Current.CancellationToken;
        using var app = App();
        using var client = app.CreateClient();
        var (graph, _) = await SeedAsync(client, app);

        (await client.SendAsync(Get(graph, token: "not-the-token"), ct)).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        var unknown = new HttpRequestMessage(HttpMethod.Get, $"/api/v1/graphs/{Guid.NewGuid()}/recommendations");
        unknown.Headers.Add(GraphEndpoints.TokenHeader, graph.AnonToken);
        (await client.SendAsync(unknown, ct)).StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Theory]
    [InlineData("?limit=0")]
    [InlineData("?limit=51")]
    public async Task FR_REC_01_a_limit_outside_the_range_is_400(string query)
    {
        var ct = TestContext.Current.CancellationToken;
        using var app = App();
        using var client = app.CreateClient();
        var (graph, _) = await SeedAsync(client, app);

        var response = await client.SendAsync(Get(graph, query), ct);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await response.Content.ReadAsStringAsync(ct)).Should().Contain(ProblemTypes.InvalidRequest);
    }

    [Fact]
    public async Task NFR_SEC_02_recommendation_reads_are_limited_per_address()
    {
        var ct = TestContext.Current.CancellationToken;
        using var app = App(("RateLimiting:RecommendationPermitsPerMinute", "2"));
        using var client = app.CreateClient();
        var (graph, _) = await SeedAsync(client, app);

        var statuses = new List<HttpStatusCode>();
        for (var i = 0; i < 3; i++)
        {
            statuses.Add((await client.SendAsync(Get(graph), ct)).StatusCode);
        }

        statuses.Should().Equal(HttpStatusCode.OK, HttpStatusCode.OK, HttpStatusCode.TooManyRequests);
    }
}
