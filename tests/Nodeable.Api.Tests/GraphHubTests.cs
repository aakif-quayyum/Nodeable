using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.Channels;
using Microsoft.AspNetCore.Http.Connections;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.SignalR;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.Extensions.DependencyInjection;
using Nodeable.Api.Endpoints;
using Nodeable.Domain.Enums;
using Nodeable.Infrastructure.Graphs;

namespace Nodeable.Api.Tests;

// The real hub, the real Redis backplane and a real SignalR client connected to the Api in memory. The events are
// published through IGraphEvents, the same service the Worker uses from its own process.
public sealed class GraphHubTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private static readonly Guid _redbone = Guid.Parse("7408f11c-6c4e-41e5-b81b-6a15bf6cb268");
    private static readonly Guid _donald = Guid.Parse("0e9a2dd2-4d9b-4a3b-8b3f-1d5d0b5d2a01");

    private static readonly JsonSerializerOptions _json = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) },
    };

    private static readonly TimeSpan _wait = TimeSpan.FromSeconds(10);

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task FR_GRAPH_02_a_browser_that_joined_receives_the_events_in_sequence()
    {
        using var app = factory.WithWebHostBuilder(_ => { });
        var graph = await CreateGraph(app);
        await using var connection = await ConnectAsync(app);
        var received = Listen(connection);
        await connection.InvokeAsync("JoinGraph", graph.Id, graph.AnonToken, Ct);

        var events = app.Services.GetRequiredService<IGraphEvents>();
        await events.CreditsResolvedAsync(
            graph.Id,
            _redbone,
            [new PersonItem(_donald, "Donald Glover")],
            [new CreditItem(_donald, CreditRole.Producer, string.Empty, CreditLevel.Recording)],
            cancellationToken: Ct);
        await events.SongStatusChangedAsync(graph.Id, _redbone, SongStatus.Complete, Ct);
        await events.HubsUpdatedAsync(graph.Id, [new HubItem(_donald, 2, [CreditRole.Producer])], Ct);

        var first = await Next(received);
        var second = await Next(received);
        var third = await Next(received);

        (first.Name, first.Seq).Should().Be(("CreditsResolved", 1L));
        (second.Name, second.Seq).Should().Be(("SongStatusChanged", 2L));
        (third.Name, third.Seq).Should().Be(("HubsUpdated", 3L));

        var credits = first.Body.Deserialize<CreditsResolvedMessage>(_json)!;
        credits.People.Should().ContainSingle().Which.Name.Should().Be("Donald Glover");
        credits.Credits.Should().ContainSingle().Which.Role.Should().Be(CreditRole.Producer);
        second.Body.GetProperty("creditsStatus").GetString().Should().Be("complete");
        third.Body.GetProperty("hubs")[0].GetProperty("roles")[0].GetString().Should().Be("producer");
    }

    [Fact]
    public async Task FR_GRAPH_02_the_snapshot_reports_the_number_of_the_last_event_so_a_client_can_drop_older_ones()
    {
        using var app = factory.WithWebHostBuilder(_ => { });
        var graph = await CreateGraph(app);
        var events = app.Services.GetRequiredService<IGraphEvents>();

        await events.CrawlProgressAsync(graph.Id, new CrawlProgressItem(1, 0, 0, 1), Ct);
        await events.CrawlProgressAsync(graph.Id, new CrawlProgressItem(0, 1, 0, 0), Ct);

        using var client = app.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Get, $"/api/v1/graphs/{graph.Id}");
        request.Headers.Add(GraphEndpoints.TokenHeader, graph.AnonToken);
        var snapshot = await (await client.SendAsync(request, Ct)).Content.ReadFromJsonAsync<GraphSnapshot>(_json, Ct);

        snapshot!.Seq.Should().Be(2);
        (await events.CurrentSeqAsync(graph.Id, Ct)).Should().Be(2);
    }

    [Fact]
    public async Task FR_GRAPH_02_each_graph_has_its_own_sequence_starting_at_one()
    {
        using var app = factory.WithWebHostBuilder(_ => { });
        var graphA = await CreateGraph(app);
        var graphB = await CreateGraph(app);
        var events = app.Services.GetRequiredService<IGraphEvents>();

        await events.CrawlProgressAsync(graphA.Id, new CrawlProgressItem(1, 0, 0, 1), Ct);
        await events.CrawlProgressAsync(graphA.Id, new CrawlProgressItem(1, 0, 0, 1), Ct);
        await events.CrawlProgressAsync(graphB.Id, new CrawlProgressItem(1, 0, 0, 1), Ct);

        (await events.CurrentSeqAsync(graphA.Id, Ct)).Should().Be(2);
        (await events.CurrentSeqAsync(graphB.Id, Ct)).Should().Be(1);
    }

    [Fact]
    public async Task FR_GRAPH_01_joining_with_the_wrong_token_is_refused_and_receives_nothing()
    {
        using var app = factory.WithWebHostBuilder(_ => { });
        var graph = await CreateGraph(app);
        var other = await CreateGraph(app);
        await using var connection = await ConnectAsync(app);
        var received = Listen(connection);

        var act = () => connection.InvokeAsync("JoinGraph", graph.Id, other.AnonToken, Ct);
        var refused = await act.Should().ThrowAsync<HubException>();
        await app.Services.GetRequiredService<IGraphEvents>().CrawlProgressAsync(graph.Id, new CrawlProgressItem(1, 0, 0, 1), Ct);

        refused.Which.Message.Should().Contain("not found, or the token is not valid");
        (await NoneWithin(received, TimeSpan.FromMilliseconds(500))).Should().BeTrue();
    }

    [Fact]
    public async Task FR_GRAPH_01_an_unknown_graph_is_refused_with_the_same_message_as_a_wrong_token()
    {
        using var app = factory.WithWebHostBuilder(_ => { });
        var graph = await CreateGraph(app);
        await using var connection = await ConnectAsync(app);

        var wrongToken = await FailureMessage(() => connection.InvokeAsync("JoinGraph", graph.Id, "not-the-token", Ct));
        var unknownGraph = await FailureMessage(() => connection.InvokeAsync("JoinGraph", Guid.NewGuid(), graph.AnonToken, Ct));

        unknownGraph.Should().Be(wrongToken, "the hub must not confirm which graph ids exist");
    }

    [Fact]
    public async Task FR_GRAPH_02_a_browser_only_hears_about_the_graph_it_joined()
    {
        using var app = factory.WithWebHostBuilder(_ => { });
        var mine = await CreateGraph(app);
        var theirs = await CreateGraph(app);
        await using var connection = await ConnectAsync(app);
        var received = Listen(connection);
        await connection.InvokeAsync("JoinGraph", mine.Id, mine.AnonToken, Ct);

        var events = app.Services.GetRequiredService<IGraphEvents>();
        await events.CrawlProgressAsync(theirs.Id, new CrawlProgressItem(9, 0, 0, 9), Ct);
        await events.CrawlProgressAsync(mine.Id, new CrawlProgressItem(1, 0, 0, 1), Ct);

        var only = await Next(received);

        only.Body.GetProperty("queued").GetInt32().Should().Be(1);
        (await NoneWithin(received, TimeSpan.FromMilliseconds(500))).Should().BeTrue();
    }

    [Fact]
    public async Task FR_GRAPH_02_leaving_a_graph_stops_its_events()
    {
        using var app = factory.WithWebHostBuilder(_ => { });
        var graph = await CreateGraph(app);
        await using var connection = await ConnectAsync(app);
        var received = Listen(connection);
        await connection.InvokeAsync("JoinGraph", graph.Id, graph.AnonToken, Ct);
        await connection.InvokeAsync("LeaveGraph", graph.Id, Ct);

        await app.Services.GetRequiredService<IGraphEvents>().CrawlProgressAsync(graph.Id, new CrawlProgressItem(1, 0, 0, 1), Ct);

        (await NoneWithin(received, TimeSpan.FromMilliseconds(500))).Should().BeTrue();
    }

    [Fact]
    public async Task FR_GRAPH_02_a_status_is_announced_when_it_changes_and_not_again_while_it_stays_the_same()
    {
        using var app = factory.WithWebHostBuilder(_ => { });
        var graph = await CreateGraph(app);
        await using var connection = await ConnectAsync(app);
        var received = Listen(connection);
        await connection.InvokeAsync("JoinGraph", graph.Id, graph.AnonToken, Ct);
        var events = app.Services.GetRequiredService<IGraphEvents>();

        var first = await events.SongStatusChangedAsync(graph.Id, _redbone, SongStatus.Partial, Ct);
        var repeat = await events.SongStatusChangedAsync(graph.Id, _redbone, SongStatus.Partial, Ct);
        var changed = await events.SongStatusChangedAsync(graph.Id, _redbone, SongStatus.Complete, Ct);

        (first, repeat, changed).Should().Be((true, false, true));
        var one = await Next(received);
        var two = await Next(received);
        (one.Seq, two.Seq).Should().Be((1L, 2L), "the repeat took no sequence number");
        (await NoneWithin(received, TimeSpan.FromMilliseconds(300))).Should().BeTrue();
    }

    [Fact]
    public async Task FR_GRAPH_02_a_status_remembered_from_the_add_answer_is_not_announced_again()
    {
        using var app = factory.WithWebHostBuilder(_ => { });
        var graph = await CreateGraph(app);
        var events = app.Services.GetRequiredService<IGraphEvents>();

        await events.RememberSongStatusAsync(graph.Id, _redbone, SongStatus.Loading, Ct);
        var sameAgain = await events.SongStatusChangedAsync(graph.Id, _redbone, SongStatus.Loading, Ct);
        var leftLoading = await events.SongStatusChangedAsync(graph.Id, _redbone, SongStatus.Partial, Ct);

        (sameAgain, leftLoading).Should().Be((false, true));
    }

    [Fact]
    public async Task FR_GRAPH_02_failures_and_progress_have_the_documented_names_and_fields()
    {
        using var app = factory.WithWebHostBuilder(_ => { });
        var graph = await CreateGraph(app);
        await using var connection = await ConnectAsync(app);
        var received = Listen(connection);
        await connection.InvokeAsync("JoinGraph", graph.Id, graph.AnonToken, Ct);
        var events = app.Services.GetRequiredService<IGraphEvents>();

        await events.CrawlProgressAsync(graph.Id, new CrawlProgressItem(Queued: 3, Done: 2, Failed: 1, EtaSeconds: 3), Ct);
        await events.CrawlFailedAsync(graph.Id, _redbone, "could not be fetched", Ct);

        var progress = await Next(received);
        var failed = await Next(received);

        progress.Name.Should().Be("CrawlProgress");
        (progress.Body.GetProperty("queued").GetInt32(), progress.Body.GetProperty("done").GetInt32(),
            progress.Body.GetProperty("failed").GetInt32(), progress.Body.GetProperty("etaSeconds").GetInt32())
            .Should().Be((3, 2, 1, 3));
        failed.Name.Should().Be("CrawlFailed");
        failed.Body.GetProperty("songMbid").GetGuid().Should().Be(_redbone);
        failed.Body.GetProperty("reason").GetString().Should().Be("could not be fetched");
    }

    // --- helpers ---

    private static async Task<CreateGraphResponse> CreateGraph(WebApplicationFactory<Program> app)
    {
        using var client = app.CreateClient();
        var response = await client.PostAsJsonAsync("/api/v1/graphs", new CreateGraphRequest(null), Ct);
        return (await response.Content.ReadFromJsonAsync<CreateGraphResponse>(_json, Ct))!;
    }

    private static async Task<HubConnection> ConnectAsync(WebApplicationFactory<Program> app)
    {
        // CreateClient starts the in-memory server; its handler is what the SignalR client must send its requests through.
        using var _ = app.CreateClient();
        var server = app.Server;

        var connection = new HubConnectionBuilder()
            .WithUrl(new Uri(server.BaseAddress, GraphHub.Path), options =>
            {
                options.HttpMessageHandlerFactory = _ => server.CreateHandler();

                // The in-memory server has no WebSocket; long polling is the transport SignalR falls back to.
                options.Transports = HttpTransportType.LongPolling;
            })
            .AddJsonProtocol(protocol => protocol.PayloadSerializerOptions.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.CamelCase)))
            .Build();

        await connection.StartAsync(Ct);
        return connection;
    }

    private sealed record Received(string Name, long Seq, JsonElement Body);

    // Every message the hub can send is caught as raw JSON, so the tests see the field names on the wire.
    private static Channel<Received> Listen(HubConnection connection)
    {
        var channel = Channel.CreateUnbounded<Received>();
        foreach (var name in new[] { "CreditsResolved", "SongStatusChanged", "HubsUpdated", "CrawlProgress", "CrawlFailed" })
        {
            connection.On<JsonElement>(name, body => channel.Writer.TryWrite(new Received(name, body.GetProperty("seq").GetInt64(), body)));
        }

        return channel;
    }

    private static async Task<Received> Next(Channel<Received> channel)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(Ct);
        timeout.CancelAfter(_wait);
        return await channel.Reader.ReadAsync(timeout.Token);
    }

    private static async Task<bool> NoneWithin(Channel<Received> channel, TimeSpan window)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(Ct);
        timeout.CancelAfter(window);
        try
        {
            await channel.Reader.ReadAsync(timeout.Token);
            return false;
        }
        catch (OperationCanceledException) when (!Ct.IsCancellationRequested)
        {
            return true;
        }
    }

    private static async Task<string> FailureMessage(Func<Task> act)
    {
        try
        {
            await act();
        }
        catch (HubException exception)
        {
            return exception.Message;
        }

        throw new InvalidOperationException("The hub accepted a join that it should have refused.");
    }
}
