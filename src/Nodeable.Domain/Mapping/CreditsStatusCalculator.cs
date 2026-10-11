using Nodeable.Domain.Enums;

namespace Nodeable.Domain.Mapping;

/// <summary>
/// Works out <c>recordings.credits_status</c> from the roles credited on a recording at any level (recording, work or
/// release). It is recomputed after every fetch step, so the status rises as work and release credits arrive.
/// </summary>
public static class CreditsStatusCalculator
{
    /// <summary>
    /// <see cref="CreditsStatus.Complete"/> when both a producer and a songwriter are credited (the pair FR-GRAPH-04
    /// looks for); <see cref="CreditsStatus.Partial"/> when something is credited but not both; otherwise
    /// <see cref="CreditsStatus.None"/>. Everything else, such as engineers and instruments, makes a song partial
    /// without making it complete: it is something to show, but the song may still be missing its producer or writer.
    /// </summary>
    public static CreditsStatus Calculate(IEnumerable<CreditRole> rolesCredited)
    {
        var hasProducer = false;
        var hasSongwriter = false;
        var hasAny = false;

        foreach (var role in rolesCredited)
        {
            hasAny = true;
            hasProducer |= role == CreditRole.Producer;
            hasSongwriter |= role == CreditRole.Songwriter;
        }

        if (hasProducer && hasSongwriter)
        {
            return CreditsStatus.Complete;
        }

        return hasAny ? CreditsStatus.Partial : CreditsStatus.None;
    }
}
