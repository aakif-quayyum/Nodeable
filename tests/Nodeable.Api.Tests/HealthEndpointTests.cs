using System.Net;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Nodeable.Api.Tests;

// LEARN: LG-01 web-app-factory | WebApplicationFactory<Program> boots the real Api in memory and gives an HttpClient wired straight to it: no port, no network, and the same DI container and middleware as production
// IClassFixture: xUnit builds one factory and shares it across this class's tests, like a beforeAll() that returns a value.
// The (WebApplicationFactory<Program> factory) after the class name is a C# 12 primary constructor; "factory" is usable in every method.
public class HealthEndpointTests(WebApplicationFactory<Program> factory)
    : IClassFixture<WebApplicationFactory<Program>>
{
    // [Fact] marks a test, like it("...") in Vitest. The name carries the requirement ID (spec section 13).
    // Liveness is what container health checks and the 99.5% availability SLO are measured against.
    [Fact]
    public async Task NFR_REL_02_alive_endpoint_reports_healthy()
    {
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/alive", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("Healthy", await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
    }

    // WebApplicationFactory runs in the Development environment, where the full readiness report is mapped.
    [Fact]
    public async Task NFR_REL_02_health_endpoint_is_mapped_in_development()
    {
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/health", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task NFR_REL_02_unknown_path_returns_not_found()
    {
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/does-not-exist", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}
