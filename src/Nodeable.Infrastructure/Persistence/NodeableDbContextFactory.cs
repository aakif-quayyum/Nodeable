using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Nodeable.Infrastructure.Persistence;

/// <summary>
/// Used only by the <c>dotnet ef</c> command-line tools, to create migrations without starting the whole app.
/// The connection string is a placeholder: creating or scripting a migration never connects to a database.
/// </summary>
// LEARN: LG-01 design-time-factory | dotnet ef cannot run the AppHost to get a DbContext, so IDesignTimeDbContextFactory tells the tools how to build one; the running app gets its connection string from Aspire instead
public sealed class NodeableDbContextFactory : IDesignTimeDbContextFactory<NodeableDbContext>
{
    public NodeableDbContext CreateDbContext(string[] args)
    {
        var builder = new DbContextOptionsBuilder<NodeableDbContext>();
        builder.UseNpgsql("Host=localhost;Database=nodeable_design");
        builder.UseNodeableConventions();

        return new NodeableDbContext(builder.Options);
    }
}
