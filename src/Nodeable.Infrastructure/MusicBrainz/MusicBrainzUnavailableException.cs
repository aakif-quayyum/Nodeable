using System.Net;
using Nodeable.Infrastructure.RateLimiting;
using Polly.Timeout;

namespace Nodeable.Infrastructure.MusicBrainz;

/// <summary>Why a request the Api made to MusicBrainz itself could not be answered.</summary>
public enum MusicBrainzFailure
{
    /// <summary>The shared MusicBrainz rate gate had no slot within the interactive wait cap (decision 0018).</summary>
    RateLimited,

    /// <summary>MusicBrainz answered 503 or 429 until the retries ran out, or took too long.</summary>
    UpstreamUnavailable,

    /// <summary>MusicBrainz answered with another error status.</summary>
    UpstreamError,
}

/// <summary>
/// A call the Api makes to MusicBrainz in the request itself (a search, or checking a recording before it is added to
/// a graph) that could not be answered. The Api turns it into a Problem Details response; the code that makes the call
/// does not know about the HTTP status codes of its own callers.
/// </summary>
public sealed class MusicBrainzUnavailableException(MusicBrainzFailure failure, TimeSpan retryAfter, Exception inner)
    : Exception($"MusicBrainz is unavailable: {failure}.", inner)
{
    public MusicBrainzFailure Failure { get; } = failure;

    /// <summary>A sensible time for the caller to wait before trying again.</summary>
    public TimeSpan RetryAfter { get; } = retryAfter;

    /// <summary>
    /// Runs one request-path call to MusicBrainz and turns the ways it can fail into this exception. A caller that
    /// cancelled is not translated: <see cref="OperationCanceledException"/> propagates.
    /// </summary>
    public static async Task<T> TranslateAsync<T>(Func<Task<T>> call)
    {
        // How long a refused caller is told to wait when MusicBrainz is busy: long enough for its 503s to clear.
        var upstreamRetryAfter = TimeSpan.FromSeconds(5);

        try
        {
            return await call();
        }
        catch (RateGateSaturatedException ex)
        {
            throw new MusicBrainzUnavailableException(MusicBrainzFailure.RateLimited, ex.MaxWait, ex);
        }
        catch (MusicBrainzException ex) when (ex.StatusCode is HttpStatusCode.ServiceUnavailable or HttpStatusCode.TooManyRequests)
        {
            throw new MusicBrainzUnavailableException(MusicBrainzFailure.UpstreamUnavailable, upstreamRetryAfter, ex);
        }
        catch (MusicBrainzException ex)
        {
            throw new MusicBrainzUnavailableException(MusicBrainzFailure.UpstreamError, upstreamRetryAfter, ex);
        }
        catch (Exception ex) when (ex is TimeoutRejectedException or HttpRequestException)
        {
            // The resilience pipeline gave up (its timeout, or the network).
            throw new MusicBrainzUnavailableException(MusicBrainzFailure.UpstreamUnavailable, upstreamRetryAfter, ex);
        }
    }
}
