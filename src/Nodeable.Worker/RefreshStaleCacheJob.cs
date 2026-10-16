using Nodeable.Infrastructure.Refresh;

namespace Nodeable.Worker;

/// <summary>
/// The Hangfire job behind the 30-day cache refresh (NFR-REL-03, decision 0028). Hangfire calls <see cref="RunAsync"/> on
/// its schedule; the selection and the queueing are <see cref="StaleCacheRefresher"/>'s, so this class is only the door
/// the scheduler knocks on.
/// </summary>
// LEARN: LG-04 hangfire-di-job | Hangfire builds a job object for each run through the host's own service provider, in a scope of its own, so a job asks for the scoped services it needs (here the refresher with its DbContext) in its constructor, exactly as a controller does
public sealed partial class RefreshStaleCacheJob(StaleCacheRefresher refresher, ILogger<RefreshStaleCacheJob> logger)
{
    /// <summary>Hangfire supplies the token and cancels it when the server shuts down.</summary>
    public async Task RunAsync(CancellationToken cancellationToken)
    {
        var queued = await refresher.RunAsync(cancellationToken);
        LogQueued(logger, queued);
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "Cache refresh queued {Queued} fetches")]
    private static partial void LogQueued(ILogger logger, int queued);
}
