namespace Nodeable.Domain.Entities;

/// <summary>An artist, producer, engineer or musician (spec section 8, <c>people</c>).</summary>
public class Person
{
    public required Guid Mbid { get; init; }

    public required string Name { get; set; }

    public string? SortName { get; set; }

    /// <summary>MusicBrainz artist type, for example "Person" or "Group". Null when MusicBrainz has none.</summary>
    public string? Type { get; set; }

    public string? Disambiguation { get; set; }

    public DateTimeOffset FetchedAt { get; set; }
}
