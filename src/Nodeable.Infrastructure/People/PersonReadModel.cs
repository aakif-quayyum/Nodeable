using Microsoft.EntityFrameworkCore;
using Nodeable.Domain.Enums;
using Nodeable.Infrastructure.Persistence;

namespace Nodeable.Infrastructure.People;

/// <summary>
/// What the person drawer shows (FR-PERSON-01), read from the stored credits only: the <c>recording_people</c> view that
/// every graph feature reads (spec section 8), so a person's role summary agrees with the graph's hubs. MusicBrainz is
/// not asked: a person with thousands of recordings would cost thousands of gated requests to answer a click, and the
/// recordings that matter to a graph are the ones it has stored.
/// </summary>
public sealed class PersonReadModel(NodeableDbContext db)
{
    // Rows are shaped by column alias, as in GraphReadModel: a keyless type is filled by name.
    private sealed class PersonRow
    {
        public Guid Mbid { get; set; }
        public string Name { get; set; } = string.Empty;
        public string? Type { get; set; }
        public string? Disambiguation { get; set; }
    }

    private sealed class RoleRow
    {
        public string Role { get; set; } = string.Empty;
        public int Recordings { get; set; }
    }

    private sealed class TotalsRow
    {
        public int Recordings { get; set; }
        public int Credits { get; set; }
        public int? FirstYear { get; set; }
        public int? LastYear { get; set; }
    }

    private sealed class RecordingRow
    {
        public Guid Mbid { get; set; }
        public string Title { get; set; } = string.Empty;
        public string Artist { get; set; } = string.Empty;
        public int? Year { get; set; }
    }

    private sealed class RecordingRoleRow
    {
        public Guid RecordingMbid { get; set; }
        public string Role { get; set; } = string.Empty;
        public string Detail { get; set; } = string.Empty;
    }

    /// <summary>The person, or null when Nodeable has never stored them.</summary>
    public async Task<PersonProfile?> GetProfileAsync(Guid personMbid, CancellationToken cancellationToken)
    {
        var person = await db.Database.SqlQuery<PersonRow>(
            $"""SELECT p.mbid AS mbid, p.name AS name, p.type AS type, p.disambiguation AS disambiguation FROM people p WHERE p.mbid = {personMbid}""")
            .SingleOrDefaultAsync(cancellationToken);

        if (person is null)
        {
            return null;
        }

        var roles = await db.Database.SqlQuery<RoleRow>(
            $"""
            SELECT rp.role AS role, COUNT(DISTINCT rp.recording_mbid)::int AS recordings
            FROM recording_people rp
            WHERE rp.person_mbid = {personMbid}
            GROUP BY rp.role
            ORDER BY COUNT(DISTINCT rp.recording_mbid) DESC, rp.role
            """).ToListAsync(cancellationToken);

        var totals = await db.Database.SqlQuery<TotalsRow>(
            $"""
            SELECT COUNT(DISTINCT rp.recording_mbid)::int AS recordings,
                   COUNT(DISTINCT (rp.recording_mbid, rp.role, rp.detail))::int AS credits,
                   MIN(EXTRACT(YEAR FROM r.first_release_date))::int AS first_year,
                   MAX(EXTRACT(YEAR FROM r.first_release_date))::int AS last_year
            FROM recording_people rp
            JOIN recordings r ON r.mbid = rp.recording_mbid
            WHERE rp.person_mbid = {personMbid}
            """).SingleAsync(cancellationToken);

        return new PersonProfile(
            person.Mbid,
            person.Name,
            string.IsNullOrEmpty(person.Type) ? null : person.Type,
            string.IsNullOrEmpty(person.Disambiguation) ? null : person.Disambiguation,
            roles.Select(r => new RoleSummaryItem(Enum.Parse<CreditRole>(r.Role, ignoreCase: true), r.Recordings)).ToList(),
            totals.Recordings,
            totals.Credits,
            totals.FirstYear,
            totals.LastYear);
    }

    /// <summary>
    /// A page of the stored recordings the person is credited on, newest first (a recording with no date last, then by
    /// title), each with all of their roles on it. Null when the person is not stored.
    /// </summary>
    public async Task<PersonRecordingsPage?> GetRecordingsAsync(Guid personMbid, int page, int pageSize, CancellationToken cancellationToken)
    {
        if (!await db.People.AsNoTracking().AnyAsync(p => p.Mbid == personMbid, cancellationToken))
        {
            return null;
        }

        var total = await db.Database.SqlQuery<int>(
            $"""SELECT COUNT(DISTINCT rp.recording_mbid)::int AS "Value" FROM recording_people rp WHERE rp.person_mbid = {personMbid}""")
            .SingleAsync(cancellationToken);

        var offset = (page - 1) * pageSize;
        var recordings = await db.Database.SqlQuery<RecordingRow>(
            $"""
            SELECT r.mbid AS mbid, r.title AS title, r.artist_credit AS artist,
                   EXTRACT(YEAR FROM r.first_release_date)::int AS year
            FROM recordings r
            WHERE r.mbid IN (SELECT rp.recording_mbid FROM recording_people rp WHERE rp.person_mbid = {personMbid})
            ORDER BY r.first_release_date DESC NULLS LAST, r.title, r.mbid
            LIMIT {pageSize} OFFSET {offset}
            """).ToListAsync(cancellationToken);

        var ids = recordings.Select(r => r.Mbid).ToArray();
        var roleRows = ids.Length == 0
            ? []
            : await db.Database.SqlQuery<RecordingRoleRow>(
                $"""
                SELECT DISTINCT rp.recording_mbid AS recording_mbid, rp.role AS role, rp.detail AS detail
                FROM recording_people rp
                WHERE rp.person_mbid = {personMbid} AND rp.recording_mbid = ANY({ids})
                ORDER BY rp.recording_mbid, rp.role, rp.detail
                """).ToListAsync(cancellationToken);

        var rolesByRecording = roleRows.ToLookup(r => r.RecordingMbid);

        return new PersonRecordingsPage(
            page,
            pageSize,
            total,
            recordings.Select(r => new PersonRecordingItem(
                r.Mbid,
                r.Title,
                r.Artist,
                r.Year,
                rolesByRecording[r.Mbid]
                    .Select(x => new PersonRecordingRole(Enum.Parse<CreditRole>(x.Role, ignoreCase: true), x.Detail))
                    .ToList())).ToList());
    }
}
