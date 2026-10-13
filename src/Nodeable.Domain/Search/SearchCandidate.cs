using Nodeable.Domain.Art;
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

    /// <summary>
    /// Whether this is a remix, an edit, a bootleg or a mixtape recording of the song, from MusicBrainz data first and
    /// the title's decoration last; null for the song itself.
    /// </summary>
    public RecordingKind? Kind => RecordingKindClassifier.Classify(Title, Disambiguation, Releases);

    /// <summary>The release and release group a cover is loaded for (FR-ART-01), chosen like the original (FR-SEARCH-02).</summary>
    public CoverChoice Cover => CoverSelector.Choose(Releases
        .Where(r => r.Mbid is not null)
        .Select(r => new CoverCandidate(r.Mbid!.Value, r.ReleaseGroupMbid, r.Date, r.IsUnofficial, r.IsLive, r.IsCompilation)));
}

/// <summary>
/// A release a candidate appears on. The flags default to false because "not known" must not count against a
/// recording: the local cache stores no release status or type, so its candidates are never marked down.
/// </summary>
/// <param name="IsUnofficial">The release is a promotion, bootleg or pseudo-release, not an official one.</param>
/// <param name="IsLive">The release is a live album.</param>
/// <param name="IsCompilation">The release is a compilation or a DJ-mix.</param>
/// <param name="Mbid">The release's MusicBrainz ID, which is what a cover is looked up by (FR-ART-01); null when not known.</param>
/// <param name="ReleaseGroupMbid">The ID of the release's group, the fallback for a cover; null when not known.</param>
/// <param name="IsRemix">The release's group is a remix album (a secondary type of Remix).</param>
/// <param name="IsMixtape">The release's group is a mixtape (a secondary type of Mixtape/Street).</param>
public sealed record CandidateRelease(
    string Title,
    PartialDate? Date,
    bool IsUnofficial = false,
    bool IsLive = false,
    bool IsCompilation = false,
    Guid? Mbid = null,
    Guid? ReleaseGroupMbid = null,
    bool IsRemix = false,
    bool IsMixtape = false);
