using System.Diagnostics;
using System.Globalization;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Nodeable.Api.RateLimiting;
using Nodeable.Infrastructure.Graphs;
using Nodeable.Infrastructure.MusicBrainz;

namespace Nodeable.Api.Endpoints;

/// <summary>The body of <c>POST /api/v1/graphs</c>; both the body and the name are optional.</summary>
public sealed record CreateGraphRequest(string? Name);

/// <summary>
/// A new graph. <c>AnonToken</c> is shown once, here: the server keeps only its hash (decision 0007), so a lost token
/// cannot be recovered. The browser keeps it and sends it in the <c>X-Graph-Token</c> header.
/// </summary>
public sealed record CreateGraphResponse(Guid Id, string Name, string AnonToken);

public sealed record AddSongRequest(Guid RecordingMbid);

/// <summary>
/// The song node and how much is left to fetch (spec section 9). <c>PendingJobs</c> is the fetches outstanding for
/// the song, never "n of 4": the Worker queues the work and release fetches after it has read the recording
/// (decision 0009), so the total is not known up front.
/// </summary>
public sealed record AddSongResponse(GraphSongItem Song, int PendingJobs);

public static class GraphEndpoints
{
    public const string TokenHeader = "X-Graph-Token";

    public static IEndpointRouteBuilder MapGraphEndpoints(this IEndpointRouteBuilder app)
    {
        var graphs = app.MapGroup("/api/v1/graphs");

        graphs.MapPost("/", CreateGraph)
            .WithName("CreateGraph")
            .WithSummary("Create an anonymous graph and return its token once (FR-GRAPH-01).");

        graphs.MapGet("/{id:guid}", GetGraph)
            .WithName("GetGraph")
            .WithSummary("The graph with its songs, people, credits, hubs and crawl progress (FR-GRAPH-01, FR-HUB-01).")
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .ProducesProblem(StatusCodes.Status404NotFound);

        graphs.MapPost("/{id:guid}/songs", AddSong)
            .RequireRateLimiting(ApiRateLimiting.SongAdditionPolicy)
            .WithName("AddSong")
            .WithSummary("Add a recording by MBID; 202 with the song node while its credits are fetched (FR-GRAPH-02).")
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict)
            .ProducesProblem(StatusCodes.Status429TooManyRequests)
            .ProducesProblem(StatusCodes.Status502BadGateway)
            .ProducesProblem(StatusCodes.Status503ServiceUnavailable);

        graphs.MapDelete("/{id:guid}/songs/{mbid:guid}", RemoveSong)
            .WithName("RemoveSong")
            .WithSummary("Remove a song from a graph (FR-GRAPH-01).")
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .ProducesProblem(StatusCodes.Status404NotFound);

        return app;
    }

    private static async Task<Created<CreateGraphResponse>> CreateGraph(
        [FromBody] CreateGraphRequest? request, GraphService service, CancellationToken cancellationToken)
    {
        var created = await service.CreateAsync(request?.Name, cancellationToken);
        Activity.Current?.SetTag("graph.id", created.Id);

        return TypedResults.Created(
            $"/api/v1/graphs/{created.Id}",
            new CreateGraphResponse(created.Id, created.Name, created.AnonToken));
    }

    private static async Task<Results<Ok<GraphSnapshot>, ProblemHttpResult>> GetGraph(
        Guid id,
        [FromHeader(Name = TokenHeader)] string? token,
        IGraphAccess access,
        GraphService service,
        CancellationToken cancellationToken)
    {
        Activity.Current?.SetTag("graph.id", id);

        if (await Deny(access, id, token, cancellationToken) is { } denied)
        {
            return denied;
        }

        var snapshot = await service.GetSnapshotAsync(id, cancellationToken);
        return snapshot is null ? NotFound(id) : TypedResults.Ok(snapshot);
    }

    private static async Task<Results<Accepted<AddSongResponse>, Ok<AddSongResponse>, ProblemHttpResult>> AddSong(
        Guid id,
        [FromHeader(Name = TokenHeader)] string? token,
        AddSongRequest request,
        HttpContext http,
        IGraphAccess access,
        GraphService service,
        CancellationToken cancellationToken)
    {
        Activity.Current?.SetTag("graph.id", id);
        Activity.Current?.SetTag("recording.mbid", request.RecordingMbid);

        if (await Deny(access, id, token, cancellationToken) is { } denied)
        {
            return denied;
        }

        if (request.RecordingMbid == Guid.Empty)
        {
            return TypedResults.Problem(
                type: ProblemTypes.InvalidRequest,
                title: "The request needs a recording",
                detail: "Send the MusicBrainz ID of the recording in recordingMbid.",
                statusCode: StatusCodes.Status400BadRequest);
        }

        AddSongResult result;
        try
        {
            result = await service.AddSongAsync(id, request.RecordingMbid, cancellationToken);
        }
        catch (MusicBrainzUnavailableException ex)
        {
            http.Response.Headers.RetryAfter = RetryAfterSeconds(ex).ToString(CultureInfo.InvariantCulture);
            return MusicBrainzProblems.From(ex);
        }

        return result.Status switch
        {
            AddSongStatus.GraphFull => TypedResults.Problem(
                type: ProblemTypes.GraphFull,
                title: "The graph is full",
                detail: "A graph holds at most 50 songs. Remove one to add another.",
                statusCode: StatusCodes.Status409Conflict),
            AddSongStatus.RecordingNotFound => TypedResults.Problem(
                type: ProblemTypes.RecordingNotFound,
                title: "No such recording",
                detail: "MusicBrainz has no recording with that ID.",
                statusCode: StatusCodes.Status404NotFound),

            // Already there, or its credits were cached: nothing is being fetched, so 200 and not 202.
            AddSongStatus.AlreadyInGraph => TypedResults.Ok(new AddSongResponse(result.Song!, result.PendingJobs)),
            _ when result.PendingJobs == 0 => TypedResults.Ok(new AddSongResponse(result.Song!, 0)),
            _ => TypedResults.Accepted(
                $"/api/v1/graphs/{id}",
                new AddSongResponse(result.Song!, result.PendingJobs)),
        };
    }

    private static async Task<Results<NoContent, ProblemHttpResult>> RemoveSong(
        Guid id,
        Guid mbid,
        [FromHeader(Name = TokenHeader)] string? token,
        IGraphAccess access,
        GraphService service,
        CancellationToken cancellationToken)
    {
        Activity.Current?.SetTag("graph.id", id);
        Activity.Current?.SetTag("recording.mbid", mbid);

        if (await Deny(access, id, token, cancellationToken) is { } denied)
        {
            return denied;
        }

        return await service.RemoveSongAsync(id, mbid, cancellationToken)
            ? TypedResults.NoContent()
            : TypedResults.Problem(
                type: ProblemTypes.GraphNotFound,
                title: "The song is not in this graph",
                detail: "That recording is not one of this graph's songs.",
                statusCode: StatusCodes.Status404NotFound);
    }

    private static async Task<ProblemHttpResult?> Deny(IGraphAccess access, Guid id, string? token, CancellationToken cancellationToken) =>
        await access.CheckAsync(id, token, cancellationToken) switch
        {
            GraphAccessResult.NotFound => NotFound(id),
            GraphAccessResult.InvalidToken => TypedResults.Problem(
                type: ProblemTypes.InvalidGraphToken,
                title: "The graph token is missing or not valid",
                detail: $"Send this graph's token in the {TokenHeader} header.",
                statusCode: StatusCodes.Status401Unauthorized),
            _ => null,
        };

    private static ProblemHttpResult NotFound(Guid id) => TypedResults.Problem(
        type: ProblemTypes.GraphNotFound,
        title: "No such graph",
        detail: $"There is no graph with the id {id}.",
        statusCode: StatusCodes.Status404NotFound);

    private static int RetryAfterSeconds(MusicBrainzUnavailableException ex) =>
        Math.Max(1, (int)Math.Ceiling(ex.RetryAfter.TotalSeconds));
}
