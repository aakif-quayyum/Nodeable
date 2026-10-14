namespace Nodeable.Domain.Enums;

/// <summary>How a recording was matched to the provider's track (spec section 8, <c>previews.matched_by</c>).</summary>
public enum PreviewMatch
{
    /// <summary>The provider has a track with one of the recording's ISRCs: the match is by identity.</summary>
    Isrc,

    /// <summary>
    /// No ISRC matched, so a search found a track whose normalised artist and title equal the recording's and whose
    /// length is within ten seconds (FR-PREVIEW-01). Stored apart so hit rates and wrong matches can be told from ISRC ones.
    /// </summary>
    TitleArtist,
}
