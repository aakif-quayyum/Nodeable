using Microsoft.EntityFrameworkCore;
using Nodeable.Infrastructure.Persistence;
using StackExchange.Redis;

namespace Nodeable.Api;

/// <summary>Answers "can this host do its job right now?" for the uptime monitor (NFR-OBS-04).</summary>
public interface IHealthProbe
{
    /// <summary>True only when every dependency answered within the time allowed.</summary>
    Task<bool> IsHealthyAsync(CancellationToken cancellationToken);
}

/// <summary>PostgreSQL and Redis must both answer, each within two seconds: a hung dependency is as down as a refused one.</summary>
public sealed class DependencyHealthProbe(NodeableDbContext db, IConnectionMultiplexer redis) : IHealthProbe
{
    private static readonly TimeSpan _allowed = TimeSpan.FromSeconds(2);

    public async Task<bool> IsHealthyAsync(CancellationToken cancellationToken)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(_allowed);

        try
        {
            if (!await db.Database.CanConnectAsync(timeout.Token))
            {
                return false;
            }

            // WaitAsync lets the token stop the wait: StackExchange.Redis takes no token of its own.
            await redis.GetDatabase().PingAsync().WaitAsync(timeout.Token);
            return true;
        }
        catch (Exception ex) when (ex is RedisException or TimeoutException or OperationCanceledException or InvalidOperationException)
        {
            // Any failure to reach a dependency is "not healthy"; the monitor needs the answer, not the reason (which is in the logs and traces).
            cancellationToken.ThrowIfCancellationRequested();
            return false;
        }
    }
}
