using System.Diagnostics;
using Microsoft.EntityFrameworkCore;
using Nodeable.Domain.Enums;
using Nodeable.Domain.Mapping;
using Nodeable.Infrastructure.MusicBrainz.Models;
using Nodeable.Infrastructure.Persistence;
using Nodeable.Infrastructure.Telemetry;

namespace Nodeable.Infrastructure.Ingestion;

/// <summary>What <see cref="CreditStore.PersistAsync"/> stored.</summary>
/// <param name="Inserted">Credits that were new.</param>
/// <param name="Duplicates">Credits that were already stored (a re-crawl), or repeated within the response.</param>
/// <param name="Roles">The roles credited in the response, for deciding what to fetch next.</param>
public readonly record struct PersistedCredits(int Inserted, int Duplicates, IReadOnlySet<CreditRole> Roles);

/// <summary>
/// Writes the people and credits of a MusicBrainz response (spec section 8). Every statement is an upsert or an
/// "insert unless it exists", so running the same job twice, which a crash or a retry can cause, changes nothing.
/// </summary>
public sealed class CreditStore(NodeableDbContext db)
{
    /// <summary>Maps each artist relationship to a role and stores the people and credits, in two statements.</summary>
    public async Task<PersistedCredits> PersistAsync(
        CreditSubjectType subjectType, Guid subjectMbid, IReadOnlyList<Relation>? relations, CancellationToken cancellationToken)
    {
        using var activity = InfrastructureTelemetry.ActivitySource.StartActivity("credits.persist");

        // Only relationships to an artist are credits. A recording's link to its work is also a "relation".
        var credits = (relations ?? [])
            .Where(r => r.Artist is not null)
            .Select(r => (Person: r.Artist!, Mapped: RoleMapper.Map(r.Type, r.Attributes)))
            .ToList();

        if (credits.Count == 0)
        {
            activity?.SetTag("credits.inserted", 0);
            activity?.SetTag("credits.duplicates", 0);
            return new PersistedCredits(0, 0, new HashSet<CreditRole>());
        }

        // A person is credited many times in one response (a producer who also played bass), but an INSERT ... ON
        // CONFLICT DO UPDATE may not touch the same row twice in one statement, so people are made unique first.
        var people = credits.Select(c => c.Person).DistinctBy(p => p.Id).ToList();

        // LEARN: LG-02 upsert-unnest | unnest() turns arrays into rows, so a whole response is written with one INSERT ... ON CONFLICT statement instead of a round trip per credit; the unique index makes it safe to run again
        await db.Database.ExecuteSqlAsync(
            $"""
            INSERT INTO people (mbid, name, sort_name, type, disambiguation, fetched_at)
            SELECT t.mbid, t.name, t.sort_name, t.type, t.disambiguation, now()
            FROM unnest({people.Select(p => p.Id).ToArray()}::uuid[], {people.Select(p => p.Name).ToArray()}::text[],
                        {people.Select(p => p.SortName).ToArray()}::text[], {people.Select(p => p.Type).ToArray()}::text[],
                        {people.Select(p => p.Disambiguation).ToArray()}::text[])
                AS t(mbid, name, sort_name, type, disambiguation)
            ON CONFLICT (mbid) DO UPDATE
                SET name = EXCLUDED.name, sort_name = EXCLUDED.sort_name, type = EXCLUDED.type,
                    disambiguation = EXCLUDED.disambiguation, fetched_at = now()
            """,
            cancellationToken);

        var subjectTypeText = ToText(subjectType);
        var inserted = await db.Database.ExecuteSqlAsync(
            $"""
            INSERT INTO credits (person_mbid, subject_type, subject_mbid, role, detail, source)
            SELECT t.person_mbid, {subjectTypeText}::text, {subjectMbid}::uuid, t.role, t.detail, 'musicbrainz'
            FROM unnest({credits.Select(c => c.Person.Id).ToArray()}::uuid[],
                        {credits.Select(c => ToText(c.Mapped.Role)).ToArray()}::text[],
                        {credits.Select(c => c.Mapped.Detail).ToArray()}::text[])
                AS t(person_mbid, role, detail)
            ON CONFLICT (person_mbid, subject_type, subject_mbid, role, detail) DO NOTHING
            """,
            cancellationToken);

        var duplicates = credits.Count - inserted;
        activity?.SetTag("credits.inserted", inserted);
        activity?.SetTag("credits.duplicates", duplicates);

        return new PersistedCredits(inserted, duplicates, credits.Select(c => c.Mapped.Role).ToHashSet());
    }

    /// <summary>
    /// Recomputes <c>credits_status</c> for each recording from every credit it has at recording, work and release
    /// level (the <c>recording_people</c> view), so the status rises as more steps of the fetch plan finish.
    /// Returns the roles each recording has at any level.
    /// </summary>
    public async Task<IReadOnlyDictionary<Guid, IReadOnlySet<CreditRole>>> RefreshCreditsStatusAsync(
        IEnumerable<Guid> recordingMbids, CancellationToken cancellationToken)
    {
        var result = new Dictionary<Guid, IReadOnlySet<CreditRole>>();
        foreach (var recordingMbid in recordingMbids.Distinct())
        {
            var roles = await db.Database
                .SqlQuery<string>($"""SELECT DISTINCT role AS "Value" FROM recording_people WHERE recording_mbid = {recordingMbid}""")
                .ToListAsync(cancellationToken);

            var parsed = roles.Select(r => Enum.Parse<CreditRole>(r, ignoreCase: true)).ToHashSet();
            var status = CreditsStatusCalculator.Calculate(parsed);
            result[recordingMbid] = parsed;
            var statusText = ToText(status);

            await db.Database.ExecuteSqlAsync(
                $"UPDATE recordings SET credits_status = {statusText} WHERE mbid = {recordingMbid}",
                cancellationToken);
        }

        return result;
    }

    private static string ToText<TEnum>(TEnum value)
        where TEnum : struct, Enum => value.ToString().ToLowerInvariant();
}
