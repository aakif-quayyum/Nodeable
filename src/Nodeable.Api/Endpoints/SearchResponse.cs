using Nodeable.Domain.Enums;
using Nodeable.Domain.Search;
using Nodeable.Infrastructure.Search;

namespace Nodeable.Api.Endpoints;

/// <summary>The answer to a recording search (FR-SEARCH-01, spec section 9).</summary>
/// <param name="Source">Who answered. It also says what <c>score</c> means: MusicBrainz's own score, or the cache's similarity times 100.</param>
/// <param name="Results">At most 10 results, best match first, duplicates already folded behind their original.</param>
public sealed record SearchResponse(SearchSource Source, IReadOnlyList<SearchResultItem> Results);

/// <summary>One song in the result list, with the other recordings folded behind it (FR-SEARCH-02).</summary>
/// <param name="Mbid">The MusicBrainz ID of the recording that stays visible: the original.</param>
/// <param name="FirstReleaseTitle">The release the recording first appeared on; null when none is listed.</param>
/// <param name="Year">The year of its first release; null when unknown, never 0.</param>
/// <param name="Score">Match score, 0 to 100.</param>
/// <param name="CreditsStatus">What the cache already holds for the recording; null when it has never been fetched.</param>
/// <param name="Versions">Live takes, remasters and compilation appearances, earliest first. Empty when there are none.</param>
/// <param name="ArtReleaseMbid">The release whose front cover is tried first (FR-ART-01); null when no release is known.</param>
/// <param name="ArtReleaseGroupMbid">The release group tried second; null when it is not known.</param>
/// <param name="Kind">What a separate recording of the song is (remix, edit, bootleg, mixtape); null for the song itself.</param>
public sealed record SearchResultItem(
    Guid Mbid,
    string Title,
    string Artist,
    string? FirstReleaseTitle,
    int? Year,
    int Score,
    CreditsStatus? CreditsStatus,
    IReadOnlyList<SearchVersionItem> Versions,
    Guid? ArtReleaseMbid = null,
    Guid? ArtReleaseGroupMbid = null,
    RecordingKind? Kind = null);

/// <summary>A recording folded behind a result: same song, and the reason it is not the original.</summary>
/// <param name="Note">MusicBrainz's disambiguation comment, for example which DJ-mix it is part of.</param>
public sealed record SearchVersionItem(
    Guid Mbid,
    string Title,
    string Artist,
    string? FirstReleaseTitle,
    int? Year,
    int Score,
    VersionKind Kind,
    string? Note,
    CreditsStatus? CreditsStatus,
    Guid? ArtReleaseMbid = null,
    Guid? ArtReleaseGroupMbid = null);
