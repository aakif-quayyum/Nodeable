using System.Diagnostics;

namespace Nodeable.Worker;

/// <summary>
/// Placeholder for the crawl queue consumer (M2). For now it only proves the Worker is wired into
/// logging and tracing by emitting a heartbeat log line and span.
/// </summary>
public sealed partial class CrawlWorker(ILogger<CrawlWorker> logger) : BackgroundService
{
    // Matches the "Nodeable.*" wildcard that ServiceDefaults registers, so these spans are exported.
    public const string ActivitySourceName = "Nodeable.Worker";

    private static readonly ActivitySource _activitySource = new(ActivitySourceName);
    private static readonly TimeSpan _heartbeatInterval = TimeSpan.FromSeconds(30);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            Beat();

            try
            {
                await Task.Delay(_heartbeatInterval, stoppingToken);
            }
            catch (OperationCanceledException)
            {
                // Shutdown was requested during the delay. This is normal, not an error.
            }
        }
    }

    private void Beat()
    {
        using var activity = _activitySource.StartActivity("worker.heartbeat");
        activity?.SetTag("worker.name", nameof(CrawlWorker));

        LogHeartbeat(logger, _heartbeatInterval.TotalSeconds);
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "Crawl worker heartbeat; interval {IntervalSeconds}s")]
    private static partial void LogHeartbeat(ILogger logger, double intervalSeconds);
}
