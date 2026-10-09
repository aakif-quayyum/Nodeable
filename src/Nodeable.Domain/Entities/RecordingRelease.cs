namespace Nodeable.Domain.Entities;

/// <summary>Link between a recording and a release it appears on (spec section 8, <c>recording_releases</c>).</summary>
public class RecordingRelease
{
    public required Guid RecordingMbid { get; init; }

    public required Guid ReleaseMbid { get; init; }
}
