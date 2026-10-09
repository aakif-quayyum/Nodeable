namespace Nodeable.Domain.Entities;

/// <summary>The underlying composition a recording performs (spec section 8, <c>works</c>).</summary>
public class Work
{
    public required Guid Mbid { get; init; }

    public required string Title { get; set; }

    public DateTimeOffset FetchedAt { get; set; }
}
