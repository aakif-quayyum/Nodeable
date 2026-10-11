using StackExchange.Redis;
using Testcontainers.Redis;

[assembly: AssemblyFixture(typeof(Nodeable.Tests.Containers.RedisFixture))]

namespace Nodeable.Tests.Containers;

/// <summary>
/// A real Redis server in a Docker container, started with Testcontainers (the rate gate's Lua script needs a real
/// Redis to run). This file is compiled into each test project that needs Redis. The image matches the major
/// version Aspire starts locally.
/// </summary>
public sealed class RedisFixture : IAsyncLifetime
{
    private readonly RedisContainer _container = new RedisBuilder("redis:8.6").Build();

    public string ConnectionString => _container.GetConnectionString();

    public async ValueTask InitializeAsync() => await _container.StartAsync();

    /// <summary>
    /// A new connection to the shared server. Two connections stand in for two service instances: each has its own
    /// client state, and they can only agree through Redis itself.
    /// </summary>
    public async Task<IConnectionMultiplexer> ConnectAsync() => await ConnectionMultiplexer.ConnectAsync(ConnectionString);

    public async ValueTask DisposeAsync() => await _container.DisposeAsync();
}
