namespace Nodeable.Infrastructure.Crawling;

/// <summary>
/// Thrown by a handler when the job cannot succeed however often it is retried, for example MusicBrainz has no entity
/// with the MBID. The runner marks the job failed at once instead of spending its remaining attempts.
/// </summary>
public sealed class CrawlJobPermanentFailureException : Exception
{
    public CrawlJobPermanentFailureException(string message)
        : base(message)
    {
    }
}
