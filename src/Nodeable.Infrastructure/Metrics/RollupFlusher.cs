using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Nodeable.Infrastructure.Metrics;

/// <summary>
/// Once a minute, writes what the process's <see cref="RollupRecorder"/> saw into <c>metric_rollups</c> (decision 0023).
/// The deltas of a minute go into that minute's bucket, so a crash loses at most the minute in progress. A write that
/// fails is put back and carried by the next flush, so a database that is away for a moment loses nothing.
/// </summary>
public sealed partial class RollupFlusher(
    RollupRecorder recorder,
    IServiceScopeFactory scopes,
    TimeProvider time,
    ILogger<RollupFlusher> logger) : BackgroundService
{
    private static readonly TimeSpan _stopBudget = TimeSpan.FromSeconds(5);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            // A second past the minute, so the measurements of the minute that just ended have all been made.
            var now = time.GetUtcNow();
            var nextMinute = Floor(now).AddMinutes(1);
            try
            {
                await Task.Delay(nextMinute.AddSeconds(1) - now, time, stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }

            await FlushAsync(Floor(time.GetUtcNow()).AddMinutes(-1), stoppingToken);
        }
    }

    public override async Task StopAsync(CancellationToken cancellationToken)
    {
        await base.StopAsync(cancellationToken);

        // The minute in progress is written on the way out, within a short budget, so a restart does not lose it. Stopping
        // must never fail because of it: by now the database or the logger may already be going away.
        try
        {
            using var budget = new CancellationTokenSource(_stopBudget);
            await FlushAsync(Floor(time.GetUtcNow()), budget.Token);
        }
#pragma warning disable CA1031 // Shutdown is best effort: a failed last flush loses one minute, which the design accepts.
        catch (Exception)
#pragma warning restore CA1031
        {
            // Nothing to do: the numbers of this last minute are lost, as they would be in a crash.
        }
    }

    /// <summary>Writes everything recorded so far into the bucket that starts at <paramref name="bucketStart"/>.</summary>
    public async Task FlushAsync(DateTimeOffset bucketStart, CancellationToken cancellationToken)
    {
        var deltas = recorder.Drain();
        if (deltas.Count == 0)
        {
            return;
        }

        try
        {
            await using var scope = scopes.CreateAsyncScope();
            await scope.ServiceProvider.GetRequiredService<RollupWriter>().AddAsync(bucketStart, deltas, cancellationToken);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            recorder.Restore(deltas);
            LogFlushFailed(logger, ex, deltas.Count);
        }
    }

    private static DateTimeOffset Floor(DateTimeOffset moment) =>
        new(moment.Year, moment.Month, moment.Day, moment.Hour, moment.Minute, 0, TimeSpan.Zero);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Rollup flush failed; {Count} rows are kept for the next flush")]
    private static partial void LogFlushFailed(ILogger logger, Exception exception, int count);
}
