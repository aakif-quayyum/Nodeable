namespace Nodeable.Domain.Enums;

/// <summary>How much of a MusicBrainz date is actually known (spec section 8, <c>first_release_date_precision</c>).</summary>
public enum DatePrecision
{
    /// <summary>Only the year is known, for example "1995".</summary>
    Year,

    /// <summary>The year and month are known, for example "1995-03".</summary>
    Month,

    /// <summary>The full date is known, for example "1995-03-07".</summary>
    Day,
}
