namespace Nodeable.Domain.Entities;

/// <summary>One service level objective as the daily check found it (spec section 8, <c>slo_checks</c>; section 11).</summary>
public class SloCheck
{
    public required DateTimeOffset CheckedAt { get; init; }

    /// <summary>For example <c>api-availability</c> or <c>search-latency</c>.</summary>
    public required string Slo { get; init; }

    public int WindowDays { get; set; }

    /// <summary>The measured share (0 to 1), or null when the rollup had nothing for the window: unmeasured is not a pass.</summary>
    public double? Observed { get; set; }

    public double Target { get; set; }

    public bool Breached { get; set; }
}
