using Nodeable.Domain.Dates;

namespace Nodeable.Domain.Art;

/// <summary>
/// A release a recording appears on, reduced to what choosing its cover needs (FR-ART-01). The flags default to false
/// because "not known" must not count against a release, the same rule duplicate collapsing uses (FR-SEARCH-02).
/// </summary>
/// <param name="IsUnofficial">The release is a promotion, bootleg or pseudo-release, not an official one.</param>
/// <param name="IsLive">The release's group is a live album.</param>
/// <param name="IsCompilation">The release's group is a compilation or a DJ-mix.</param>
public sealed record CoverCandidate(
    Guid ReleaseMbid,
    Guid? ReleaseGroupMbid,
    PartialDate? Date,
    bool IsUnofficial = false,
    bool IsLive = false,
    bool IsCompilation = false);

/// <summary>The release whose front cover is tried first, and the release group tried second. Either may be null.</summary>
public sealed record CoverChoice(Guid? ReleaseMbid, Guid? ReleaseGroupMbid)
{
    public static CoverChoice None { get; } = new(null, null);
}

/// <summary>
/// Chooses the release a song's cover is loaded for, the way FR-SEARCH-02 chooses its original: an official release
/// beats a promo or bootleg, a studio release beats a live album or a compilation, and then the earliest date wins.
/// A cover of the original album is what a person expects to see next to the song.
/// </summary>
public static class CoverSelector
{
    public static CoverChoice Choose(IEnumerable<CoverCandidate> releases)
    {
        // OrderBy is stable: releases that tie keep the order the source sent them in, so the same data always gives
        // the same cover. An undated release is mapped to the largest date and so ranks after every dated one.
        var ranked = releases
            .OrderBy(r => r.IsUnofficial)
            .ThenBy(r => r.IsLive || r.IsCompilation)
            .ThenBy(r => r.Date?.Date ?? DateOnly.MaxValue)
            .ToList();

        if (ranked.Count == 0)
        {
            return CoverChoice.None;
        }

        // The release group is the second step of the chain. Take the chosen release's own group; when MusicBrainz did
        // not say which group it is in (rows fetched before M3R), fall back to the best-ranked release that has one.
        var group = ranked[0].ReleaseGroupMbid ?? ranked.Select(r => r.ReleaseGroupMbid).FirstOrDefault(g => g is not null);

        return new CoverChoice(ranked[0].ReleaseMbid, group);
    }
}

/// <summary>Reads a stored release as a cover candidate, with the same rules the search uses for "official", "live" and "compilation".</summary>
public static class CoverCandidates
{
    public static CoverCandidate From(Entities.Release release) => new(
        release.Mbid,
        release.ReleaseGroupMbid,
        release.Date is { } date && release.DatePrecision is { } precision ? new PartialDate(date, precision) : null,
        // A missing status is not a mark against the release; only an explicit non-Official one is.
        IsUnofficial: release.Status is { } status && !status.Equals("Official", StringComparison.OrdinalIgnoreCase),
        IsLive: release.ReleaseGroupSecondaryTypes.Contains("Live", StringComparer.OrdinalIgnoreCase),
        IsCompilation: release.ReleaseGroupSecondaryTypes.Any(type =>
            type.Equals("Compilation", StringComparison.OrdinalIgnoreCase) || type.Equals("DJ-mix", StringComparison.OrdinalIgnoreCase)));
}
