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

    /// <summary>The graph id is unknown (404).</summary>
    public const string GraphNotFound = "/errors/graph-not-found";

    /// <summary>The <c>X-Graph-Token</c> header is missing, or is not this graph's token (401).</summary>
    public const string InvalidGraphToken = "/errors/invalid-graph-token";

    /// <summary>The graph already holds the most songs it may (409, FR-GRAPH-01).</summary>
    public const string GraphFull = "/errors/graph-full";

    /// <summary>MusicBrainz has no recording with the MBID that was sent (404).</summary>
    public const string RecordingNotFound = "/errors/recording-not-found";

    public const string InvalidRequest = "/errors/invalid-request";

    /// <summary>Nodeable has no stored person with that MBID (404, FR-PERSON-01).</summary>
    public const string PersonNotFound = "/errors/person-not-found";

    /// <summary>The recording has no Deezer preview (404, FR-PREVIEW-01).</summary>
    public const string PreviewNotFound = "/errors/preview-not-found";

    /// <summary>The recording has a preview already, so there is nothing to pick (409, FR-PREVIEW-01).</summary>
    public const string PreviewAlreadyExists = "/errors/preview-already-exists";

    /// <summary>The track is not among the results offered for the recording (422, FR-PREVIEW-01).</summary>
    public const string PreviewNotOffered = "/errors/preview-not-offered";
}
