using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Nodeable.Domain.Art;
using Nodeable.Domain.Enums;
using Nodeable.Infrastructure.MusicBrainz;
using Nodeable.Infrastructure.Persistence;

namespace Nodeable.Infrastructure.Graphs;

/// <summary>
/// Every read the graph features share: the snapshot the Api returns, and the payloads the Worker sends after a job.
/// They are SQL on purpose. The shapes are joins and aggregates over the three credit levels (spec section 8, "Key
/// queries"), which read more clearly as the query that PostgreSQL runs than as LINQ the provider translates.
/// </summary>
public sealed class GraphReadModel(NodeableDbContext db, IOptions<MusicBrainzOptions> musicBrainz)
{
    // The rows are shaped by column alias: a keyless type is filled by name, and with the snake_case convention the Api uses
    // (UseNodeableConventions) property AddedAt is read from column added_at, so the SQL aliases its columns that way.
    private sealed class SongRow
    {
        public Guid Mbid { get; set; }
        public string Title { get; set; } = string.Empty;
        public string Artist { get; set; } = string.Empty;
        public DateOnly? FirstReleaseDate { get; set; }
        public string Status { get; set; } = string.Empty;
        public DateTimeOffset AddedAt { get; set; }
        public bool Loading { get; set; }
        public bool HasPreview { get; set; }
        public string? DeezerCoverMd5 { get; set; }
    }

    private sealed class CreditRow
    {
        public Guid SongMbid { get; set; }
        public Guid PersonMbid { get; set; }
        public string Role { get; set; } = string.Empty;
        public string Detail { get; set; } = string.Empty;
        public string Level { get; set; } = string.Empty;
    }

    private sealed class PersonRow
    {
        public Guid Mbid { get; set; }
        public string Name { get; set; } = string.Empty;
    }

    private sealed class HubRow
    {
        public Guid PersonMbid { get; set; }
        public int Songs { get; set; }
        public string[] Roles { get; set; } = [];
    }

    private sealed class StatusRow
    {
        public Guid Mbid { get; set; }
        public string Status { get; set; } = string.Empty;
        public bool Loading { get; set; }
    }

    private sealed class CountRow
    {
        public string Status { get; set; } = string.Empty;
        public int Count { get; set; }
    }

    private sealed class HeldRow
    {
        public Guid GraphId { get; set; }
        public Guid RecordingMbid { get; set; }
    }

    /// <summary>The songs of a graph, oldest first, each with the status the person should see.</summary>
    public async Task<IReadOnlyList<GraphSongItem>> GetSongsAsync(Guid graphId, CancellationToken cancellationToken)
    {
        var rows = await db.Database.SqlQuery<SongRow>(
            $"""
            SELECT r.mbid AS mbid, r.title AS title, r.artist_credit AS artist,
                   r.first_release_date AS first_release_date, r.credits_status AS status, gs.added_at AS added_at,
                   EXISTS (
                       SELECT 1 FROM crawl_jobs j
                       WHERE j.status IN ('pending', 'running') AND j.kind IN ('recording', 'work', 'release')
                         AND j.target_mbid IN (
                             SELECT r.mbid
                             UNION ALL SELECT rw.work_mbid FROM recording_works rw WHERE rw.recording_mbid = r.mbid
                             UNION ALL SELECT rr.release_mbid FROM recording_releases rr WHERE rr.recording_mbid = r.mbid)
                   ) AS loading,
                   (p.recording_mbid IS NOT NULL) AS has_preview, p.cover_md5 AS deezer_cover_md5
            FROM graph_songs gs
            JOIN recordings r ON r.mbid = gs.recording_mbid
            LEFT JOIN previews p ON p.recording_mbid = r.mbid AND p.provider = 'deezer'
            WHERE gs.graph_id = {graphId}
            ORDER BY gs.added_at, r.mbid
            """).ToListAsync(cancellationToken);

        var covers = await GetCoversAsync(rows.Select(row => row.Mbid).ToList(), cancellationToken);

        return rows.Select(row =>
        {
            var cover = covers.GetValueOrDefault(row.Mbid, CoverChoice.None);
            return new GraphSongItem(
                row.Mbid, row.Title, row.Artist, row.FirstReleaseDate?.Year, ToSongStatus(row.Status, row.Loading), row.AddedAt,
                cover.ReleaseMbid, cover.ReleaseGroupMbid, row.HasPreview, row.DeezerCoverMd5);
        }).ToList();
    }

    /// <summary>A stored preview's cover ID.</summary>
    public sealed record PreviewInfo(string? CoverMd5);

    /// <summary>The preview stored for a recording (FR-PREVIEW-01), or null when Deezer had none.</summary>
    public async Task<PreviewInfo?> GetPreviewAsync(Guid recordingMbid, CancellationToken cancellationToken)
    {
        var row = await db.Previews.AsNoTracking()
            .Where(p => p.RecordingMbid == recordingMbid)
            .Select(p => new PreviewInfo(p.CoverMd5))
            .FirstOrDefaultAsync(cancellationToken);
        return row;
    }

    /// <summary>
    /// The release and release group each recording's cover is loaded for (FR-ART-01), chosen from the releases the
    /// cache holds. A recording with no release rows has no entry.
    /// </summary>
    public async Task<IReadOnlyDictionary<Guid, CoverChoice>> GetCoversAsync(
        IReadOnlyCollection<Guid> recordingMbids, CancellationToken cancellationToken)
    {
        if (recordingMbids.Count == 0)
        {
            return new Dictionary<Guid, CoverChoice>();
        }

        var ids = recordingMbids.ToArray();
        var rows = await (
            from link in db.RecordingReleases.AsNoTracking()
            where ids.Contains(link.RecordingMbid)
            join release in db.Releases.AsNoTracking() on link.ReleaseMbid equals release.Mbid
            select new { link.RecordingMbid, Release = release })
            .ToListAsync(cancellationToken);

        return rows
            .GroupBy(row => row.RecordingMbid)
            .ToDictionary(group => group.Key, group => CoverSelector.Choose(group.Select(row => CoverCandidates.From(row.Release))));
    }

    /// <summary>
    /// The credits of the given songs, once per person, role and detail (FR-GRAPH-03). A person credited the same way
    /// on the recording and on its work is one credit, kept at the level closest to the recording.
    /// </summary>
    public async Task<IReadOnlyList<GraphCreditItem>> GetCreditsAsync(IReadOnlyCollection<Guid> songMbids, CancellationToken cancellationToken)
    {
        if (songMbids.Count == 0)
        {
            return [];
        }

        var ids = songMbids.ToArray();
        var rows = await db.Database.SqlQuery<CreditRow>(
            $"""
            SELECT DISTINCT ON (rp.recording_mbid, rp.person_mbid, rp.role, rp.detail)
                   rp.recording_mbid AS song_mbid, rp.person_mbid AS person_mbid, rp.role AS role,
                   rp.detail AS detail, rp.level AS level
            FROM recording_people rp
            WHERE rp.recording_mbid = ANY({ids})
            ORDER BY rp.recording_mbid, rp.person_mbid, rp.role, rp.detail,
                     CASE rp.level WHEN 'recording' THEN 0 WHEN 'work' THEN 1 ELSE 2 END
            """).ToListAsync(cancellationToken);

        return rows
            .Select(row => new GraphCreditItem(
                row.SongMbid,
                row.PersonMbid,
                Enum.Parse<CreditRole>(row.Role, ignoreCase: true),
                row.Detail,
                Enum.Parse<CreditLevel>(row.Level, ignoreCase: true)))
            .ToList();
    }

    public async Task<IReadOnlyList<PersonItem>> GetPeopleAsync(IEnumerable<Guid> personMbids, CancellationToken cancellationToken)
    {
        var ids = personMbids.Distinct().ToArray();
        if (ids.Length == 0)
        {
            return [];
        }

        var rows = await db.Database.SqlQuery<PersonRow>(
            $"""SELECT p.mbid AS mbid, p.name AS name FROM people p WHERE p.mbid = ANY({ids}) ORDER BY p.name, p.mbid""")
            .ToListAsync(cancellationToken);

        return rows.Select(row => new PersonItem(row.Mbid, row.Name)).ToList();
    }

    /// <summary>People credited on two or more songs of the graph, most songs first (spec section 8, "Key queries").</summary>
    public async Task<IReadOnlyList<HubItem>> GetHubsAsync(Guid graphId, CancellationToken cancellationToken)
    {
        var rows = await db.Database.SqlQuery<HubRow>(
            $"""
            SELECT rp.person_mbid AS person_mbid, COUNT(DISTINCT rp.recording_mbid)::int AS songs,
                   ARRAY_AGG(DISTINCT rp.role ORDER BY rp.role) AS roles
            FROM graph_songs gs
            JOIN recording_people rp ON rp.recording_mbid = gs.recording_mbid
            WHERE gs.graph_id = {graphId}
            GROUP BY rp.person_mbid
            HAVING COUNT(DISTINCT rp.recording_mbid) >= 2
            ORDER BY songs DESC, rp.person_mbid
            """).ToListAsync(cancellationToken);

        return rows
            .Select(row => new HubItem(row.PersonMbid, row.Songs, row.Roles.Select(r => Enum.Parse<CreditRole>(r, ignoreCase: true)).ToList()))
            .ToList();
    }

    /// <summary>
    /// Jobs for the graph's songs, by state: the recording fetch of each song and the work and release fetches it led
    /// to. A fetch that finished for an earlier graph still counts as done, because it is a fact about the song.
    /// </summary>
    public async Task<CrawlProgressItem> GetCrawlProgressAsync(Guid graphId, CancellationToken cancellationToken)
    {
        var rows = await db.Database.SqlQuery<CountRow>(
            $"""
            WITH song AS (SELECT recording_mbid FROM graph_songs WHERE graph_id = {graphId}),
            target AS (
                SELECT recording_mbid AS mbid, 'recording' AS kind FROM song
                UNION SELECT rw.work_mbid, 'work' FROM recording_works rw JOIN song s ON s.recording_mbid = rw.recording_mbid
                UNION SELECT rr.release_mbid, 'release' FROM recording_releases rr JOIN song s ON s.recording_mbid = rr.recording_mbid)
            SELECT j.status AS status, COUNT(*)::int AS count
            FROM crawl_jobs j JOIN target t ON t.mbid = j.target_mbid AND t.kind = j.kind
            GROUP BY j.status
            """).ToListAsync(cancellationToken);

        int Count(params string[] statuses) => rows.Where(r => statuses.Contains(r.Status)).Sum(r => r.Count);

        var queued = Count("pending", "running");
        var eta = (int)Math.Ceiling(queued * musicBrainz.Value.MinRequestInterval.TotalSeconds);
        return new CrawlProgressItem(queued, Count("done"), Count("failed"), eta);
    }

    /// <summary>The status each song should show now: "loading" while a fetch for it is outstanding, else the stored one.</summary>
    public async Task<IReadOnlyDictionary<Guid, SongStatus>> GetSongStatusesAsync(
        IReadOnlyCollection<Guid> songMbids, CancellationToken cancellationToken)
    {
        if (songMbids.Count == 0)
        {
            return new Dictionary<Guid, SongStatus>();
        }

        var ids = songMbids.ToArray();
        var rows = await db.Database.SqlQuery<StatusRow>(
            $"""
            SELECT r.mbid AS mbid, r.credits_status AS status,
                   EXISTS (
                       SELECT 1 FROM crawl_jobs j
                       WHERE j.status IN ('pending', 'running') AND j.kind IN ('recording', 'work', 'release')
                         AND j.target_mbid IN (
                             SELECT r.mbid
                             UNION ALL SELECT rw.work_mbid FROM recording_works rw WHERE rw.recording_mbid = r.mbid
                             UNION ALL SELECT rr.release_mbid FROM recording_releases rr WHERE rr.recording_mbid = r.mbid)
                   ) AS loading
            FROM recordings r WHERE r.mbid = ANY({ids})
            """).ToListAsync(cancellationToken);

        return rows.ToDictionary(row => row.Mbid, row => ToSongStatus(row.Status, row.Loading));
    }

    /// <summary>The graphs that hold any of the given recordings, with the recording that put them on the list.</summary>
    public async Task<IReadOnlyList<(Guid GraphId, Guid RecordingMbid)>> FindGraphsHoldingAsync(
        IReadOnlyCollection<Guid> recordingMbids, CancellationToken cancellationToken)
    {
        if (recordingMbids.Count == 0)
        {
            return [];
        }

        var ids = recordingMbids.ToArray();
        var rows = await db.Database.SqlQuery<HeldRow>(
            $"""SELECT graph_id AS graph_id, recording_mbid AS recording_mbid FROM graph_songs WHERE recording_mbid = ANY({ids})""")
            .ToListAsync(cancellationToken);

        return rows.Select(row => (row.GraphId, row.RecordingMbid)).ToList();
    }

    /// <summary>The recordings a finished job changed: the recording itself, or every recording linked to the work or release.</summary>
    public async Task<IReadOnlyList<Guid>> GetRecordingsAffectedByAsync(
        CrawlJobKind kind, Guid targetMbid, CancellationToken cancellationToken)
    {
        switch (kind)
        {
            case CrawlJobKind.Recording:
                return [targetMbid];
            case CrawlJobKind.Work:
                return await db.Database
                    .SqlQuery<Guid>($"""SELECT recording_mbid AS "Value" FROM recording_works WHERE work_mbid = {targetMbid}""")
                    .ToListAsync(cancellationToken);
            case CrawlJobKind.Release:
                return await db.Database
                    .SqlQuery<Guid>($"""SELECT recording_mbid AS "Value" FROM recording_releases WHERE release_mbid = {targetMbid}""")
                    .ToListAsync(cancellationToken);
            default:
                // Preview and artist jobs add no credits, so no graph has anything new to show.
                return [];
        }
    }

    /// <summary>How many fetches are outstanding for one song: what "pendingJobs" in the add-song answer reports.</summary>
    public async Task<int> CountPendingJobsAsync(Guid recordingMbid, CancellationToken cancellationToken) =>
        await db.Database.SqlQuery<int>(
            $"""
            SELECT COUNT(*)::int AS "Value" FROM crawl_jobs j
            WHERE j.status IN ('pending', 'running') AND j.kind IN ('recording', 'work', 'release')
              AND j.target_mbid IN (
                  SELECT {recordingMbid}::uuid
                  UNION ALL SELECT work_mbid FROM recording_works WHERE recording_mbid = {recordingMbid}
                  UNION ALL SELECT release_mbid FROM recording_releases WHERE recording_mbid = {recordingMbid})
            """).SingleAsync(cancellationToken);

    private static SongStatus ToSongStatus(string stored, bool loading)
    {
        if (loading)
        {
            return SongStatus.Loading;
        }

        return Enum.Parse<CreditsStatus>(stored, ignoreCase: true) switch
        {
            CreditsStatus.Complete => SongStatus.Complete,
            CreditsStatus.Partial => SongStatus.Partial,
            _ => SongStatus.None,
        };
    }
}
