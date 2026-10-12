using System.Collections.Concurrent;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Nodeable.Infrastructure.Graphs;

/// <summary>
/// Sends <c>HubsUpdated</c> at most once per second per graph (spec section 9). A burst of finished jobs asks many
/// times; the first ask is answered at once, and asks that arrive within the second share one trailing send that
/// reads the hubs at the moment it is sent, so the browser always ends on the latest state.
/// </summary>
public sealed partial class HubsUpdatedDebouncer(IServiceScopeFactory scopes, TimeProvider time, ILogger<HubsUpdatedDebouncer> logger)
{
    public static readonly TimeSpan Interval = TimeSpan.FromSeconds(1);

    private sealed class State
    {
        public readonly object Gate = new();
        public DateTimeOffset LastSent = DateTimeOffset.MinValue;
        public bool Scheduled;
    }

    private readonly ConcurrentDictionary<Guid, State> _graphs = new();

    // Sends in flight: kept so tests and shutdown can wait for them instead of guessing at a delay.
    private readonly ConcurrentDictionary<Task, byte> _inFlight = new();

    /// <summary>Asks for the graph's hubs to be sent: now, or at the end of the current second.</summary>
    public void Request(Guid graphId)
    {
        var state = _graphs.GetOrAdd(graphId, _ => new State());

        TimeSpan wait;
        lock (state.Gate)
        {
            if (state.Scheduled)
            {
                // A send is already due and will read the state after this change.
                return;
            }

            state.Scheduled = true;
            var due = state.LastSent + Interval;
            var now = time.GetUtcNow();
            wait = due > now ? due - now : TimeSpan.Zero;
        }

        var send = Task.Run(() => SendAfterAsync(graphId, state, wait));
        _inFlight[send] = 0;
        _ = send.ContinueWith(finished => _inFlight.TryRemove(finished, out _), TaskScheduler.Default);
    }

    /// <summary>Completes when every send requested so far has been made.</summary>
    public Task WhenIdleAsync() => Task.WhenAll(_inFlight.Keys);

    private async Task SendAfterAsync(Guid graphId, State state, TimeSpan wait)
    {
        try
        {
            if (wait > TimeSpan.Zero)
            {
                // LEARN: LG-03 time-provider | TimeProvider is .NET's injectable clock: Task.Delay(wait, time) uses it, so a test hands in a FakeTimeProvider and moves time forward by hand instead of sleeping, which JavaScript tests do with fake timers
                await Task.Delay(wait, time);
            }

            lock (state.Gate)
            {
                // From here a new request schedules the next send: this one reads the state after this point.
                state.LastSent = time.GetUtcNow();
                state.Scheduled = false;
            }

            await using var scope = scopes.CreateAsyncScope();
            var hubs = await scope.ServiceProvider.GetRequiredService<GraphReadModel>().GetHubsAsync(graphId, CancellationToken.None);
            await scope.ServiceProvider.GetRequiredService<IGraphEvents>().HubsUpdatedAsync(graphId, hubs, CancellationToken.None);
        }
        catch (Exception exception)
        {
            // Events are best effort: a browser that misses one loads the snapshot on its next reconnect.
            lock (state.Gate)
            {
                state.Scheduled = false;
            }

            LogSendFailed(logger, exception, graphId);
        }
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Could not send the hubs of graph {GraphId}")]
    private static partial void LogSendFailed(ILogger logger, Exception exception, Guid graphId);
}
