using AwesomeAssertions;
using Nodeable.Tests.Containers;
using StackExchange.Redis;

namespace Nodeable.Api.Tests;

/// <summary>
/// Guards the test harness itself: every <see cref="ApiFactory"/> takes its own Redis database so a test that uses up
/// the rate gate's slot cannot slow another. With Redis's default of 16 databases, the seventeenth factory shared one
/// and <c>NFR_RATE_03</c> failed now and then on a slower machine.
/// </summary>
public sealed class RedisDatabasesTests(RedisFixture redis)
{
    [Fact]
    public async Task NFR_RATE_03_the_test_redis_has_a_database_for_every_factory()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var connection = await ConnectionMultiplexer.ConnectAsync(redis.ConnectionString);

        // StackExchange.Redis fails on SELECT of a number the server does not have, so reaching the last one proves the setting.
        var last = connection.GetDatabase(RedisFixture.DatabaseCount - 1);
        await last.StringSetAsync("nodeable:test:last-database", "ok");

        (await last.StringGetAsync("nodeable:test:last-database")).ToString().Should().Be("ok");
        await last.KeyDeleteAsync("nodeable:test:last-database");
        ct.ThrowIfCancellationRequested();
    }
}
