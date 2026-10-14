using System.ComponentModel.DataAnnotations;

namespace Nodeable.Infrastructure.Deezer;

/// <summary>
/// Settings for the Deezer client, bound from the "Deezer" configuration section. Deezer needs no key and no
/// registration (spec section 10), so every value has a default.
/// </summary>
public sealed class DeezerOptions
{
    public const string SectionName = "Deezer";

    [Required, Url]
    public string BaseUrl { get; set; } = "https://api.deezer.com/";

    /// <summary>
    /// The minimum time between two requests across all instances. Deezer documents a limit of 50 requests every
    /// 5 seconds (not re-verified here); 200 ms is 25 in 5 seconds, which keeps half the allowance for other callers.
    /// </summary>
    public TimeSpan MinRequestInterval { get; set; } = TimeSpan.FromMilliseconds(200);

    [Range(1, 50)]
    public int Burst { get; set; } = 5;

    /// <summary>
    /// The longest a request may queue for the gate. It is under <see cref="AttemptTimeout"/>, which includes the wait, so
    /// a saturated gate is reported as such instead of as a timeout.
    /// </summary>
    public TimeSpan MaxGateWait { get; set; } = TimeSpan.FromSeconds(5);

    [Range(0, 5)]
    public int MaxRetries { get; set; } = 2;

    public TimeSpan RetryBaseDelay { get; set; } = TimeSpan.FromSeconds(1);

    public TimeSpan AttemptTimeout { get; set; } = TimeSpan.FromSeconds(10);

    public TimeSpan TotalTimeout { get; set; } = TimeSpan.FromSeconds(40);
}
