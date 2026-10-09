using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Nodeable.Api.Endpoints;
using Nodeable.Domain.Entities;
using Nodeable.Domain.Enums;
using Nodeable.Infrastructure.Persistence;

namespace Nodeable.Api.Tests;

public class StatusEndpointTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    [Fact]
    public async Task FR_ABOUT_01_crawl_status_counts_only_pending_jobs()
    {
        var ct = TestContext.Current.CancellationToken;
        await ReplaceCrawlJobsAsync(
            NewJob(1, CrawlJobStatus.Pending),
            NewJob(2, CrawlJobStatus.Pending),
            NewJob(3, CrawlJobStatus.Running),
            NewJob(4, CrawlJobStatus.Done));
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/api/v1/status/crawl", ct);
        var body = await response.Content.ReadFromJsonAsync<CrawlStatusResponse>(ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(2, body?.QueueDepth);
    }

    [Fact]
    public async Task FR_ABOUT_01_crawl_status_reports_unmeasured_values_as_null_not_zero()
    {
        var ct = TestContext.Current.CancellationToken;
        await ReplaceCrawlJobsAsync();
        using var client = factory.CreateClient();

        var body = await client.GetFromJsonAsync<CrawlStatusResponse>("/api/v1/status/crawl", ct);

        Assert.Equal(new CrawlStatusResponse(0, null, null), body);
    }

    [Fact]
    public async Task FR_ABOUT_01_openapi_document_describes_the_crawl_status_endpoint()
    {
        var ct = TestContext.Current.CancellationToken;
        using var client = factory.CreateClient();

        var json = await client.GetStringAsync("/openapi/v1.json", ct);
        using var document = JsonDocument.Parse(json);

        var path = document.RootElement.GetProperty("paths").GetProperty("/api/v1/status/crawl");
        Assert.True(path.TryGetProperty("get", out _));
    }

    private static CrawlJob NewJob(int target, CrawlJobStatus status) => new()
    {
        Kind = CrawlJobKind.Recording,
        TargetMbid = new Guid(target, 0, 0, new byte[8]),
        Status = status,
    };

    // Tests in this class share one database, so each starts from a known queue.
    private async Task ReplaceCrawlJobsAsync(params CrawlJob[] jobs)
    {
        var ct = TestContext.Current.CancellationToken;
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<NodeableDbContext>();

        await db.CrawlJobs.ExecuteDeleteAsync(ct);
        db.CrawlJobs.AddRange(jobs);
        await db.SaveChangesAsync(ct);
    }
}
