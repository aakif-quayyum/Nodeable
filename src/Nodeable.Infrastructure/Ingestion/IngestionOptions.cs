namespace Nodeable.Infrastructure.Ingestion;

/// <summary>Settings for turning MusicBrainz responses into stored credits, bound from the "Ingestion" section.</summary>
public sealed class IngestionOptions
{
    public const string SectionName = "Ingestion";

    /// <summary>
    /// Queue a <c>preview</c> job when a recording has an ISRC (decision 0009, FR-PREVIEW-01). On since M4, when the
    /// preview handler arrived; the switch stays so a deployment can stop the Deezer lookups without a release.
    /// </summary>
    public bool QueuePreviewJobs { get; set; } = true;
}
