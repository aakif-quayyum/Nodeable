using System.ComponentModel.DataAnnotations;

namespace Nodeable.Infrastructure.Search;

/// <summary>Settings for recording search, bound from the "Search" configuration section.</summary>
public sealed class SearchOptions
{
    public const string SectionName = "Search";

    /// <summary>FR-SEARCH-01: a search returns up to this many results, after duplicates are collapsed.</summary>
    [Range(1, 50)]
    public int MaxResults { get; set; } = 10;

    /// <summary>
    /// How many raw recordings are asked of the cache and of MusicBrainz. Collapsing folds several of them into one
    /// row (one song can be seven recordings), so more than <see cref="MaxResults"/> are needed to still fill a page.
    /// </summary>
    [Range(1, 100)]
    public int FetchLimit { get; set; } = 30;
}
