using Nodeable.Domain.Art;
namespace Nodeable.Infrastructure.Graphs;

/// <summary>
/// Turns "these recordings changed" into the events each graph holding them should receive (spec section 7, step 6;
/// section 9). It is used by the Worker after a job, and by the Api when a song's credits were already cached and no
/// job will ever run for it.
/// </summary>
public sealed class GraphEventNotifier(GraphReadModel read, IGraphEvents events, HubsUpdatedDebouncer hubs)
{
    /// <summary>
    /// Sends the credits, the status and the progress of <paramref name="recordingMbids"/> to every graph that holds
    /// them, or only to <paramref name="onlyGraph"/> when it is given.
    /// </summary>
    public async Task NotifyCreditsChangedAsync(
        IReadOnlyCollection<Guid> recordingMbids, Guid? onlyGraph = null, CancellationToken cancellationToken = default)
    {
        var held = await FindHoldersAsync(recordingMbids, onlyGraph, cancellationToken);
        if (held.Count == 0)
        {
            return;
        }

        var songs = held.Select(h => h.RecordingMbid).Distinct().ToList();
        var credits = (await read.GetCreditsAsync(songs, cancellationToken)).ToLookup(c => c.SongMbid);
        var people = (await read.GetPeopleAsync(credits.SelectMany(g => g).Select(c => c.PersonMbid), cancellationToken))
            .ToDictionary(p => p.Mbid);
        var statuses = await read.GetSongStatusesAsync(songs, cancellationToken);
        var covers = await read.GetCoversAsync(songs, cancellationToken);

        foreach (var graph in held.GroupBy(h => h.GraphId))
        {
            foreach (var song in graph.Select(h => h.RecordingMbid).Distinct())
            {
                var songCredits = credits[song].ToList();
                var songPeople = songCredits.Select(c => c.PersonMbid).Distinct()
                    .Where(people.ContainsKey).Select(id => people[id]).ToList();

                await events.CreditsResolvedAsync(
                    graph.Key,
                    song,
                    songPeople,
                    songCredits.Select(c => new CreditItem(c.PersonMbid, c.Role, c.Detail, c.Level)).ToList(),
                    covers.GetValueOrDefault(song, CoverChoice.None),
                    cancellationToken);

                if (statuses.TryGetValue(song, out var status))
                {
                    await events.SongStatusChangedAsync(graph.Key, song, status, cancellationToken);
                }
            }

            await events.CrawlProgressAsync(graph.Key, await read.GetCrawlProgressAsync(graph.Key, cancellationToken), cancellationToken);
            hubs.Request(graph.Key);
        }
    }

    /// <summary>Tells every graph holding <paramref name="recordingMbids"/> that fetching for them gave up.</summary>
    public async Task NotifyFailedAsync(
        IReadOnlyCollection<Guid> recordingMbids, string reason, CancellationToken cancellationToken = default)
    {
        var held = await FindHoldersAsync(recordingMbids, onlyGraph: null, cancellationToken);
        if (held.Count == 0)
        {
            return;
        }

        var statuses = await read.GetSongStatusesAsync(held.Select(h => h.RecordingMbid).Distinct().ToList(), cancellationToken);

        foreach (var graph in held.GroupBy(h => h.GraphId))
        {
            foreach (var song in graph.Select(h => h.RecordingMbid).Distinct())
            {
                await events.CrawlFailedAsync(graph.Key, song, reason, cancellationToken);

                // A song whose last outstanding fetch just failed stops being "loading": it is what it is.
                if (statuses.TryGetValue(song, out var status))
                {
                    await events.SongStatusChangedAsync(graph.Key, song, status, cancellationToken);
                }
            }

            await events.CrawlProgressAsync(graph.Key, await read.GetCrawlProgressAsync(graph.Key, cancellationToken), cancellationToken);
        }
    }

    private async Task<IReadOnlyList<(Guid GraphId, Guid RecordingMbid)>> FindHoldersAsync(
        IReadOnlyCollection<Guid> recordingMbids, Guid? onlyGraph, CancellationToken cancellationToken)
    {
        var held = await read.FindGraphsHoldingAsync(recordingMbids, cancellationToken);
        return onlyGraph is { } graphId ? held.Where(h => h.GraphId == graphId).ToList() : held;
    }
}
