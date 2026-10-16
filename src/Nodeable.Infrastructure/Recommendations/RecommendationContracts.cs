using Nodeable.Domain.Enums;

namespace Nodeable.Infrastructure.Recommendations;

// The shapes the Api returns for recommendations (spec section 9, FR-REC-01, FR-REC-02). Plain records, so the same type
// is the JSON contract, the OpenAPI schema and the generated TypeScript type.

/// <summary>A hub of the graph who is also credited on a recommended song, and what they did on it.</summary>
public sealed record RecommendationHub(Guid Mbid, string Name, int GraphSongs, IReadOnlyList<CreditRole> Roles);

/// <summary>
/// A stored song that is not in the graph yet but is credited to people the graph keeps returning to. <c>HubCount</c> and
/// <c>SharedSongs</c> are the two numbers the order is built from (FR-REC-01); <c>Reason</c> says them in words (FR-REC-02).
/// </summary>
public sealed record RecommendationItem(
    Guid Mbid,
    string Title,
    string Artist,
    int? Year,
    int HubCount,
    int SharedSongs,
    string Reason,
    IReadOnlyList<RecommendationHub> Hubs);

public sealed record RecommendationsResponse(IReadOnlyList<RecommendationItem> Items);
