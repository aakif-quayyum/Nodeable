using Nodeable.Domain.Entities;
using Nodeable.Infrastructure.Crawling;

namespace Nodeable.Infrastructure.Graphs;

/// <summary>
/// The Worker's observer (spec section 7, step 6): when a job ends, find the recordings it concerns and tell the
/// graphs that hold them. A recording job concerns its recording; a work or release job concerns every recording
/// linked to it, because a credit found on a work is a credit of each of them.
/// </summary>
public sealed class GraphJobObserver(GraphReadModel read, GraphEventNotifier notifier) : ICrawlJobObserver
{
    public async Task OnJobDoneAsync(CrawlJob job, CancellationToken cancellationToken)
    {
        var recordings = await read.GetRecordingsAffectedByAsync(job.Kind, job.TargetMbid, cancellationToken);
        await notifier.NotifyCreditsChangedAsync(recordings, onlyGraph: null, cancellationToken);
    }

    public async Task OnJobFailedAsync(CrawlJob job, CancellationToken cancellationToken)
    {
        var recordings = await read.GetRecordingsAffectedByAsync(job.Kind, job.TargetMbid, cancellationToken);

        // The reason is written for the person, not copied from the exception, which can hold internal details.
        var reason = $"The {job.Kind.ToString().ToLowerInvariant()} details for this song could not be fetched from MusicBrainz.";
        await notifier.NotifyFailedAsync(recordings, reason, cancellationToken);
    }
}
