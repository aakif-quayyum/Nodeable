using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Nodeable.Tests.Containers;

namespace Nodeable.Api.Tests;

/// <summary>
/// Starts the real Api in memory, pointed at its own empty database inside the Testcontainers PostgreSQL.
/// In production Aspire injects the connection string; here the factory injects it instead.
/// In Development the Api migrates the database on startup.
/// </summary>
public sealed class ApiFactory(PostgresFixture postgres) : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        // ConfigureWebHost is synchronous, so waiting on the task here is the simple option; it runs once per factory.
        var connectionString = postgres.CreateDatabaseAsync().GetAwaiter().GetResult();

        // UseSetting is applied before Program.cs runs, which matters because AddNpgsqlDbContext reads the connection string while the app is being configured.
        builder.UseSetting("ConnectionStrings:nodeabledb", connectionString);
    }
}
