namespace Nodeable.Infrastructure.Ingestion;

/// <summary>Settings for turning MusicBrainz responses into stored credits, bound from the "Ingestion" section.</summary>
public sealed class IngestionOptions
{
    public const string SectionName = "Ingestion";

    /// <summary>
    /// Queue a <c>preview</c> job when a recording has an ISRC (decision 0009). Off until the preview handler exists
    /// (FR-PREVIEW-01, M4): a job of a kind nobody handles would only be marked failed. M4 switches this on with
    /// the handler.
    /// </summary>
    public bool QueuePreviewJobs { get; set; }
}
