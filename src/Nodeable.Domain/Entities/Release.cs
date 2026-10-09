namespace Nodeable.Domain.Entities;

/// <summary>An album or single (spec section 8, <c>releases</c>).</summary>
public class Release
{
    public required Guid Mbid { get; init; }

    public required string Title { get; set; }

    public DateOnly? Date { get; set; }

    public DateTimeOffset FetchedAt { get; set; }
}
