using Nodeable.Infrastructure.Metrics;

namespace Nodeable.Worker;

/// <summary>
/// The Hangfire job behind the metrics rollup's housekeeping (NFR-OBS-02, decision 0023): every minute it samples the queue,
/// folds 1-minute rows into 5-minute rows and deletes expired ones. The work is <see cref="RollupMaintenance"/>'s.
/// </summary>
public sealed class RollupMaintenanceJob(RollupMaintenance maintenance)
{
    /// <summary>Hangfire supplies the token and cancels it when the server shuts down.</summary>
    public Task RunAsync(CancellationToken cancellationToken) => maintenance.RunAsync(cancellationToken);
}
