using Microsoft.AspNetCore.Http.HttpResults;
using Nodeable.Infrastructure.MusicBrainz;

namespace Nodeable.Api.Endpoints;

/// <summary>The one place a failed request-path call to MusicBrainz becomes a Problem Details response (decision 0018).</summary>
internal static class MusicBrainzProblems
{
    public static ProblemHttpResult From(MusicBrainzUnavailableException exception)
    {
        var retryAfterSeconds = Math.Max(1, (int)Math.Ceiling(exception.RetryAfter.TotalSeconds));
        var extensions = new Dictionary<string, object?> { ["retryAfterSeconds"] = retryAfterSeconds };

        return exception.Failure switch
        {
            MusicBrainzFailure.RateLimited => TypedResults.Problem(
                type: ProblemTypes.RateLimited,
                title: "MusicBrainz is busy",
                detail: "MusicBrainz allows one request per second and other requests are using it. Try again in a moment.",
                statusCode: StatusCodes.Status429TooManyRequests,
                extensions: extensions),
            MusicBrainzFailure.UpstreamUnavailable => TypedResults.Problem(
                type: ProblemTypes.UpstreamUnavailable,
                title: "MusicBrainz is not answering",
                detail: "MusicBrainz is busy or did not answer in time. Try again in a few seconds.",
                statusCode: StatusCodes.Status503ServiceUnavailable,
                extensions: extensions),
            _ => TypedResults.Problem(
                type: ProblemTypes.UpstreamError,
                title: "MusicBrainz could not answer the request",
                detail: "MusicBrainz refused the request.",
                statusCode: StatusCodes.Status502BadGateway,
                extensions: extensions),
        };
    }
}
