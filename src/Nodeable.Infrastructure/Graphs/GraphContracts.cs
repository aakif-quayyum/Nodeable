using Nodeable.Domain.Enums;

namespace Nodeable.Infrastructure.Graphs;

// The shapes the Api returns for a graph and the SignalR hub sends (spec section 9). They are plain records so the
// same type is the JSON contract, the OpenAPI schema and the generated TypeScript type.

/// <summary>
/// What the person is told about a song's credits. The stored statuses are none, partial and complete; "loading" is
/// not stored: it is reported while crawl jobs for the song are still pending or running (spec section 9).
/// </summary>
public enum SongStatus
{
    Loading,
    None,
    Partial,
    Complete,
}

/// <summary>Which relationship level a credit came from (spec section 8, the <c>recording_people</c> view).</summary>
public enum CreditLevel
{
    Recording,
    Work,
    Release,
}

public sealed record GraphSongItem(Guid Mbid, string Title, string Artist, int? Year, SongStatus CreditsStatus, DateTimeOffset AddedAt);

public sealed record PersonItem(Guid Mbid, string Name);

/// <summary>One person's role on one song, once per person, role and detail (FR-GRAPH-03).</summary>
public sealed record GraphCreditItem(Guid SongMbid, Guid PersonMbid, CreditRole Role, string Detail, CreditLevel Level);

/// <summary>A person credited on two or more songs of the graph (FR-HUB-01, FR-HUB-02).</summary>
public sealed record HubItem(Guid PersonMbid, int Songs, IReadOnlyList<CreditRole> Roles);

/// <summary>How far the background fetches for the graph's songs have come. <c>EtaSeconds</c> is queued jobs times the gate's interval.</summary>
public sealed record CrawlProgressItem(int Queued, int Done, int Failed, int EtaSeconds);

/// <summary>
/// The whole graph at one moment (<c>GET /api/v1/graphs/{id}</c>). <c>Seq</c> is the graph's event counter read
/// before the data, so every event with a higher number is newer than, or already part of, this snapshot.
/// </summary>
public sealed record GraphSnapshot(
    Guid Id,
    string Name,
    long Seq,
    IReadOnlyList<GraphSongItem> Songs,
    IReadOnlyList<PersonItem> People,
    IReadOnlyList<GraphCreditItem> Credits,
    IReadOnlyList<HubItem> Hubs,
    CrawlProgressItem Crawl);

// --- SignalR messages. Every one carries Seq, a number that grows by one for each message of its graph. ---

/// <summary>A credit as the hub sends it: the song is named once, in the message.</summary>
public sealed record CreditItem(Guid PersonMbid, CreditRole Role, string Detail, CreditLevel Level);

public sealed record CreditsResolvedMessage(long Seq, Guid SongMbid, IReadOnlyList<PersonItem> People, IReadOnlyList<CreditItem> Credits);

public sealed record SongStatusChangedMessage(long Seq, Guid SongMbid, SongStatus CreditsStatus);

public sealed record HubsUpdatedMessage(long Seq, IReadOnlyList<HubItem> Hubs);

public sealed record CrawlProgressMessage(long Seq, int Queued, int Done, int Failed, int EtaSeconds);

public sealed record CrawlFailedMessage(long Seq, Guid SongMbid, string Reason);
