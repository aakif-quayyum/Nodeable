namespace Nodeable.Domain.Crawling;

/// <summary>
/// When a crawl job that failed is tried again, and when it is given up on (NFR-REL-01). This is about the job as a
/// whole; the HTTP-level retries inside one MusicBrainz call are a separate layer (NFR-RATE-03).
/// </summary>
/// <param name="MaxAttempts">Attempts, counting the first, before the job is marked failed.</param>
/// <param name="BaseDelay">Wait before the second attempt; each further wait doubles.</param>
/// <param name="MaxDelay">No wait is longer than this.</param>
public sealed record CrawlRetryPolicy(int MaxAttempts, TimeSpan BaseDelay, TimeSpan MaxDelay)
{
    /// <summary>True while another attempt is allowed after <paramref name="attemptsMade"/> attempts.</summary>
    public bool CanRetry(int attemptsMade) => attemptsMade < MaxAttempts;

    /// <summary>
    /// The wait before the next attempt: <c>BaseDelay * 2^(attemptsMade - 1)</c>, capped at <see cref="MaxDelay"/>,
    /// then spread by up to 20% either way so jobs that failed together do not all come back together.
    /// </summary>
    /// <param name="attemptsMade">Attempts so far, at least 1.</param>
    /// <param name="jitter">A random number from 0 to 1. A parameter, not drawn here, so the result is testable.</param>
    public TimeSpan DelayAfter(int attemptsMade, double jitter)
    {
        ArgumentOutOfRangeException.ThrowIfLessThan(attemptsMade, 1);
        ArgumentOutOfRangeException.ThrowIfLessThan(jitter, 0d);
        ArgumentOutOfRangeException.ThrowIfGreaterThan(jitter, 1d);

        // Doubling more than 30 times only overflows; the cap has long applied by then.
        var exponent = Math.Min(attemptsMade - 1, 30);
        var uncapped = BaseDelay.TotalSeconds * Math.Pow(2, exponent);
        var capped = Math.Min(uncapped, MaxDelay.TotalSeconds);

        var spread = 0.8 + (0.4 * jitter);
        return TimeSpan.FromSeconds(capped * spread);
    }
}
