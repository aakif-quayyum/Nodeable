namespace Nodeable.Domain.Entities;

/// <summary>
/// One number for one metric, dimension and time bucket (spec section 8, <c>metric_rollups</c>; decision 0023). A counter
/// is a <see cref="Count"/> in a bucket; a histogram is one row per upper bound (the bound is in the dimension); a gauge
/// keeps its sample in <see cref="Last"/>. A bucket with no row means "not measured", never zero (spec principle 5).
/// </summary>
public class MetricRollup
{
    /// <summary><c>1m</c> (kept 7 days) or <c>5m</c> (kept 90 days).</summary>
    public required string Resolution { get; init; }

    public required DateTimeOffset BucketStart { get; init; }

    /// <summary>For example <c>external.requests</c> or <c>api.latency</c>.</summary>
    public required string Metric { get; init; }

    /// <summary>
    /// The labels, as sorted <c>key=value</c> pairs joined by commas, or empty (for example <c>source=musicbrainz,status=503</c>
    /// or <c>le=1000,route=search</c>), so one column holds any set of labels and a row can be added to by any writer.
    /// </summary>
    public required string Dimension { get; init; }

    public long Count { get; set; }

    public double? Sum { get; set; }

    public double? Min { get; set; }

    public double? Max { get; set; }

    public double? Last { get; set; }
}
