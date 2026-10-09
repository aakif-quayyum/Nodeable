namespace Nodeable.Domain.Enums;

/// <summary>The app's role for a credit, mapped from MusicBrainz relationship types (spec section 10, "Role mapping").</summary>
public enum CreditRole
{
    Producer,
    Songwriter,
    Mixing,
    Engineering,
    Instrument,
    Vocal,

    /// <summary>Unmapped relationship types; the raw MusicBrainz type is kept in <c>Credit.Detail</c> so nothing is lost.</summary>
    Other,
}
