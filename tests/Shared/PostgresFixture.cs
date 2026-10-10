using Npgsql;
using Testcontainers.PostgreSql;

[assembly: AssemblyFixture(typeof(Nodeable.Tests.Containers.PostgresFixture))]

namespace Nodeable.Tests.Containers;

/// <summary>
/// A real PostgreSQL server in a Docker container, started with Testcontainers. This file is compiled into
/// each test project that needs a database (see the Compile Include in their .csproj files).
/// The image matches the major version Aspire starts locally.
/// </summary>
public sealed class PostgresFixture : IAsyncLifetime
{
    private readonly PostgreSqlContainer _container = new PostgreSqlBuilder("postgres:18").Build();

    public string ConnectionString => _container.GetConnectionString();

    public async ValueTask InitializeAsync() => await _container.StartAsync();

    /// <summary>Creates an empty database with a unique name and returns its connection string, so tests never share rows.</summary>
    public async Task<string> CreateDatabaseAsync()
    {
        var name = $"test_{Guid.NewGuid():N}";

        await using var connection = new NpgsqlConnection(ConnectionString);
        await connection.OpenAsync();

        // CREATE DATABASE cannot take parameters. The name is generated above from a Guid, never from input.
#pragma warning disable CA2100
        await using var command = new NpgsqlCommand($"CREATE DATABASE {name}", connection);
#pragma warning restore CA2100
        await command.ExecuteNonQueryAsync();

        return new NpgsqlConnectionStringBuilder(ConnectionString) { Database = name }.ConnectionString;
    }

    public async ValueTask DisposeAsync() => await _container.DisposeAsync();
}
