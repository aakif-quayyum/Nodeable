using Microsoft.EntityFrameworkCore;
using Nodeable.Domain.Enums;
using Nodeable.Infrastructure.Persistence;

namespace Nodeable.Api.Endpoints;

public static class StatusEndpoints
{
    public static IEndpointRouteBuilder MapStatusEndpoints(this IEndpointRouteBuilder app)
    {
        // LEARN: LG-01 route-group | MapGroup gives a set of endpoints a shared prefix (and, later, shared filters or auth), much like app.use("/api/v1/status", router) in Express
        var status = app.MapGroup("/api/v1/status");

        // LEARN: LG-01 minimal-api-handler | The lambda's parameters are filled by dependency injection: NodeableDbContext comes from the container and CancellationToken is cancelled if the client disconnects; there is no req/res object to unpack
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
