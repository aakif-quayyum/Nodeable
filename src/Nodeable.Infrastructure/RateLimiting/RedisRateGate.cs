using Nodeable.Infrastructure.Telemetry;
using StackExchange.Redis;

namespace Nodeable.Infrastructure.RateLimiting;

/// <summary>
/// A token bucket kept in Redis (NFR-RATE-01). The whole decision runs as one Lua script inside Redis, so concurrent
/// callers on any number of machines are handled one at a time and cannot both take the same slot.
/// </summary>
/// <remarks>
/// The bucket is stored as a single number, the time at which it would be full again (the "theoretical arrival time"
/// of the GCRA form of a token bucket). Each request takes the earliest free slot and moves that time forward by one
/// interval. The script returns how long the caller must wait for its slot, and the caller sleeps that long. This is
/// fairer than polling for a token: every waiter is given its own place in line and nobody retries in a loop.
/// </remarks>
public sealed class RedisRateGate(IConnectionMultiplexer redis, string resource, RateGateOptions options) : IRateGate
{
    // LEARN: LG-02 lua-token-bucket | A Lua script runs atomically inside Redis, so "read the bucket, decide, write it back" cannot interleave with another instance's call; the clock is Redis's own TIME, so machines with skewed clocks still agree
    private static readonly LuaScript _script = LuaScript.Prepare("""
        local interval = tonumber(@interval)
        local burst = tonumber(@burst)
        local maxWait = tonumber(@maxWait)
        local t = redis.call('TIME')
        local now = t[1] * 1000 + math.floor(t[2] / 1000)
        local tat = tonumber(redis.call('GET', @key))
        if tat == nil or tat < now then tat = now end
        local wait = tat - (burst - 1) * interval - now
        if wait < 0 then wait = 0 end
        if wait > maxWait then return -1 end
        local newTat = tat + interval
        redis.call('SET', @key, newTat, 'PX', newTat - now + interval)
        return wait
        """);

    private readonly RedisKey _key = $"ratelimit:{resource}";

    public string Resource => resource;

    public async Task<TimeSpan> AcquireAsync(CancellationToken cancellationToken = default)
    {
        using var activity = InfrastructureTelemetry.ActivitySource.StartActivity("ratelimit.acquire");
        activity?.SetTag("ratelimit.source", resource);

        var reply = await redis.GetDatabase().ScriptEvaluateAsync(
            _script,
            new
            {
                key = _key,
                interval = (long)options.Interval.TotalMilliseconds,
                burst = options.Burst,
                maxWait = (long)options.MaxWait.TotalMilliseconds,
            });

        var waitMs = (long)reply;
        if (waitMs < 0)
        {
            activity?.SetStatus(System.Diagnostics.ActivityStatusCode.Error, "rate gate saturated");
            throw new RateGateSaturatedException(resource, options.MaxWait);
        }

        activity?.SetTag("ratelimit.wait_ms", waitMs);
        InfrastructureTelemetry.RateGateWait.Record(waitMs / 1000d, new KeyValuePair<string, object?>("source", resource));
        var wait = TimeSpan.FromMilliseconds(waitMs);
        if (wait > TimeSpan.Zero)
        {
            // The slot is already reserved, so a cancelled wait leaves a gap rather than an over-limit burst.
            await Task.Delay(wait, cancellationToken);
        }

        return wait;
    }
}
