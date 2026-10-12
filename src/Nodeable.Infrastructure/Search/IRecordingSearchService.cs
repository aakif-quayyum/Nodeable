using Nodeable.Domain.Enums;
using Nodeable.Domain.Search;

namespace Nodeable.Infrastructure.Search;

/// <summary>Searches recordings by title and optional artist: the local cache first, then MusicBrainz (FR-SEARCH-01).</summary>
public interface IRecordingSearchService
{
    /// <exception cref="SearchUnavailableException">MusicBrainz could not be asked in time, or did not answer.</exception>
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

/// <summary>Why a search could not be answered.</summary>
public enum SearchFailure
{
    /// <summary>The shared MusicBrainz rate gate had no slot within the interactive wait cap (decision 0018).</summary>
    RateLimited,

    /// <summary>MusicBrainz answered 503 or 429 until the retries ran out, or took too long.</summary>
    UpstreamUnavailable,

    /// <summary>MusicBrainz answered with another error status.</summary>
    UpstreamError,
}

/// <summary>
/// A search that MusicBrainz could not serve. The Api turns it into a Problem Details response; the search service
/// does not know about HTTP status codes of its own callers.
/// </summary>
public sealed class SearchUnavailableException(SearchFailure failure, TimeSpan retryAfter, Exception inner)
    : Exception($"Search is unavailable: {failure}.", inner)
{
    public SearchFailure Failure { get; } = failure;

    /// <summary>A sensible time for the caller to wait before trying again.</summary>
    public TimeSpan RetryAfter { get; } = retryAfter;
}
