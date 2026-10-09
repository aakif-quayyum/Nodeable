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
        // LEARN: LG-01 cancellation-token | stoppingToken is how the host says "shut down now"; it is passed explicitly into every await, much like an AbortSignal in fetch, and nothing cancels unless you thread it through
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
        // LEARN: LG-01 activity-span | StartActivity creates a trace span (an Activity in .NET); it returns null when no exporter is listening, hence the "?." null-conditional below, which behaves like optional chaining in JavaScript
        using var activity = _activitySource.StartActivity("worker.heartbeat");
        activity?.SetTag("worker.name", nameof(CrawlWorker));

        LogHeartbeat(logger, _heartbeatInterval.TotalSeconds);
    }

    // LEARN: LG-01 logger-message | [LoggerMessage] is a source generator: you declare a partial method and the compiler writes its body at build time, so logging allocates nothing when the level is off; {IntervalSeconds} stays a named, searchable field on the log record instead of being baked into a string
    [LoggerMessage(Level = LogLevel.Information, Message = "Crawl worker heartbeat; interval {IntervalSeconds}s")]
    private static partial void LogHeartbeat(ILogger logger, double intervalSeconds);
}
