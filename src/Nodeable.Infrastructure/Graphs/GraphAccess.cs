using Microsoft.EntityFrameworkCore;
using Nodeable.Domain.Graphs;
using Nodeable.Infrastructure.Persistence;

namespace Nodeable.Infrastructure.Graphs;

public enum GraphAccessResult
{
    Allowed,
    NotFound,
    InvalidToken,
}

/// <summary>Decides whether a request or a hub connection may use a graph (decision 0007).</summary>
public interface IGraphAccess
{
    Task<GraphAccessResult> CheckAsync(Guid graphId, string? token, CancellationToken cancellationToken);
}

public sealed class GraphAccess(NodeableDbContext db) : IGraphAccess
{
    public async Task<GraphAccessResult> CheckAsync(Guid graphId, string? token, CancellationToken cancellationToken)
    {
        // Only the hash is read: the entity's other columns are not needed to decide.
        var hashes = await db.Graphs
            .AsNoTracking()
            .Where(g => g.Id == graphId)
            .Select(g => new { g.AnonTokenHash })
            .ToListAsync(cancellationToken);

        if (hashes.Count == 0)
        {
            return GraphAccessResult.NotFound;
        }

        return GraphToken.Verify(token, hashes[0].AnonTokenHash) ? GraphAccessResult.Allowed : GraphAccessResult.InvalidToken;
    }
}
