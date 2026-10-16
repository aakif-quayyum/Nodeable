using Microsoft.EntityFrameworkCore;
using Nodeable.Domain.Enums;
using Nodeable.Infrastructure.Persistence;
using Nodeable.Infrastructure.Telemetry;

namespace Nodeable.Infrastructure.Recommendations;

/// <summary>
/// Recommendations for a graph (FR-REC-01, FR-REC-02), computed from the stored credits only: the <c>recording_people</c>
/// view that the graph's hubs come from (spec section 8). MusicBrainz is not asked (decision D3, 2026-10-14), so a
/// recommendation is only ever a song Nodeable already holds, and the list grows as the cache does.
/// </summary>
public sealed class RecommendationReadModel(NodeableDbContext db)
{
    /// <summary>How many hubs a reason names before it says "and N more".</summary>
    private const int NamedHubs = 3;

    /// <summary>How many roles a hub is described with before the rest are counted.</summary>
    private const int NamedRoles = 2;

    // Rows are shaped by column alias: a keyless type is filled by name (as in GraphReadModel).
    private sealed class ScoredRow
    {
        public Guid Mbid { get; set; }
        public string Title { get; set; } = string.Empty;
        public string Artist { get; set; } = string.Empty;
        public int? Year { get; set; }
        public int HubCount { get; set; }
        public int SharedSongs { get; set; }
    }

    private sealed class HubRow
    {
        public Guid RecordingMbid { get; set; }
        public Guid PersonMbid { get; set; }
        public string Name { get; set; } = string.Empty;
        public int GraphSongs { get; set; }
        public string[] Roles { get; set; } = [];
    }

    /// <summary>The best <paramref name="limit"/> recommendations, in a fixed order. Empty when the graph has no hubs yet.</summary>
    public async Task<IReadOnlyList<RecommendationItem>> GetAsync(Guid graphId, int limit, CancellationToken cancellationToken)
    {
        using var activity = InfrastructureTelemetry.ActivitySource.StartActivity("recommendations.score");
        activity?.SetTag("graph.id", graphId);

        // LEARN: LG-04 rec-ranking | The whole ranking is one SQL statement over the same view the hubs come from: CTEs name each step (hub credits, hubs, candidates) and the ORDER BY writes the tie-break in full, so the order is a property of the query and the same graph gets the same list on every request
        var scored = await db.Database.SqlQuery<ScoredRow>(
            $"""
            WITH graph_recs AS (
                SELECT gs.recording_mbid FROM graph_songs gs WHERE gs.graph_id = {graphId}
            ),
            hub_credits AS (
                SELECT DISTINCT rp.person_mbid, rp.recording_mbid
                FROM graph_recs g JOIN recording_people rp ON rp.recording_mbid = g.recording_mbid
            ),
            hubs AS (
                SELECT hc.person_mbid FROM hub_credits hc GROUP BY hc.person_mbid HAVING COUNT(*) >= 2
            ),
            candidates AS (
                SELECT DISTINCT rp.recording_mbid, rp.person_mbid
                FROM hubs h JOIN recording_people rp ON rp.person_mbid = h.person_mbid
                WHERE rp.recording_mbid NOT IN (SELECT recording_mbid FROM graph_recs)
            ),
            scored AS (
                SELECT c.recording_mbid,
                       COUNT(DISTINCT c.person_mbid)::int AS hub_count,
                       COUNT(DISTINCT hc.recording_mbid)::int AS shared_songs
                FROM candidates c JOIN hub_credits hc ON hc.person_mbid = c.person_mbid
                GROUP BY c.recording_mbid
            )
            SELECT r.mbid AS mbid, r.title AS title, r.artist_credit AS artist,
                   EXTRACT(YEAR FROM r.first_release_date)::int AS year,
                   s.hub_count AS hub_count, s.shared_songs AS shared_songs
            FROM scored s JOIN recordings r ON r.mbid = s.recording_mbid
            ORDER BY s.hub_count DESC, s.shared_songs DESC, LOWER(r.title), r.mbid
            LIMIT {limit}
            """).ToListAsync(cancellationToken);

        if (scored.Count == 0)
        {
            return [];
        }

        var ids = scored.Select(s => s.Mbid).ToArray();
        var hubRows = await db.Database.SqlQuery<HubRow>(
            $"""
            WITH graph_recs AS (
                SELECT gs.recording_mbid FROM graph_songs gs WHERE gs.graph_id = {graphId}
            ),
            hub_counts AS (
                SELECT rp.person_mbid, COUNT(DISTINCT rp.recording_mbid)::int AS graph_songs
                FROM graph_recs g JOIN recording_people rp ON rp.recording_mbid = g.recording_mbid
                GROUP BY rp.person_mbid HAVING COUNT(DISTINCT rp.recording_mbid) >= 2
            )
            SELECT rp.recording_mbid AS recording_mbid, p.mbid AS person_mbid, p.name AS name, hc.graph_songs AS graph_songs,
                   ARRAY_AGG(DISTINCT rp.role ORDER BY rp.role) AS roles
            FROM recording_people rp
            JOIN hub_counts hc ON hc.person_mbid = rp.person_mbid
            JOIN people p ON p.mbid = rp.person_mbid
            WHERE rp.recording_mbid = ANY({ids})
            GROUP BY rp.recording_mbid, p.mbid, p.name, hc.graph_songs
            """).ToListAsync(cancellationToken);

        var hubsByRecording = hubRows.ToLookup(h => h.RecordingMbid);

        return scored.Select(s =>
        {
            // The strongest connection first (most of your songs), then by name, so the reason reads the same each time.
            var hubs = hubsByRecording[s.Mbid]
                .OrderByDescending(h => h.GraphSongs).ThenBy(h => h.Name, StringComparer.OrdinalIgnoreCase).ThenBy(h => h.PersonMbid)
                .Select(h => new RecommendationHub(
                    h.PersonMbid, h.Name, h.GraphSongs, h.Roles.Select(r => Enum.Parse<CreditRole>(r, ignoreCase: true)).ToList()))
                .ToList();

            return new RecommendationItem(s.Mbid, s.Title, s.Artist, s.Year, s.HubCount, s.SharedSongs, ReasonFor(hubs), hubs);
        }).ToList();
    }

    /// <summary>
    /// The plain-language reason (FR-REC-02): who connects the song to the graph and how strongly, for example
    /// "Credited with Pharrell Williams (producer, on 3 of your songs) and Chad Hugo (producer, on 2 of your songs)".
    /// </summary>
    public static string ReasonFor(IReadOnlyList<RecommendationHub> hubs)
    {
        if (hubs.Count == 0)
        {
            return string.Empty;
        }

        var named = hubs.Take(NamedHubs).Select(Describe).ToList();
        var text = named.Count == 1 ? named[0] : $"{string.Join(", ", named.Take(named.Count - 1))} and {named[^1]}";
        var more = hubs.Count - named.Count;
        return more > 0 ? $"Credited with {text}, and {more} more of your hubs" : $"Credited with {text}";
    }

    private static string Describe(RecommendationHub hub)
    {
        var songs = hub.GraphSongs == 1 ? "1 of your songs" : $"{hub.GraphSongs} of your songs";
        // Two roles are enough to say what they did; a person with five is described by the count of the rest.
        var roles = string.Join(", ", hub.Roles.Take(NamedRoles).Select(r => r.ToString().ToLowerInvariant()));
        var extra = hub.Roles.Count - NamedRoles;
        var more = extra > 0 ? $" +{extra}" : string.Empty;
        return $"{hub.Name} ({roles}{more}, on {songs})";
    }
}
