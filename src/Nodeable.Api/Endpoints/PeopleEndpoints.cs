using Microsoft.AspNetCore.Http.HttpResults;
using Nodeable.Api.RateLimiting;
using Nodeable.Infrastructure.People;

namespace Nodeable.Api.Endpoints;

/// <summary>The person drawer's two reads (FR-PERSON-01, spec section 9). Both come from the cache: no external request.</summary>
public static class PeopleEndpoints
{
    /// <summary>The page size used when none is asked for, and the largest one allowed.</summary>
    public const int DefaultPageSize = 20;

    public const int MaxPageSize = 50;

    public static IEndpointRouteBuilder MapPeopleEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/v1/people/{mbid:guid}", GetPerson)
            .RequireRateLimiting(ApiRateLimiting.PeoplePolicy)
            .WithName("GetPerson")
            .WithSummary("A person's role summary and the years of their stored recordings (FR-PERSON-01).")
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status429TooManyRequests);

        app.MapGet("/api/v1/people/{mbid:guid}/recordings", GetRecordings)
            .RequireRateLimiting(ApiRateLimiting.PeoplePolicy)
            .WithName("GetPersonRecordings")
            .WithSummary("A page of the stored recordings a person is credited on, newest first (FR-PERSON-01).")
            .ProducesProblem(StatusCodes.Status400BadRequest)
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status429TooManyRequests);

        return app;
    }

    private static async Task<Results<Ok<PersonProfile>, ProblemHttpResult>> GetPerson(
        Guid mbid, PersonReadModel people, CancellationToken cancellationToken)
    {
        var profile = await people.GetProfileAsync(mbid, cancellationToken);
        return profile is null ? NotFound() : TypedResults.Ok(profile);
    }

    private static async Task<Results<Ok<PersonRecordingsPage>, ProblemHttpResult>> GetRecordings(
        Guid mbid, PersonReadModel people, CancellationToken cancellationToken, int page = 1, int pageSize = DefaultPageSize)
    {
        if (page < 1 || pageSize < 1 || pageSize > MaxPageSize)
        {
            return TypedResults.Problem(
                type: ProblemTypes.InvalidRequest,
                title: "Invalid page",
                detail: $"page must be 1 or more and pageSize between 1 and {MaxPageSize}.",
                statusCode: StatusCodes.Status400BadRequest);
        }

        var result = await people.GetRecordingsAsync(mbid, page, pageSize, cancellationToken);
        return result is null ? NotFound() : TypedResults.Ok(result);
    }

    private static ProblemHttpResult NotFound() =>
        TypedResults.Problem(
            type: ProblemTypes.PersonNotFound,
            title: "Unknown person",
            detail: "Nodeable has not stored that person yet; they appear once a song they are credited on has been added.",
            statusCode: StatusCodes.Status404NotFound);
}
