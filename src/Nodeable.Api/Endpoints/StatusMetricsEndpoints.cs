using Microsoft.AspNetCore.Http.HttpResults;
using Nodeable.Api.RateLimiting;
using Nodeable.Infrastructure.Metrics;

namespace Nodeable.Api.Endpoints;

/// <summary>
/// The status page's and the About page's data (NFR-OBS-03, FR-ABOUT-01, decision 0023): the rollup cut into steps to fit a
/// chart. Both read PostgreSQL only and make no external request. The public answer holds the crawler's numbers and nothing
/// else; the private one needs the operator password.
/// </summary>
public static class StatusMetricsEndpoints
{
    public const string DefaultRange = "24h";

    private static readonly Dictionary<string, TimeSpan> _ranges = new(StringComparer.Ordinal)
    {
        ["1h"] = TimeSpan.FromHours(1),
        ["6h"] = TimeSpan.FromHours(6),
        ["24h"] = TimeSpan.FromHours(24),
        ["7d"] = TimeSpan.FromDays(7),
    };

    public static IEndpointRouteBuilder MapStatusMetricsEndpoints(this IEndpointRouteBuilder app)
    {
        var status = app.MapGroup("/api/v1/status");

        status.MapGet("/public/metrics", GetPublic)
            .RequireRateLimiting(ApiRateLimiting.StatusPublicPolicy)
            .WithName("GetPublicMetrics")
            .WithSummary("The crawler's series for the About page, bucketed to the chart width; no password (FR-ABOUT-01, NFR-OBS-03).")
            .ProducesProblem(StatusCodes.Status400BadRequest)
            .ProducesProblem(StatusCodes.Status429TooManyRequests);

        // The group's filter runs for every private endpoint, and the limiter runs before it, so a wrong password costs a permit.
        status.MapGroup("/private")
            .AddEndpointFilter<OperatorAuthFilter>()
            .RequireRateLimiting(ApiRateLimiting.StatusPrivatePolicy)
            .MapGet("/metrics", GetPrivate)
            .WithName("GetPrivateMetrics")
            .WithSummary("Every panel of /status with the SLO thresholds and breach annotations; HTTP Basic (NFR-OBS-03, decision 0023).")
            .ProducesProblem(StatusCodes.Status400BadRequest)
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .ProducesProblem(StatusCodes.Status429TooManyRequests);

        return app;
    }

    private static async Task<Results<Ok<MetricsResponse>, ProblemHttpResult>> GetPublic(
        string? range, int? width, StatusMetricsReader reader, TimeProvider time, CancellationToken cancellationToken)
    {
        if (!TryResolve(range, null, null, width, time.GetUtcNow(), out var window, out var problem))
        {
            return problem!;
        }

        return TypedResults.Ok(await reader.GetAsync(window.From, window.To, window.Width, MetricsScope.Public, cancellationToken));
    }

    private static async Task<Results<Ok<MetricsResponse>, ProblemHttpResult>> GetPrivate(
        string? range, DateTimeOffset? from, DateTimeOffset? to, int? width, StatusMetricsReader reader, TimeProvider time, CancellationToken cancellationToken)
    {
        if (!TryResolve(range, from, to, width, time.GetUtcNow(), out var window, out var problem))
        {
            return problem!;
        }

        return TypedResults.Ok(await reader.GetAsync(window.From, window.To, window.Width, MetricsScope.Private, cancellationToken));
    }

    private readonly record struct Window(DateTimeOffset From, DateTimeOffset To, int Width);

    /// <summary>Turns the query into a window, or says why it cannot. An explicit <c>from</c> and <c>to</c> (drag-to-zoom) override <c>range</c>.</summary>
    private static bool TryResolve(string? range, DateTimeOffset? from, DateTimeOffset? to, int? width, DateTimeOffset now, out Window window, out ProblemHttpResult? problem)
    {
        window = default;
        var chosenWidth = width ?? StatusMetricsReader.DefaultWidth;
        if (chosenWidth is < StatusMetricsReader.MinWidth or > StatusMetricsReader.MaxWidth)
        {
            problem = Bad($"width must be between {StatusMetricsReader.MinWidth} and {StatusMetricsReader.MaxWidth}.");
            return false;
        }

        if (from is not null || to is not null)
        {
            if (from is null || to is null)
            {
                problem = Bad("from and to must be sent together.");
                return false;
            }

            var start = from.Value.ToUniversalTime();
            var end = to.Value.ToUniversalTime();
            if (start >= end || end > now.AddMinutes(1) || end - start > StatusMetricsReader.MaxSpan || start < now - StatusMetricsReader.MaxSpan)
            {
                problem = Bad($"from must be before to, to cannot be in the future, and the window must lie within the last {StatusMetricsReader.MaxSpan.TotalDays:0} days.");
                return false;
            }

            window = new Window(start, end, chosenWidth);
            problem = null;
            return true;
        }

        if (!_ranges.TryGetValue(range ?? DefaultRange, out var span))
        {
            problem = Bad("range must be one of 1h, 6h, 24h or 7d.");
            return false;
        }

        window = new Window(now - span, now, chosenWidth);
        problem = null;
        return true;
    }

    private static ProblemHttpResult Bad(string detail) =>
        TypedResults.Problem(type: ProblemTypes.InvalidRequest, title: "Invalid metrics request", detail: detail, statusCode: StatusCodes.Status400BadRequest);
}
