namespace Nodeable.Domain.Enums;

/// <summary>
/// Which external fetch a job performs (spec section 10, "MusicBrainz fetch plan per song").
/// Artist is the person-drawer fetch (step 5), which the spec's list of four kinds omits.
/// </summary>
public enum CrawlJobKind
{
    Recording,
    Work,
    Release,
    Preview,
    Artist,
}
