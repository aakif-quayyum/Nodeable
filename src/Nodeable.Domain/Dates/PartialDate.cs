using System.Globalization;
using Nodeable.Domain.Enums;

namespace Nodeable.Domain.Dates;

/// <summary>
/// A MusicBrainz date, which may be only a year or a year and month (decision 0008). It is stored as its earliest
/// possible day plus how much was really known, so "1995" becomes 1995-01-01 with precision <see cref="DatePrecision.Year"/>:
/// ordering uses the date, and the UI formats by precision instead of showing an invented "1 January".
/// </summary>
// LEARN: LG-02 record-struct | A readonly record struct is a small immutable value type with value equality built in: two PartialDate values with the same date and precision are equal, and it costs no heap allocation
public readonly record struct PartialDate(DateOnly Date, DatePrecision Precision)
{
    /// <summary>
    /// Reads "1995", "1995-03" or "1995-03-07". Anything else (empty, wrong length, month 13, 30 February) is
    /// not a date, and the caller stores no date rather than a wrong one.
    /// </summary>
    public static bool TryParse(string? text, out PartialDate result)
    {
        result = default;
        if (string.IsNullOrWhiteSpace(text))
        {
            return false;
        }

        var parts = text.Trim().Split('-');
        if (parts.Length is < 1 or > 3 || !TryReadNumber(parts[0], 4, out var year))
        {
            return false;
        }

        var month = 1;
        var day = 1;
        if ((parts.Length >= 2 && !TryReadNumber(parts[1], 2, out month)) || (parts.Length == 3 && !TryReadNumber(parts[2], 2, out day)))
        {
            return false;
        }

        // DateOnly's constructor throws for an impossible date, so the calendar is checked first.
        if (year < 1 || month is < 1 or > 12 || day < 1 || day > DateTime.DaysInMonth(year, month))
        {
            return false;
        }

        var precision = parts.Length switch
        {
            1 => DatePrecision.Year,
            2 => DatePrecision.Month,
            _ => DatePrecision.Day,
        };
        result = new PartialDate(new DateOnly(year, month, day), precision);
        return true;
    }

    // MusicBrainz zero-pads every part, so "1995-3" is rejected as malformed, not guessed at.
    private static bool TryReadNumber(string part, int length, out int value)
    {
        value = 0;
        return part.Length == length && int.TryParse(part, NumberStyles.None, CultureInfo.InvariantCulture, out value);
    }
}
