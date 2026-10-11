using Microsoft.Extensions.Options;
using Nodeable.Infrastructure.Crawling;

namespace Nodeable.Worker;

/// <summary>
/// The Worker's main loop (spec section 7): keep claiming crawl jobs and running them, one at a time. Running a job
/// is <see cref="ICrawlJobRunner"/>'s business; this class decides only when to ask, when to rest, and how to behave
/// when the service is stopped or the database is briefly unavailable.
/// </summary>
// LEARN: LG-02 background-service | BackgroundService turns a long-running loop into a hosted service: the host calls ExecuteAsync at startup and cancels its token at shutdown, which is how a .NET worker is stopped cleanly (like handling SIGTERM in Node)
public sealed partial class CrawlWorker(
    ICrawlJobRunner runner,
    IOptions<CrawlOptions> options,
    ILogger<CrawlWorker> logger) : BackgroundService
{
    private readonly CrawlOptions _options = options.Value;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var nextStaleCheck = DateTimeOffset.MinValue;

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                // The first pass recovers jobs that a previous process left running when it died (NFR-REL-01).
                if (DateTimeOffset.UtcNow >= nextStaleCheck)
                {
                    await runner.RecoverStaleAsync(stoppingToken);
                    nextStaleCheck = DateTimeOffset.UtcNow + _options.StaleCheckInterval;
                }

                // Work back to back while there is work; rest only when the queue is empty.
                var ranJob = await runner.RunOnceAsync(stoppingToken);
                if (!ranJob)
                {
                    await Task.Delay(_options.PollInterval, stoppingToken);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                // Shutdown was requested. This is normal, not an error.
                break;
            }
            catch (Exception exception)
            {
                // One bad pass (the database restarting, a network blip) must not end the service: wait and try again.
                LogLoopError(logger, exception, _options.ErrorDelay.TotalSeconds);
                await DelayAsync(_options.ErrorDelay, stoppingToken);
            }
        }
    }

    private static async Task DelayAsync(TimeSpan delay, CancellationToken cancellationToken)
    {
        try
        {
            await Task.Delay(delay, cancellationToken);
        }
        catch (OperationCanceledException)
        {
            // Stopping during the pause is fine; the loop condition ends the service.
        }
    }

    [LoggerMessage(Level = LogLevel.Error, Message = "The crawl loop hit an unexpected error and will continue after {DelaySeconds}s")]
    private static partial void LogLoopError(ILogger logger, Exception exception, double delaySeconds);
}
