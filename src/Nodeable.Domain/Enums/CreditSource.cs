namespace Nodeable.Domain.Enums;

/// <summary>Where a credit came from. Discogs fills gaps in v2 (FR-ENRICH-01).</summary>
public enum CreditSource
{
    MusicBrainz,
    Discogs,
}
