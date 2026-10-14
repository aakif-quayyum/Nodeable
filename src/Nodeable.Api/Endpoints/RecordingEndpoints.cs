using System.Globalization;
using Microsoft.AspNetCore.Http.HttpResults;
using Nodeable.Api.RateLimiting;
using Nodeable.Infrastructure.Deezer;
using Nodeable.Infrastructure.Graphs;

namespace Nodeable.Api.Endpoints;

/// <summary>A preview address for the browser to fetch and play. It is short-lived: do not store it.</summary>
/// <param name="Url">The signed URL of the 30-second preview (Deezer's audio host sends CORS headers, decision 0022).</param>
/// <param name="ExpiresAt">When the signature runs out, or null when the URL does not say.</param>
public sealed record PreviewResponse(string Url, DateTimeOffset? ExpiresAt);

/// <summary>One of Deezer's results offered when a recording has no confident match (FR-PREVIEW-01, decision 0026).</summary>
/// <param name="TrackId">Deezer's track ID; it is what a pick sends back.</param>
/// <param name="DurationSeconds">The length of the whole track, not of the preview.</param>
/// <param name="CoverMd5">Deezer's album image ID, from which the page builds the cover address.</param>
public sealed record PreviewCandidateItem(string TrackId, string Title, string Artist, string? Album, int? DurationSeconds, string? CoverMd5);

public sealed record PreviewCandidatesResponse(IReadOnlyList<PreviewCandidateItem> Candidates);

/// <summary>The track a person chose. Only the ID is accepted: the Api looks the rest up itself.</summary>
public sealed record PickPreviewRequest(string TrackId);

public sealed record PickPreviewResponse(bool HasPreview, string? DeezerCoverMd5);

public static class RecordingEndpoints
{
    public static IEndpointRouteBuilder MapRecordingEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/v1/recordings/{mbid:guid}/preview", GetPreview)
            .RequireRateLimiting(ApiRateLimiting.PreviewPolicy)
            .WithName("GetRecordingPreview")
            .WithSummary("A fresh, short-lived address for a recording's 30-second Deezer preview, or 404 (FR-PREVIEW-01).")
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status429TooManyRequests)
            .ProducesProblem(StatusCodes.Status503ServiceUnavailable);

        app.MapGet("/api/v1/recordings/{mbid:guid}/preview/candidates", GetCandidates)
            .RequireRateLimiting(ApiRateLimiting.PreviewPickPolicy)
            .WithName("GetPreviewCandidates")
            .WithSummary("The first Deezer results for a recording, for choosing the right version (FR-PREVIEW-01).")
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status429TooManyRequests)
            .ProducesProblem(StatusCodes.Status503ServiceUnavailable);

        app.MapPost("/api/v1/recordings/{mbid:guid}/preview/pick", PickPreview)
            .RequireRateLimiting(ApiRateLimiting.PreviewPickPolicy)
            .WithName("PickRecordingPreview")
            .WithSummary("Stores a person's choice of Deezer track for a recording that has no preview (FR-PREVIEW-01).")
            .ProducesProblem(StatusCodes.Status400BadRequest)
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict)
            .ProducesProblem(StatusCodes.Status422UnprocessableEntity)
            .ProducesProblem(StatusCodes.Status429TooManyRequests)
            .ProducesProblem(StatusCodes.Status503ServiceUnavailable);

        return app;
    }

    private static ProblemHttpResult DeezerUnavailable(HttpContext http)
    {
        http.Response.Headers.RetryAfter = "5";
        return TypedResults.Problem(
            type: ProblemTypes.UpstreamUnavailable,
            title: "Previews are unavailable right now",
            detail: "Deezer did not answer. Try again in a few seconds.",
            statusCode: StatusCodes.Status503ServiceUnavailable);
    }

    private static async Task<Results<Ok<PreviewCandidatesResponse>, ProblemHttpResult>> GetCandidates(
        Guid mbid,
        HttpContext http,
        PreviewPickService picks,
        CancellationToken cancellationToken)
    {
        http.Response.Headers.CacheControl = "no-store";

        IReadOnlyList<PreviewCandidate>? candidates;
        try
        {
            candidates = await picks.GetCandidatesAsync(mbid, cancellationToken);
        }
        catch (Exception ex) when (IsDeezerFailure(ex))
        {
            return DeezerUnavailable(http);
        }

        if (candidates is null)
        {
            return TypedResults.Problem(
                type: ProblemTypes.RecordingNotFound,
                title: "Unknown recording",
                detail: "That recording is not stored here.",
                statusCode: StatusCodes.Status404NotFound);
        }

        return TypedResults.Ok(new PreviewCandidatesResponse(
            candidates.Select(c => new PreviewCandidateItem(c.TrackId, c.Title, c.Artist, c.Album, c.DurationSeconds, c.CoverMd5)).ToList()));
    }

    private static async Task<Results<Ok<PickPreviewResponse>, ProblemHttpResult>> PickPreview(
        Guid mbid,
        PickPreviewRequest request,
        HttpContext http,
        PreviewPickService picks,
        GraphEventNotifier notifier,
        CancellationToken cancellationToken)
    {
        // A Deezer track ID is digits. Anything else is refused before it reaches a query, a log or Deezer.
        if (string.IsNullOrEmpty(request.TrackId) || request.TrackId.Length > 20 || !request.TrackId.All(char.IsAsciiDigit))
        {
            return TypedResults.Problem(
                type: ProblemTypes.InvalidRequest,
                title: "Invalid track",
                detail: "trackId must be a Deezer track ID (digits only).",
                statusCode: StatusCodes.Status400BadRequest);
        }

        PickResult result;
        try
        {
            result = await picks.PickAsync(mbid, request.TrackId, cancellationToken);
        }
        catch (Exception ex) when (IsDeezerFailure(ex))
        {
            return DeezerUnavailable(http);
        }

        switch (result.Outcome)
        {
            case PickOutcome.RecordingNotFound:
                return TypedResults.Problem(
                    type: ProblemTypes.RecordingNotFound,
                    title: "Unknown recording",
                    detail: "That recording is not stored here.",
                    statusCode: StatusCodes.Status404NotFound);

            case PickOutcome.AlreadyHasPreview:
                return TypedResults.Problem(
                    type: ProblemTypes.PreviewAlreadyExists,
                    title: "This recording has a preview already",
                    detail: "Someone chose a version, or a refresh found one, a moment ago.",
                    statusCode: StatusCodes.Status409Conflict);

            case PickOutcome.NotACandidate:
                return TypedResults.Problem(
                    type: ProblemTypes.PreviewNotOffered,
                    title: "That track was not offered",
                    detail: "Only a track from the list of results can be chosen.",
                    statusCode: StatusCodes.Status422UnprocessableEntity);
        }

        // Every graph that holds the song learns of it now, so its player appears without a reload.
        await notifier.NotifyPreviewFoundAsync(mbid, cancellationToken);
        return TypedResults.Ok(new PickPreviewResponse(true, result.CoverMd5));
    }

    private static bool IsDeezerFailure(Exception ex) =>
        ex is DeezerException or HttpRequestException or Polly.Timeout.TimeoutRejectedException
            or Nodeable.Infrastructure.RateLimiting.RateGateSaturatedException;

    private static async Task<Results<Ok<PreviewResponse>, ProblemHttpResult>> GetPreview(
        Guid mbid,
        HttpContext http,
        PreviewLinkService previews,
        CancellationToken cancellationToken)
    {
        // The address is signed for one person's use and runs out in minutes: a shared cache must never keep it.
        http.Response.Headers.CacheControl = "no-store";

        PreviewLink? link;
        try
        {
            link = await previews.GetAsync(mbid, cancellationToken);
        }
        catch (Exception ex) when (ex is DeezerException or HttpRequestException or Polly.Timeout.TimeoutRejectedException
            or Nodeable.Infrastructure.RateLimiting.RateGateSaturatedException)
        {
            // A failure of Deezer or of the gate is not "this recording has no preview": the player may try again.
            http.Response.Headers.RetryAfter = "5";
            return TypedResults.Problem(
                type: ProblemTypes.UpstreamUnavailable,
                title: "Previews are unavailable right now",
                detail: "Deezer did not answer. Try again in a few seconds.",
                statusCode: StatusCodes.Status503ServiceUnavailable);
        }

        if (link is null)
        {
            return TypedResults.Problem(
                type: ProblemTypes.PreviewNotFound,
                title: "No preview for this recording",
                detail: "Deezer has no 30-second preview for this recording.",
                statusCode: StatusCodes.Status404NotFound);
        }

        return TypedResults.Ok(new PreviewResponse(link.Url, link.ExpiresAt));
    }
}
