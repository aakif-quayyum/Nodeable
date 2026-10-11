using System.ComponentModel.DataAnnotations;

namespace Nodeable.Infrastructure.Crawling;

/// <summary>Settings for the crawl queue and its consumer, bound from the "Crawl" configuration section.</summary>
public sealed class CrawlOptions
{
    public const string SectionName = "Crawl";

    /// <summary>How long a worker waits before asking again when the queue is empty.</summary>
    public TimeSpan PollInterval { get; set; } = TimeSpan.FromSeconds(1);

    /// <summary>
    /// A job that has been "running" longer than this belongs to a worker that died, and goes back to the queue. It has
    /// to be longer than the longest a single job can take: the MusicBrainz call's own total timeout is 5 minutes.
    /// </summary>
    public TimeSpan LockTimeout { get; set; } = TimeSpan.FromMinutes(10);

    /// <summary>How often each worker looks for jobs abandoned by a dead worker.</summary>
    public TimeSpan StaleCheckInterval { get; set; } = TimeSpan.FromMinutes(1);

    /// <summary>How long a worker pauses after an unexpected error, such as the database being unreachable, before trying again.</summary>
    public TimeSpan ErrorDelay { get; set; } = TimeSpan.FromSeconds(5);

    /// <summary>Attempts, counting the first, before a job is marked failed.</summary>
    [Range(1, 20)]
    public int MaxAttempts { get; set; } = 5;

    public TimeSpan RetryBaseDelay { get; set; } = TimeSpan.FromSeconds(30);

    public TimeSpan RetryMaxDelay { get; set; } = TimeSpan.FromMinutes(15);
}
