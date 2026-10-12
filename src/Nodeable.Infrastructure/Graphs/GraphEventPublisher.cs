using System.Diagnostics;
using Microsoft.AspNetCore.SignalR;
using Nodeable.Infrastructure.Telemetry;
using StackExchange.Redis;

namespace Nodeable.Infrastructure.Graphs;

/// <summary>
/// Sends events to the browsers of a graph (spec section 9, "SignalR hub events"). Every message carries a number
/// that grows by one for each message of its graph, so a client that reconnects can tell which of the events it
/// receives are already part of the snapshot it just loaded.
/// </summary>
public interface IGraphEvents
{
    /// <summary>The number of the last message sent for the graph; 0 when none was.</summary>
    Task<long> CurrentSeqAsync(Guid graphId, CancellationToken cancellationToken = default);

    Task CreditsResolvedAsync(Guid graphId, Guid songMbid, IReadOnlyList<PersonItem> people, IReadOnlyList<CreditItem> credits, CancellationToken cancellationToken = default);

    /// <summary>Sends the new status of a song, unless this graph was already told that status. True when it was sent.</summary>
    Task<bool> SongStatusChangedAsync(Guid graphId, Guid songMbid, SongStatus status, CancellationToken cancellationToken = default);

    /// <summary>
    /// Remembers the status a song was last announced with, without sending anything: the add-song answer has
    /// already told the browser, so the next change is what the hub should report.
    /// </summary>
    Task RememberSongStatusAsync(Guid graphId, Guid songMbid, SongStatus status, CancellationToken cancellationToken = default);

    Task HubsUpdatedAsync(Guid graphId, IReadOnlyList<HubItem> hubs, CancellationToken cancellationToken = default);

    Task CrawlProgressAsync(Guid graphId, CrawlProgressItem progress, CancellationToken cancellationToken = default);

    Task CrawlFailedAsync(Guid graphId, Guid songMbid, string reason, CancellationToken cancellationToken = default);
}

public sealed class GraphEventPublisher(IHubContext<GraphHub, IGraphClient> hub, IConnectionMultiplexer redis) : IGraphEvents
{
    private IDatabase Database => redis.GetDatabase();

    private static string SeqKey(Guid graphId) => $"nodeable:graph:{graphId:N}:seq";

    private static string StatusKey(Guid graphId) => $"nodeable:graph:{graphId:N}:song-status";

    public async Task<long> CurrentSeqAsync(Guid graphId, CancellationToken cancellationToken = default)
    {
        var value = await Database.StringGetAsync(SeqKey(graphId));
        return value.HasValue ? (long)value : 0;
    }

    public Task CreditsResolvedAsync(
        Guid graphId, Guid songMbid, IReadOnlyList<PersonItem> people, IReadOnlyList<CreditItem> credits, CancellationToken cancellationToken = default) =>
        BroadcastAsync(graphId, "CreditsResolved", songMbid, (group, seq) => group.CreditsResolved(new CreditsResolvedMessage(seq, songMbid, people, credits)));

    public async Task<bool> SongStatusChangedAsync(
        Guid graphId, Guid songMbid, SongStatus status, CancellationToken cancellationToken = default)
    {
        var statusText = status.ToString();
        var previous = await Database.HashGetAsync(StatusKey(graphId), songMbid.ToString("N"));
        if (previous.HasValue && previous == statusText)
        {
            return false;
        }

        await Database.HashSetAsync(StatusKey(graphId), songMbid.ToString("N"), statusText);
        await BroadcastAsync(graphId, "SongStatusChanged", songMbid, (group, seq) => group.SongStatusChanged(new SongStatusChangedMessage(seq, songMbid, status)));
        return true;
    }

    public async Task RememberSongStatusAsync(Guid graphId, Guid songMbid, SongStatus status, CancellationToken cancellationToken = default) =>
        await Database.HashSetAsync(StatusKey(graphId), songMbid.ToString("N"), status.ToString());

    public Task HubsUpdatedAsync(Guid graphId, IReadOnlyList<HubItem> hubs, CancellationToken cancellationToken = default) =>
        BroadcastAsync(graphId, "HubsUpdated", null, (group, seq) => group.HubsUpdated(new HubsUpdatedMessage(seq, hubs)));

    public Task CrawlProgressAsync(Guid graphId, CrawlProgressItem progress, CancellationToken cancellationToken = default) =>
        BroadcastAsync(graphId, "CrawlProgress", null, (group, seq) =>
            group.CrawlProgress(new CrawlProgressMessage(seq, progress.Queued, progress.Done, progress.Failed, progress.EtaSeconds)));

    public Task CrawlFailedAsync(Guid graphId, Guid songMbid, string reason, CancellationToken cancellationToken = default) =>
        BroadcastAsync(graphId, "CrawlFailed", songMbid, (group, seq) => group.CrawlFailed(new CrawlFailedMessage(seq, songMbid, reason)));

    private async Task BroadcastAsync(Guid graphId, string eventName, Guid? songMbid, Func<IGraphClient, long, Task> send)
    {
        using var activity = InfrastructureTelemetry.ActivitySource.StartActivity("signalr.broadcast", ActivityKind.Producer);

        // The number is taken before the message is sent, and INCR is atomic in Redis, so two services sending for
        // the same graph at once get different numbers and the order of the numbers is the order they were taken in.
        var seq = await Database.StringIncrementAsync(SeqKey(graphId));

        activity?.SetTag("signalr.event", eventName);
        activity?.SetTag("graph.id", graphId);
        activity?.SetTag("seq", seq);
        if (songMbid is { } song)
        {
            activity?.SetTag("recording.mbid", song);
        }

        // LEARN: LG-03 redis-backplane | Clients.Group reaches only the connections held by this process; with the Redis backplane the message is published to Redis and every Api instance delivers it to its own connections, which is how the Worker (a different process) talks to a browser
        await send(hub.Clients.Group(GraphHub.GroupName(graphId)), seq);
    }
}
