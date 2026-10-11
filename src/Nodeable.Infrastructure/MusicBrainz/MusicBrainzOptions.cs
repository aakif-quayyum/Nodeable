using System.ComponentModel.DataAnnotations;

namespace Nodeable.Infrastructure.MusicBrainz;

/// <summary>
/// Settings for the MusicBrainz client, bound from the "MusicBrainz" configuration section. Every value that spec
/// section 10 or NFR-RATE-01/03 fixes has a default here; <see cref="ContactUrl"/> has none on purpose, so the app
/// cannot start and send MusicBrainz requests without saying who is calling.
/// </summary>
public sealed class MusicBrainzOptions
{
    public const string SectionName = "MusicBrainz";

    [Required, Url]
    public string BaseUrl { get; set; } = "https://musicbrainz.org/ws/2/";

    /// <summary>
    /// Where MusicBrainz can find out who is calling: part of the required User-Agent
    /// (<c>Nodeable/{version} ( {contact} )</c>). A repository URL is enough; it can be changed in configuration.
    /// </summary>
    [Required, Url]
    public string ContactUrl { get; set; } = string.Empty;

    /// <summary>NFR-RATE-01: the minimum time between two MusicBrainz requests across all instances.</summary>
    public TimeSpan MinRequestInterval { get; set; } = TimeSpan.FromSeconds(1);

    /// <summary>Requests allowed back to back after a quiet period. 1 means strictly one per interval.</summary>
    [Range(1, 100)]
    public int Burst { get; set; } = 1;

    /// <summary>
    /// The longest a request may queue for the rate gate. Past this the request fails with
    /// <see cref="RateLimiting.RateGateSaturatedException"/> and the job queue retries it later, instead of the
    /// caller waiting without a limit.
    /// </summary>
    public TimeSpan MaxGateWait { get; set; } = TimeSpan.FromSeconds(20);

    /// <summary>NFR-RATE-03: retries after a 503 or 429.</summary>
    [Range(0, 10)]
    public int MaxRetries { get; set; } = 5;

    /// <summary>First retry delay; each further retry doubles it, with jitter.</summary>
    public TimeSpan RetryBaseDelay { get; set; } = TimeSpan.FromSeconds(2);

    /// <summary>One attempt, including the time spent waiting for the rate gate.</summary>
    public TimeSpan AttemptTimeout { get; set; } = TimeSpan.FromSeconds(30);

    /// <summary>One call, including every retry and backoff.</summary>
    public TimeSpan TotalTimeout { get; set; } = TimeSpan.FromMinutes(5);
}
