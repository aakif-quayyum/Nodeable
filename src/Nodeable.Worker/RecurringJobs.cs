using Hangfire;
using Microsoft.Extensions.Options;
using Nodeable.Infrastructure.Refresh;

namespace Nodeable.Worker;

/// <summary>
/// Declares the Worker's recurring jobs when it starts. <c>AddOrUpdate</c> is idempotent: the job lives in PostgreSQL
/// under its id, so starting a second Worker, or restarting this one, replaces the same entry instead of adding another,
/// and a changed cron expression in configuration takes effect on the next start.
/// </summary>
public sealed class RecurringJobs(IRecurringJobManager manager, IOptions<RefreshOptions> refresh) : IHostedService
{
    /// <summary>The id the refresh is stored under in Hangfire (the dashboard shows it).</summary>
    public const string CacheRefreshId = "cache-refresh";

    public Task StartAsync(CancellationToken cancellationToken)
    {
        manager.AddOrUpdate<RefreshStaleCacheJob>(
            CacheRefreshId,
            job => job.RunAsync(CancellationToken.None),
            refresh.Value.Cron,
            new RecurringJobOptions { TimeZone = TimeZoneInfo.Utc });
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
