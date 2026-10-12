namespace Nodeable.Api.Endpoints;

/// <summary>
/// The stable <c>type</c> of each Problem Details error (RFC 9457, spec section 9). A client switches on this value,
/// never on the human-readable title, so the wording can change without breaking anyone.
/// </summary>
public static class ProblemTypes
{
    public const string InvalidSearch = "/errors/invalid-search";

    /// <summary>The caller is over its per-IP limit, or the shared MusicBrainz gate has no slot for a search.</summary>
    public const string RateLimited = "/errors/rate-limited";

    public const string UpstreamUnavailable = "/errors/upstream-unavailable";

    public const string UpstreamError = "/errors/upstream-error";
}
