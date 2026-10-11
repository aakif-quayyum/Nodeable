namespace Nodeable.Domain.Mapping;

/// <summary>
/// Chooses which release to fetch when a recording has no producer credit (spec section 10, step 4). One release is
/// fetched, not all of them: a recording can appear on dozens of compilations and every fetch costs a second of the
/// shared rate budget.
/// </summary>
public static class ReleaseSelector
{
    /// <summary>
    /// The release with the earliest date, because the original release is the one most likely to carry the
    /// production credits. A release with no date ranks after every dated one; ties keep MusicBrainz's order.
    /// Returns null when there are no releases.
    /// </summary>
    public static Guid? Earliest(IEnumerable<(Guid Id, DateOnly? Date)> releases)
    {
        // LEARN: LG-02 linq-order-stable | LINQ's OrderBy is stable, so releases with the same date keep the order MusicBrainz sent them in; a null date is mapped to the maximum so undated releases sort last without a special case
        var chosen = releases
            .OrderBy(r => r.Date ?? DateOnly.MaxValue)
            .Select(r => (Guid?)r.Id)
            .FirstOrDefault();

        return chosen;
    }
}
