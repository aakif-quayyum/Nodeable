using System.Diagnostics;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Nodeable.Api.RateLimiting;
using Nodeable.Infrastructure.Graphs;
using Nodeable.Infrastructure.Recommendations;

namespace Nodeable.Api.Endpoints;

/// <summary>Songs the graph does not hold yet but its hubs are credited on (FR-REC-01, FR-REC-02). Cache only: no external request.</summary>
public static class RecommendationEndpoints
{
    public const int DefaultLimit = 20;

    public const int MaxLimit = 50;

    public static IEndpointRouteBuilder MapRecommendationEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/v1/graphs/{id:guid}/recommendations", GetRecommendations)
            .RequireRateLimiting(ApiRateLimiting.RecommendationPolicy)
            .WithName("GetRecommendations")
            .WithSummary("Ranked recommendations with reasons, from the stored credits only (FR-REC-01, FR-REC-02).")
            .ProducesProblem(StatusCodes.Status400BadRequest)
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status429TooManyRequests);

        return app;
    }

    private static async Task<Results<Ok<RecommendationsResponse>, ProblemHttpResult>> GetRecommendations(
        Guid id,
        [FromHeader(Name = GraphEndpoints.TokenHeader)] string? token,
        IGraphAccess access,
        RecommendationReadModel recommendations,
        CancellationToken cancellationToken,
        int limit = DefaultLimit)
    {
        Activity.Current?.SetTag("graph.id", id);

        if (limit < 1 || limit > MaxLimit)
        {
            return TypedResults.Problem(
                type: ProblemTypes.InvalidRequest,
                title: "Invalid limit",
                detail: $"limit must be between 1 and {MaxLimit}.",
                statusCode: StatusCodes.Status400BadRequest);
        }

        switch (await access.CheckAsync(id, token, cancellationToken))
        {
            case GraphAccessResult.NotFound:
                return TypedResults.Problem(
                    type: ProblemTypes.GraphNotFound,
                    title: "No such graph",
                    detail: $"There is no graph with the id {id}.",
                    statusCode: StatusCodes.Status404NotFound);
            case GraphAccessResult.InvalidToken:
                return TypedResults.Problem(
                    type: ProblemTypes.InvalidGraphToken,
                    title: "The graph token is missing or not valid",
                    detail: $"Send this graph's token in the {GraphEndpoints.TokenHeader} header.",
                    statusCode: StatusCodes.Status401Unauthorized);
        }

        return TypedResults.Ok(new RecommendationsResponse(await recommendations.GetAsync(id, limit, cancellationToken)));
    }
}
