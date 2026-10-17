using Nodeable.Infrastructure.Metrics;

namespace Nodeable.Worker;

/// <summary>
/// The Hangfire job behind the daily SLO check (NFR-OBS-04, decision 0023). The arithmetic is <see cref="SloChecker"/>'s.
/// </summary>
public sealed class SloCheckJob(SloChecker checker)
{
    /// <summary>Hangfire supplies the token and cancels it when the server shuts down.</summary>
    public Task RunAsync(CancellationToken cancellationToken) => checker.RunAsync(cancellationToken);
}
