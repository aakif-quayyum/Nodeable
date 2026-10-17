namespace Nodeable.Infrastructure.Metrics;

// The shapes the status endpoints return (spec section 9, NFR-OBS-03). Plain records, so the same type is the JSON contract,
// the OpenAPI schema and the generated TypeScript type.

/// <summary>One line on a chart: a value for every time in <see cref="MetricsResponse.Times"/>, <c>null</c> where it was not measured.</summary>
/// <param name="Id">A stable name such as <c>jobs.done</c> or <c>cache.hitRatio</c>.</param>
/// <param name="Unit">What a point is: <c>count</c> (a total for the step), <c>ratio</c> (0 to 1), <c>jobs</c> or <c>seconds</c> (a sampled value).</param>
public sealed record MetricSeries(string Id, string Label, string Unit, IReadOnlyList<double?> Points);

/// <summary>A heatmap of response times: how many requests fell in each bound at each time.</summary>
/// <param name="Bounds">Upper bounds in seconds, the last being <c>inf</c>.</param>
/// <param name="Cells">One <c>[timeIndex, boundIndex, count]</c> for each cell that is not empty.</param>
public sealed record MetricHeatmap(IReadOnlyList<string> Bounds, IReadOnlyList<int[]> Cells);

/// <summary>An objective and the latest check of it. <c>Observed</c> is null when nothing has measured it yet.</summary>
public sealed record SloStatus(string Slo, string Label, double Target, bool AtLeast, double? Observed, bool Breached, DateTimeOffset? CheckedAt);

/// <summary>A check that failed, to mark on the time axis.</summary>
public sealed record SloBreach(DateTimeOffset At, string Slo, double? Observed, double Target, string Text);

/// <summary>
/// A window of the rollup, bucketed to the width the chart can draw. <c>Times</c> has a slot for every step, so a gap is a
/// <c>null</c> in a series and never a skipped point (spec principle 5). <c>Slos</c> and <c>Breaches</c> are only in the
/// private answer.
/// </summary>
public sealed record MetricsResponse(
    DateTimeOffset From,
    DateTimeOffset To,
    int StepSeconds,
    string Resolution,
    IReadOnlyList<DateTimeOffset> Times,
    IReadOnlyList<MetricSeries> Series,
    MetricHeatmap? Heatmap,
    IReadOnlyList<SloStatus>? Slos,
    IReadOnlyList<SloBreach>? Breaches);
