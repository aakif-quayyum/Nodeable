namespace Nodeable.Domain.Search;

/// <summary>What kind of duplicate a collapsed recording is (FR-SEARCH-02: live, remaster, compilation).</summary>
public enum VersionKind
{
    /// <summary>A live performance.</summary>
    Live,

    /// <summary>A remaster of the original recording.</summary>
    Remaster,

    /// <summary>The recording as it appears on compilations and DJ-mixes only.</summary>
    Compilation,

    /// <summary>Same title and artist, but nothing says why it is a separate recording.</summary>
    Other,
}

/// <summary>A recording folded behind the group's primary, and why.</summary>
public sealed record SearchVersion(SearchCandidate Candidate, VersionKind Kind);

/// <summary>
/// One result row: the recording to show, and the duplicates collapsed behind it (the "expand" in FR-SEARCH-02).
/// </summary>
public sealed record SearchGroup(SearchCandidate Primary, IReadOnlyList<SearchVersion> Versions);
