using System.Net;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Nodeable.Infrastructure.Persistence;
using StackExchange.Redis;

namespace Nodeable.Api.Tests;

// NFR-OBS-04: /api/v1/status/health, the endpoint the uptime monitor calls (HealthEndpointTests covers ServiceDefaults' own /health and /alive). The real Api, a real PostgreSQL and a real Redis.
public sealed class StatusHealthEndpointTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private sealed class FixedProbe(bool healthy) : IHealthProbe
    {
        public Task<bool> IsHealthyAsync(CancellationToken cancellationToken) => Task.FromResult(healthy);
    }

    private WebApplicationFactory<Program> App(bool? probe = null, params (string Key, string Value)[] settings) =>
        factory.WithWebHostBuilder(builder =>
        {
            foreach (var (key, value) in settings)
            {
                builder.UseSetting(key, value);
            }

            if (probe is { } healthy)
            {
                builder.ConfigureServices(services => services.Replace(ServiceDescriptor.Scoped<IHealthProbe>(_ => new FixedProbe(healthy))));
            }
        });

    [Fact]
    public async Task NFR_OBS_04_health_is_200_with_no_body_when_postgresql_and_redis_answer()
    {
        var ct = TestContext.Current.CancellationToken;
        using var app = App();
        using var client = app.CreateClient();

        var response = await client.GetAsync("/api/v1/status/health", ct);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        (await response.Content.ReadAsStringAsync(ct)).Should().BeEmpty();
    }

    [Fact]
    public async Task NFR_OBS_04_health_is_503_with_no_body_when_a_dependency_is_down()
    {
        var ct = TestContext.Current.CancellationToken;
        using var app = App(probe: false);
        using var client = app.CreateClient();

        var response = await client.GetAsync("/api/v1/status/health", ct);

        response.StatusCode.Should().Be(HttpStatusCode.ServiceUnavailable);
        (await response.Content.ReadAsStringAsync(ct)).Should().BeEmpty("a public endpoint does not say which dependency failed");
    }

    [Fact]
    public async Task NFR_OBS_04_the_probe_says_unhealthy_when_redis_cannot_be_reached()
    {
        var ct = TestContext.Current.CancellationToken;
        using var app = App();
        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<NodeableDbContext>();
        await using var nowhere = await ConnectionMultiplexer.ConnectAsync("127.0.0.1:1,abortConnect=false,connectTimeout=500,syncTimeout=500");

        (await new DependencyHealthProbe(db, nowhere).IsHealthyAsync(ct)).Should().BeFalse();
    }

    [Fact]
    public async Task NFR_OBS_04_the_probe_says_unhealthy_when_postgresql_cannot_be_reached()
    {
        var ct = TestContext.Current.CancellationToken;
        using var app = App();
        await using var scope = app.Services.CreateAsyncScope();
        var redis = scope.ServiceProvider.GetRequiredService<IConnectionMultiplexer>();
        var builder = new DbContextOptionsBuilder<NodeableDbContext>();
        builder.UseNpgsql("Host=127.0.0.1;Port=1;Database=x;Username=x;Password=x;Timeout=1");
        ((DbContextOptionsBuilder)builder).UseNodeableConventions();
        await using var unreachable = new NodeableDbContext(builder.Options);

        (await new DependencyHealthProbe(unreachable, redis).IsHealthyAsync(ct)).Should().BeFalse();
    }

    [Fact]
    public async Task NFR_OBS_04_the_probe_says_healthy_when_both_answer()
    {
        var ct = TestContext.Current.CancellationToken;
        using var app = App();
        await using var scope = app.Services.CreateAsyncScope();

        (await scope.ServiceProvider.GetRequiredService<IHealthProbe>().IsHealthyAsync(ct)).Should().BeTrue();
    }

    [Fact]
    public async Task NFR_SEC_02_health_checks_are_limited_per_address()
    {
        var ct = TestContext.Current.CancellationToken;
        using var app = App(probe: true, ("RateLimiting:HealthPermitsPerMinute", "2"));
        using var client = app.CreateClient();

        var statuses = new List<HttpStatusCode>();
        for (var i = 0; i < 3; i++)
        {
            statuses.Add((await client.GetAsync("/api/v1/status/health", ct)).StatusCode);
        }

        statuses.Should().Equal(HttpStatusCode.OK, HttpStatusCode.OK, HttpStatusCode.TooManyRequests);
    }
}
