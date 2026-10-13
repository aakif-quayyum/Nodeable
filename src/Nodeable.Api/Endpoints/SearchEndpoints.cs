using System.Globalization;
using Microsoft.AspNetCore.Http.HttpResults;
using Nodeable.Api.RateLimiting;
using Nodeable.Domain.Enums;
using Nodeable.Domain.Search;
using Nodeable.Infrastructure.MusicBrainz;
using Nodeable.Infrastructure.Search;

namespace Nodeable.Api.Endpoints;

public static class SearchEndpoints
{
    /// <summary>The shortest query worth a MusicBrainz request: one letter matches half the catalogue.</summary>
    internal const int MinQueryLength = 2;

    /// <summary>A song title or artist name is never longer; it also bounds what is put into the search syntax.</summary>
    internal const int MaxQueryLength = 200;

    public static IEndpointRouteBuilder MapSearchEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/v1/search/recordings", SearchRecordings)
            .RequireRateLimiting(ApiRateLimiting.SearchPolicy)
            .WithName("SearchRecordings")
            .WithSummary("Search recordings by title and optional artist, cache first, then MusicBrainz (FR-SEARCH-01, FR-SEARCH-02).")
            .ProducesProblem(StatusCodes.Status400BadRequest)
            .ProducesProblem(StatusCodes.Status429TooManyRequests)
            .ProducesProblem(StatusCodes.Status502BadGateway)
            .ProducesProblem(StatusCodes.Status503ServiceUnavailable);

        return app;
    }

    // LEARN: LG-03 typed-results-union | Returning Results<Ok<T>, ProblemHttpResult> lists every response the handler can produce in its signature: the compiler rejects any other return, and the same list feeds the OpenAPI document, so the contract cannot drift from the code the way res.status(...).json(...) can in Express
    private static async Task<Results<Ok<SearchResponse>, ProblemHttpResult>> SearchRecordings(
        string? q,
        string? artist,
        HttpContext http,
        IRecordingSearchService search,
        CancellationToken cancellationToken)
    {
        var title = q?.Trim();
        var artistName = string.IsNullOrWhiteSpace(artist) ? null : artist.Trim();

        if (title is null || title.Length < MinQueryLength)
        {
            return TypedResults.Problem(
                type: ProblemTypes.InvalidSearch,
                title: "The search needs a song title",
                detail: $"Give the title of a song in q, at least {MinQueryLength} characters.",
                statusCode: StatusCodes.Status400BadRequest);
        }

        if (title.Length > MaxQueryLength || artistName?.Length > MaxQueryLength)
        {
            return TypedResults.Problem(
                type: ProblemTypes.InvalidSearch,
                title: "The search is too long",
                detail: $"The title and the artist can each be at most {MaxQueryLength} characters.",
                statusCode: StatusCodes.Status400BadRequest);
        }

        try
        {
            var outcome = await search.SearchAsync(title, artistName, cancellationToken);
            return TypedResults.Ok(ToResponse(outcome));
        }
        catch (MusicBrainzUnavailableException ex)
        {
            http.Response.Headers.RetryAfter = Math.Max(1, (int)Math.Ceiling(ex.RetryAfter.TotalSeconds))
                .ToString(CultureInfo.InvariantCulture);
            return MusicBrainzProblems.From(ex);
        }
    }

    private static SearchResponse ToResponse(SearchOutcome outcome)
    {
        CreditsStatus? StatusOf(Guid mbid) =>
            outcome.CachedStatuses.TryGetValue(mbid, out var status) ? status : null;

        var results = outcome.Groups.Select(group => new SearchResultItem(
            group.Primary.Mbid,
            group.Primary.Title,
            group.Primary.Artist,
            group.Primary.FirstReleaseTitle,
            group.Primary.FirstReleaseDate?.Date.Year,
            group.Primary.Score,
            StatusOf(group.Primary.Mbid),
            group.Versions.Select(version => ToVersion(version, StatusOf(version.Candidate.Mbid))).ToList(),
            group.Primary.Cover.ReleaseMbid,
            group.Primary.Cover.ReleaseGroupMbid));

        return new SearchResponse(outcome.Source, results.ToList());
    }

    private static SearchVersionItem ToVersion(SearchVersion version, CreditsStatus? status) => new(
        version.Candidate.Mbid,
        version.Candidate.Title,
        version.Candidate.Artist,
        version.Candidate.FirstReleaseTitle,
        version.Candidate.FirstReleaseDate?.Date.Year,
        version.Candidate.Score,
        version.Kind,
        version.Candidate.Disambiguation,
        status,
        version.Candidate.Cover.ReleaseMbid,
        version.Candidate.Cover.ReleaseGroupMbid);
}
