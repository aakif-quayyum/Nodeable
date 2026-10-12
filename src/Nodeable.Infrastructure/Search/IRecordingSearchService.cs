using Nodeable.Domain.Enums;
using Nodeable.Domain.Search;

namespace Nodeable.Infrastructure.Search;

/// <summary>Searches recordings by title and optional artist: the local cache first, then MusicBrainz (FR-SEARCH-01).</summary>
public interface IRecordingSearchService
{
    /// <exception cref="MusicBrainz.MusicBrainzUnavailableException">MusicBrainz could not be asked in time, or did not answer.</exception>
    Task<SearchOutcome> SearchAsync(string title, string? artist, CancellationToken cancellationToken = default);
}

/// <summary>Where a search's results came from, which also says what their scores mean.</summary>
public enum SearchSource
{
    /// <summary>The local cache held enough matches; scores are trigram similarity times 100.</summary>
    Cache,

    /// <summary>MusicBrainz answered; scores are MusicBrainz's own.</summary>
    MusicBrainz,
}

/// <param name="Groups">At most the configured page size, duplicates already folded behind their original.</param>
/// <param name="CachedStatuses">The credits status of every returned recording the cache already holds (primaries and versions).</param>
public sealed record SearchOutcome(
    SearchSource Source,
    IReadOnlyList<SearchGroup> Groups,
    IReadOnlyDictionary<Guid, CreditsStatus> CachedStatuses);
