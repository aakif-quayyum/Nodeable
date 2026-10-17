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

    /// <summary>The id of the metrics rollup's minute-by-minute housekeeping (NFR-OBS-02).</summary>
    public const string RollupMaintenanceId = "rollup-maintenance";

    /// <summary>The id of the daily SLO check (NFR-OBS-04).</summary>
    public const string SloCheckId = "slo-check";

    public Task StartAsync(CancellationToken cancellationToken)
    {
        manager.AddOrUpdate<RefreshStaleCacheJob>(
            CacheRefreshId,
            job => job.RunAsync(CancellationToken.None),
            refresh.Value.Cron,
            new RecurringJobOptions { TimeZone = TimeZoneInfo.Utc });

        manager.AddOrUpdate<RollupMaintenanceJob>(
            RollupMaintenanceId,
            job => job.RunAsync(CancellationToken.None),
            Cron.Minutely(),
            new RecurringJobOptions { TimeZone = TimeZoneInfo.Utc });

        // Daily, in the small hours UTC and not on the hour, when the day's numbers are folded and the host is quiet.
        manager.AddOrUpdate<SloCheckJob>(
            SloCheckId,
            job => job.RunAsync(CancellationToken.None),
            "17 3 * * *",
            new RecurringJobOptions { TimeZone = TimeZoneInfo.Utc });
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
