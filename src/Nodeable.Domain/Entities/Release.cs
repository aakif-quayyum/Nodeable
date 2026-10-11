using Nodeable.Domain.Dates;
using Nodeable.Domain.Enums;

namespace Nodeable.Domain.Entities;

/// <summary>An album or single (spec section 8, <c>releases</c>).</summary>
public class Release
{
    public required Guid Mbid { get; init; }

    public required string Title { get; set; }

    /// <summary>The earliest possible day of the release date. Set it, with its precision, through <see cref="SetDate"/>.</summary>
    public DateOnly? Date { get; private set; }

    /// <summary>How much of <see cref="Date"/> is known; null exactly when the date is null (decision 0008).</summary>
    public DatePrecision? DatePrecision { get; private set; }

    public DateTimeOffset FetchedAt { get; set; }

    /// <summary>Sets the date and its precision together; null clears both.</summary>
    public void SetDate(PartialDate? date)
    {
        Date = date?.Date;
        DatePrecision = date?.Precision;
    }
}
