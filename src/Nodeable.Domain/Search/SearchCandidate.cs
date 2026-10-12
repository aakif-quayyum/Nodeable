using Nodeable.Domain.Dates;

namespace Nodeable.Domain.Search;

/// <summary>
/// One recording a search found, from the local cache or from MusicBrainz, reduced to what duplicate collapsing and
/// the result list need (FR-SEARCH-01, FR-SEARCH-02). The Domain knows nothing about where it came from.
/// </summary>
/// <param name="Score">0 to 100. MusicBrainz's own score when it answered; trigram similarity times 100 when the cache did.</param>
/// <param name="Disambiguation">MusicBrainz's short note that tells two recordings apart, for example "part of a DJ-mix".</param>
public sealed record SearchCandidate(
    Guid Mbid,
    string Title,
    string Artist,
    int Score,
    PartialDate? FirstReleaseDate,
    IReadOnlyList<CandidateRelease> Releases,
    string? Disambiguation = null)
{
    /// <summary>
    /// The title of the release the recording first appeared on. Official releases win over promos and bootlegs, then
    /// the earliest date; an undated release ranks last, and ties keep the order the source sent.
    /// </summary>
    public string? FirstReleaseTitle => Releases
        .OrderBy(r => r.IsUnofficial)
        .ThenBy(r => r.Date?.Date ?? DateOnly.MaxValue)
        .Select(r => r.Title)
        .FirstOrDefault();
}

/// <summary>
/// A release a candidate appears on. The flags default to false because "not known" must not count against a
/// recording: the local cache stores no release status or type, so its candidates are never marked down.
/// </summary>
/// <param name="IsUnofficial">The release is a promotion, bootleg or pseudo-release, not an official one.</param>
/// <param name="IsLive">The release is a live album.</param>
/// <param name="IsCompilation">The release is a compilation or a DJ-mix.</param>
public sealed record CandidateRelease(
    string Title,
    PartialDate? Date,
    bool IsUnofficial = false,
    bool IsLive = false,
    bool IsCompilation = false);
