using System.ComponentModel.DataAnnotations;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Nodeable.Domain.Art;
using Nodeable.Domain.Entities;
using Nodeable.Domain.Graphs;
using Nodeable.Infrastructure.Crawling;
using Nodeable.Infrastructure.Persistence;

namespace Nodeable.Infrastructure.Graphs;

/// <summary>Settings for graphs, bound from the "Graphs" configuration section.</summary>
public sealed class GraphOptions
{
    public const string SectionName = "Graphs";

    /// <summary>FR-GRAPH-01: a graph holds 1 to 50 songs.</summary>
    [Range(1, 500)]
    public int MaxSongs { get; set; } = 50;

    [Required]
    public string DefaultName { get; set; } = "Untitled graph";

    [Range(1, 200)]
    public int MaxNameLength { get; set; } = 100;
}

public sealed record CreatedGraph(Guid Id, string Name, string AnonToken);

public enum AddSongStatus
{
    /// <summary>The song is in the graph now, and its credits are cached, loading or queued.</summary>
    Added,

    /// <summary>The song was already in the graph; nothing changed.</summary>
    AlreadyInGraph,

    /// <summary>The graph holds the most songs it may (FR-GRAPH-01).</summary>
    GraphFull,

    /// <summary>MusicBrainz has no recording with that MBID.</summary>
    RecordingNotFound,
}

/// <param name="PendingJobs">Fetches still outstanding for the song. 0 when the credits were already cached.</param>
public sealed record AddSongResult(AddSongStatus Status, GraphSongItem? Song, int PendingJobs);

/// <summary>
/// What the Api does with graphs (spec section 9): create one, read it whole, add and remove songs. Adding a song is
/// the Api's half of the flow in section 7: answer from the cache when possible, otherwise queue the one fetch that
/// everything else follows from (decision 0009).
/// </summary>
public sealed class GraphService(
    NodeableDbContext db,
    GraphReadModel read,
    IGraphEvents events,
    SongIngestionService ingestion,
    IRecordingResolver resolver,
    GraphEventNotifier notifier,
    HubsUpdatedDebouncer hubs,
    IOptions<GraphOptions> options,
    TimeProvider time)
{
    public async Task<CreatedGraph> CreateAsync(string? name, CancellationToken cancellationToken)
    {
        var settings = options.Value;
        var trimmed = name?.Trim();
        var graphName = string.IsNullOrEmpty(trimmed)
            ? settings.DefaultName
            : trimmed[..Math.Min(trimmed.Length, settings.MaxNameLength)];

        // The plain token goes back to the person once and is never stored; only its hash is (decision 0007).
        var token = GraphToken.Generate();

        // A version 7 Guid starts with a timestamp, so new graphs land at the end of the primary key index.
        var graph = new Graph { Id = Guid.CreateVersion7(), Name = graphName, AnonTokenHash = GraphToken.Hash(token) };
        db.Graphs.Add(graph);
        await db.SaveChangesAsync(cancellationToken);

        return new CreatedGraph(graph.Id, graph.Name, token);
    }

    /// <summary>The whole graph, or null when there is no such graph. The caller has already checked the token.</summary>
    public async Task<GraphSnapshot?> GetSnapshotAsync(Guid graphId, CancellationToken cancellationToken)
    {
        var graph = await db.Graphs.AsNoTracking()
            .Where(g => g.Id == graphId)
            .Select(g => new { g.Id, g.Name })
            .FirstOrDefaultAsync(cancellationToken);
        if (graph is null)
        {
            return null;
        }

        // LEARN: LG-03 seq-before-snapshot | The counter is read before the data: an event numbered above it is newer than, or already inside, the snapshot, so the client applies it again harmlessly; reading it after could skip an event that the data did not yet include
        var seq = await events.CurrentSeqAsync(graphId, cancellationToken);

        var songs = await read.GetSongsAsync(graphId, cancellationToken);
        var credits = await read.GetCreditsAsync(songs.Select(s => s.Mbid).ToList(), cancellationToken);
        var people = await read.GetPeopleAsync(credits.Select(c => c.PersonMbid), cancellationToken);
        var hubItems = await read.GetHubsAsync(graphId, cancellationToken);
        var crawl = await read.GetCrawlProgressAsync(graphId, cancellationToken);

        return new GraphSnapshot(graph.Id, graph.Name, seq, songs, people, credits, hubItems, crawl);
    }

    public async Task<AddSongResult> AddSongAsync(Guid graphId, Guid recordingMbid, CancellationToken cancellationToken)
    {
        var songs = await read.GetSongsAsync(graphId, cancellationToken);
        if (songs.FirstOrDefault(s => s.Mbid == recordingMbid) is { } existing)
        {
            return new AddSongResult(AddSongStatus.AlreadyInGraph, existing, PendingJobs: 0);
        }

        if (songs.Count >= options.Value.MaxSongs)
        {
            return new AddSongResult(AddSongStatus.GraphFull, null, PendingJobs: 0);
        }

        var known = await db.Recordings.AsNoTracking()
            .Where(r => r.Mbid == recordingMbid)
            .Select(r => new { r.Title, r.ArtistCredit, r.FirstReleaseDate })
            .FirstOrDefaultAsync(cancellationToken);

        string title;
        string artist;
        int? year;
        if (known is not null)
        {
            (title, artist, year) = (known.Title, known.ArtistCredit, known.FirstReleaseDate?.Year);
        }
        else
        {
            var resolved = await resolver.ResolveAsync(recordingMbid, cancellationToken);
            if (resolved is null)
            {
                return new AddSongResult(AddSongStatus.RecordingNotFound, null, PendingJobs: 0);
            }

            (title, artist, year) = (resolved.Title, resolved.ArtistCredit, null);
        }

        var request = await ingestion.RequestAsync(recordingMbid, title, artist, cancellationToken);

        // DO NOTHING makes a double click, or two tabs adding the same song, one row instead of an error.
        await db.Database.ExecuteSqlAsync(
            $"INSERT INTO graph_songs (graph_id, recording_mbid) VALUES ({graphId}, {recordingMbid}) ON CONFLICT DO NOTHING",
            cancellationToken);

        var status = (await read.GetSongStatusesAsync([recordingMbid], cancellationToken))[recordingMbid];
        var cover = (await read.GetCoversAsync([recordingMbid], cancellationToken)).GetValueOrDefault(recordingMbid, CoverChoice.None);
        var song = new GraphSongItem(recordingMbid, title, artist, year, status, time.GetUtcNow(), cover.ReleaseMbid, cover.ReleaseGroupMbid);

        if (request == IngestionRequestResult.Cached)
        {
            // No job will run, so nothing would ever tell the graph's browsers. Say it now, to this graph only.
            await notifier.NotifyCreditsChangedAsync([recordingMbid], graphId, cancellationToken);
            return new AddSongResult(AddSongStatus.Added, song, PendingJobs: 0);
        }

        // The answer carries "loading"; remember that, so the first event after it is the change out of loading.
        await events.RememberSongStatusAsync(graphId, recordingMbid, status, cancellationToken);
        var pending = await read.CountPendingJobsAsync(recordingMbid, cancellationToken);
        return new AddSongResult(AddSongStatus.Added, song, pending);
    }

    /// <summary>Removes a song from a graph. False when it was not in it. The recording and its credits stay in the cache.</summary>
    public async Task<bool> RemoveSongAsync(Guid graphId, Guid recordingMbid, CancellationToken cancellationToken)
    {
        var removed = await db.GraphSongs
            .Where(gs => gs.GraphId == graphId && gs.RecordingMbid == recordingMbid)
            .ExecuteDeleteAsync(cancellationToken);

        if (removed > 0)
        {
            // The hubs may have lost a person; the other browsers of this graph are told.
            hubs.Request(graphId);
        }

        return removed > 0;
    }
}
