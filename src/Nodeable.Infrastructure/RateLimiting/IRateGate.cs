namespace Nodeable.Infrastructure.RateLimiting;

/// <summary>
/// A shared limit on how fast requests may go to one external service (NFR-RATE-01). Every instance of every service
/// that calls the external API goes through the same gate, so the limit holds for the whole system, not per process.
/// </summary>
public interface IRateGate
{
    /// <summary>Name of the limited resource, for example "musicbrainz".</summary>
    string Resource { get; }

    /// <summary>Waits until one request may be sent, and returns how long it waited.</summary>
    /// <exception cref="RateGateSaturatedException">The wait would be longer than the gate's maximum.</exception>
    Task<TimeSpan> AcquireAsync(CancellationToken cancellationToken = default);
}

/// <param name="Interval">Time between requests once the burst is used up (1 second is 1 request per second).</param>
/// <param name="Burst">Requests allowed back to back after a quiet period; at least 1.</param>
/// <param name="MaxWait">The longest a caller may be made to wait before the gate refuses instead.</param>
public sealed record RateGateOptions(TimeSpan Interval, int Burst, TimeSpan MaxWait);

/// <summary>The gate has more requests queued than <see cref="RateGateOptions.MaxWait"/> allows.</summary>
public sealed class RateGateSaturatedException : Exception
{
    public RateGateSaturatedException(string resource, TimeSpan maxWait)
        : base($"The rate gate for '{resource}' has no slot within {maxWait.TotalSeconds:0.#} seconds.")
    {
        Resource = resource;
        MaxWait = maxWait;
    }

    public string Resource { get; }

    public TimeSpan MaxWait { get; }
}
