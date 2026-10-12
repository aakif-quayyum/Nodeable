using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Nodeable.Tests.Containers;

namespace Nodeable.Api.Tests;

/// <summary>
/// Starts the real Api in memory, pointed at its own empty database inside the Testcontainers PostgreSQL and at the
/// shared Testcontainers Redis. In production Aspire injects the connection strings; here the factory injects them
/// instead. In Development the Api migrates the database on startup.
/// </summary>
public sealed class ApiFactory(PostgresFixture postgres, RedisFixture redis) : WebApplicationFactory<Program>
{
    private static int _nextRedisDatabase;

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        // ConfigureWebHost is synchronous, so waiting on the task here is the simple option; it runs once per factory.
        var connectionString = postgres.CreateDatabaseAsync().GetAwaiter().GetResult();

        // UseSetting is applied before Program.cs runs, which matters because AddNpgsqlDbContext reads the connection string while the app is being configured.
        builder.UseSetting("ConnectionStrings:nodeabledb", connectionString);

        // The MusicBrainz rate gate keeps its slot in one fixed Redis key. Each factory gets its own Redis database
        // number, so a test that uses up the slot cannot slow down another test. The fixture starts the server with
        // enough databases that no number is reused within a run (it was 16, and the 17th factory shared one).
        var database = Interlocked.Increment(ref _nextRedisDatabase) % RedisFixture.DatabaseCount;
        builder.UseSetting("ConnectionStrings:redis", $"{redis.ConnectionString},defaultDatabase={database}");
    }
}
