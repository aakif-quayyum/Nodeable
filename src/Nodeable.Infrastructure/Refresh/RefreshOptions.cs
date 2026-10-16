using System.ComponentModel.DataAnnotations;

namespace Nodeable.Infrastructure.Refresh;

/// <summary>Settings for the 30-day cache refresh (NFR-REL-03, decision 0028), bound from the "Refresh" configuration section.</summary>
public sealed class RefreshOptions
{
    public const string SectionName = "Refresh";

    /// <summary>A stored recording, work or release older than this is fetched again (NFR-REL-03).</summary>
    public TimeSpan MaxAge { get; set; } = TimeSpan.FromDays(30);

    /// <summary>
    /// How many rows one run queues at most. The job runs every hour, so the default is at most 480 refetches a day,
    /// far above what a cache of a few hundred songs needs and far below what the shared rate gate could carry.
    /// </summary>
    [Range(1, 1000)]
    public int BatchPerRun { get; set; } = 20;

    /// <summary>
    /// Each queued refetch waits a random time up to this long, so a run never sends its whole batch at once (MusicBrainz
    /// asks for background work to be spread, spec section 10). Under one hour, so runs do not pile up.
    /// </summary>
    public TimeSpan MaxDelay { get; set; } = TimeSpan.FromMinutes(50);

    /// <summary>
    /// Recordings stored before this moment and holding no ISRC are refreshed even when they are younger than
    /// <see cref="MaxAge"/>: the ISRC was first stored on 2026-10-14 (decision 0025), and the refetch fills it in and
    /// queues the preview lookup it makes possible. Null turns the backfill off.
    /// </summary>
    public DateTimeOffset? IsrcBackfillBefore { get; set; } = new DateTimeOffset(2026, 10, 14, 0, 0, 0, TimeSpan.Zero);

    /// <summary>When the selection runs, as a cron expression (UTC). Hourly, at an odd minute so it is not on the hour.</summary>
    [Required]
    public string Cron { get; set; } = "7 * * * *";
}
