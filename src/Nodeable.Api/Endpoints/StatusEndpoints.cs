using Microsoft.EntityFrameworkCore;
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

        return app;
    }
}
