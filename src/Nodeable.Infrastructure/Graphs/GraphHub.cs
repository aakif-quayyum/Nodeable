using Microsoft.AspNetCore.SignalR;
using Nodeable.Infrastructure.Telemetry;

namespace Nodeable.Infrastructure.Graphs;

/// <summary>
/// What the server can call on a browser. Naming the messages in an interface means the compiler checks every call
/// to <c>Clients.Group(...)</c>, and the names the browser listens for are these method names.
/// </summary>
public interface IGraphClient
{
    Task CreditsResolved(CreditsResolvedMessage message);

    Task SongStatusChanged(SongStatusChangedMessage message);

    Task HubsUpdated(HubsUpdatedMessage message);

    Task CrawlProgress(CrawlProgressMessage message);

    Task CrawlFailed(CrawlFailedMessage message);
}

/// <summary>
/// The one SignalR hub (spec section 9). A browser joins the group of a graph it holds the token for, and the Api
/// and the Worker send to that group. The hub has no methods for sending: the server pushes, the browser only listens.
/// </summary>
// LEARN: LG-03 strongly-typed-hub | Deriving from Hub<IGraphClient> instead of Hub types the client side: Clients.Group(g).HubsUpdated(message) is checked by the compiler, where a JavaScript server would send the string "HubsUpdated" and find a typo at runtime
public sealed class GraphHub(IGraphAccess access) : Hub<IGraphClient>
{
    public const string Path = "/hubs/graph";

    /// <summary>The group every connection of one graph is in. Anything sent to it reaches all of the graph's browsers.</summary>
    public static string GroupName(Guid graphId) => $"graph:{graphId:N}";

    /// <summary>
    /// Starts delivery of a graph's events to this connection. The token travels as a method argument, in the body of
    /// the message: a browser's WebSocket cannot send a header, and a token in the URL would end up in logs.
    /// </summary>
    public async Task JoinGraph(Guid graphId, string token)
    {
        var result = await access.CheckAsync(graphId, token, Context.ConnectionAborted);
        if (result != GraphAccessResult.Allowed)
        {
            // One message for both causes, so the hub does not confirm which graph ids exist.
            throw new HubException("The graph was not found, or the token is not valid for it.");
        }

        await Groups.AddToGroupAsync(Context.ConnectionId, GroupName(graphId), Context.ConnectionAborted);
    }

    public Task LeaveGraph(Guid graphId) =>
        Groups.RemoveFromGroupAsync(Context.ConnectionId, GroupName(graphId), Context.ConnectionAborted);

    public override Task OnConnectedAsync()
    {
        InfrastructureTelemetry.SignalRConnections.Add(1);
        return base.OnConnectedAsync();
    }

    public override Task OnDisconnectedAsync(Exception? exception)
    {
        InfrastructureTelemetry.SignalRConnections.Add(-1);
        return base.OnDisconnectedAsync(exception);
    }
}
