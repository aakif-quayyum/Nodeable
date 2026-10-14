using System.Globalization;
using Microsoft.AspNetCore.Http.HttpResults;
using Nodeable.Api.RateLimiting;
using Nodeable.Infrastructure.Deezer;

namespace Nodeable.Api.Endpoints;

/// <summary>A preview address for the browser to fetch and play. It is short-lived: do not store it.</summary>
/// <param name="Url">The signed URL of the 30-second preview (Deezer's audio host sends CORS headers, decision 0022).</param>
/// <param name="ExpiresAt">When the signature runs out, or null when the URL does not say.</param>
public sealed record PreviewResponse(string Url, DateTimeOffset? ExpiresAt);

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

        return app;
    }

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
