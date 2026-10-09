namespace Nodeable.Domain.Entities;

/// <summary>A song in a graph (spec section 8, <c>graph_songs</c>).</summary>
public class GraphSong
{
    public required Guid GraphId { get; init; }

    public required Guid RecordingMbid { get; init; }

    public DateTimeOffset AddedAt { get; set; }
}
