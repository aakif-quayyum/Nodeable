namespace Nodeable.Domain.Entities;

/// <summary>Link between a recording and the work it performs (spec section 8, <c>recording_works</c>).</summary>
public class RecordingWork
{
    public required Guid RecordingMbid { get; init; }

    public required Guid WorkMbid { get; init; }
}
