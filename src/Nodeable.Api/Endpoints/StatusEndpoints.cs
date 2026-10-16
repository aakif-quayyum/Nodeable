using Microsoft.EntityFrameworkCore;
using Nodeable.Api.RateLimiting;
using Nodeable.Domain.Enums;
using Nodeable.Infrastructure.Persistence;

namespace Nodeable.Api.Endpoints;

public static class StatusEndpoints
{
    public static IEndpointRouteBuilder MapStatusEndpoints(this IEndpointRouteBuilder app)
    {
        var status = app.MapGroup("/api/v1/status");

        status.MapGet("/crawl", async (NodeableDbContext db, CancellationToken cancellationToken) =>
        {
            var queueDepth = await db.CrawlJobs.CountAsync(job => job.Status == CrawlJobStatus.Pending, cancellationToken);

            // Fetch rate and cache hit ratio need telemetry that does not exist before M2, so they are reported as unknown (null), never as a made-up 0 (spec principle 5).
            return TypedResults.Ok(new CrawlStatusResponse(queueDepth, FetchRatePerMinute: null, CacheHitRatio: null));
        })
        .WithName("GetCrawlStatus");

        // The uptime monitor's URL (NFR-OBS-04): 200 with no body when PostgreSQL and Redis answer, 503 with no body when one does not.
        // The body is empty on purpose: a public endpoint should not say which dependency is down.
        status.MapGet("/health", async (IHealthProbe probe, CancellationToken cancellationToken) =>
                await probe.IsHealthyAsync(cancellationToken) ? Results.Ok() : Results.StatusCode(StatusCodes.Status503ServiceUnavailable))
            .RequireRateLimiting(ApiRateLimiting.HealthPolicy)
            .WithName("GetHealth")
            .WithSummary("200 when PostgreSQL and Redis answer, 503 when one does not; no body either way (NFR-OBS-04).")
            .Produces(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status503ServiceUnavailable)
            .ProducesProblem(StatusCodes.Status429TooManyRequests);

        return app;
    }
}
