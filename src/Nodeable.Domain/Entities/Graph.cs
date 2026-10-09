namespace Nodeable.Domain.Entities;

/// <summary>A user's set of songs (spec section 8, <c>graphs</c>).</summary>
public class Graph
{
    public required Guid Id { get; init; }

    /// <summary>The signed-in owner. Null for anonymous graphs; the foreign key to the user table arrives with Identity in v2.</summary>
    public Guid? OwnerId { get; set; }

    /// <summary>
    /// SHA-256 hash of the anonymous token, never the token itself. The token is a bearer credential,
    /// so a database leak must not reveal usable tokens (spec change recorded in the decision log).
    /// </summary>
    public string? AnonTokenHash { get; set; }

    public required string Name { get; set; }

    public bool IsPublic { get; set; }

    public string? ShareSlug { get; set; }
}
