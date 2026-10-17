using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Mvc.Testing;
using Nodeable.Api.Endpoints;
using Nodeable.Infrastructure.Metrics;

namespace Nodeable.Api.Tests;

// NFR-OBS-03: the status endpoints through the whole stack: HTTP, Basic authentication, the rate limiter, the real database.
public sealed class StatusMetricsEndpointTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private const string Password = "correct horse battery staple";

    private static readonly JsonSerializerOptions _json = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) },
    };

    private WebApplicationFactory<Program> App(string? password = Password, params (string Key, string Value)[] settings) =>
        factory.WithWebHostBuilder(builder =>
        {
            if (password is not null)
            {
                builder.UseSetting("Status:OperatorPassword", password);
            }

            foreach (var (key, value) in settings)
            {
                builder.UseSetting(key, value);
            }
        });

    private static HttpRequestMessage Private(string query = "", string? user = OperatorAuthFilter.UserName, string? password = Password)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, $"/api/v1/status/private/metrics{query}");
        if (password is not null)
        {
            request.Headers.Authorization = new AuthenticationHeaderValue("Basic", Convert.ToBase64String(Encoding.UTF8.GetBytes($"{user}:{password}")));
        }

        return request;
    }

    [Fact]
    public async Task NFR_OBS_03_the_private_metrics_need_the_operator_password()
    {
        var ct = TestContext.Current.CancellationToken;
        using var app = App();
        using var client = app.CreateClient();

        var response = await client.SendAsync(Private(password: null), ct);

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        response.Headers.WwwAuthenticate.Single().Scheme.Should().Be("Basic");
        (await response.Content.ReadAsStringAsync(ct)).Should().Contain(ProblemTypes.Unauthorized);
    }

    [Theory]
    [InlineData("operator", "wrong")]
    [InlineData("someone", Password)]
    [InlineData("operator", "")]
    [InlineData("", Password)]
    public async Task NFR_OBS_03_a_wrong_user_or_password_is_401(string user, string password)
    {
        var ct = TestContext.Current.CancellationToken;
        using var app = App();
        using var client = app.CreateClient();

        (await client.SendAsync(Private(user: user, password: password), ct)).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task NFR_OBS_03_with_no_password_configured_the_private_metrics_are_closed_to_everyone()
    {
        var ct = TestContext.Current.CancellationToken;
        using var app = App(password: null);
        using var client = app.CreateClient();

        (await client.SendAsync(Private(password: ""), ct)).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await client.SendAsync(Private(password: "anything"), ct)).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task NFR_OBS_03_the_right_password_gets_every_panel_with_the_slos()
    {
        var ct = TestContext.Current.CancellationToken;
        using var app = App();
        using var client = app.CreateClient();

        var response = await client.SendAsync(Private("?range=1h&width=30"), ct);
        var body = await response.Content.ReadFromJsonAsync<MetricsResponse>(_json, ct);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        body!.Times.Count.Should().BeLessThanOrEqualTo(30);
        body.Series.Select(s => s.Id).Should().Contain(["api.requests", "queue.depth", "cache.hitRatio", "preview.none"]);
        body.Heatmap.Should().NotBeNull();
        body.Slos.Should().HaveCount(5);
    }

    [Fact]
    public async Task FR_ABOUT_01_the_public_metrics_need_no_password_and_carry_only_the_crawlers_series()
    {
        var ct = TestContext.Current.CancellationToken;
        using var app = App();
        using var client = app.CreateClient();

        var response = await client.GetAsync("/api/v1/status/public/metrics?range=6h&width=60", ct);
        var text = await response.Content.ReadAsStringAsync(ct);
        var body = JsonSerializer.Deserialize<MetricsResponse>(text, _json);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        body!.Series.Select(s => s.Id).Should().Contain(["queue.depth", "jobs.done", "mb.rate503", "cache.hitRatio"]);
        body.Series.Should().NotContain(s => s.Id.StartsWith("api.", StringComparison.Ordinal) || s.Id.StartsWith("preview.", StringComparison.Ordinal));
        body.Slos.Should().BeNull();
        body.Heatmap.Should().BeNull();
    }

    [Theory]
    [InlineData("?range=2h")]
    [InlineData("?width=9")]
    [InlineData("?width=601")]
    [InlineData("?from=2026-10-01T00:00:00Z")]
    [InlineData("?from=2026-10-02T00:00:00Z&to=2026-10-01T00:00:00Z")]
    [InlineData("?from=2020-01-01T00:00:00Z&to=2020-01-02T00:00:00Z")]
    public async Task NFR_OBS_03_an_invalid_window_is_400(string query)
    {
        var ct = TestContext.Current.CancellationToken;
        using var app = App();
        using var client = app.CreateClient();

        var response = await client.SendAsync(Private(query), ct);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await response.Content.ReadAsStringAsync(ct)).Should().Contain(ProblemTypes.InvalidRequest);
    }

    [Fact]
    public async Task NFR_OBS_03_a_zoomed_window_with_from_and_to_overrides_the_range()
    {
        var ct = TestContext.Current.CancellationToken;
        using var app = App();
        using var client = app.CreateClient();
        var to = DateTimeOffset.UtcNow.AddMinutes(-5);
        var from = to.AddMinutes(-20);

        var response = await client.SendAsync(Private($"?range=7d&from={Uri.EscapeDataString(from.ToString("O"))}&to={Uri.EscapeDataString(to.ToString("O"))}&width=600"), ct);
        var body = await response.Content.ReadFromJsonAsync<MetricsResponse>(_json, ct);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        body!.StepSeconds.Should().Be(60);
        body.Times.Count.Should().BeInRange(20, 22);
    }

    [Fact]
    public async Task NFR_SEC_02_wrong_passwords_use_up_the_private_limit_so_guessing_is_slowed()
    {
        var ct = TestContext.Current.CancellationToken;
        using var app = App(Password, ("RateLimiting:StatusPrivatePermitsPerMinute", "2"));
        using var client = app.CreateClient();

        var statuses = new List<HttpStatusCode>();
        for (var i = 0; i < 3; i++)
        {
            statuses.Add((await client.SendAsync(Private(password: "guess"), ct)).StatusCode);
        }

        statuses.Should().Equal(HttpStatusCode.Unauthorized, HttpStatusCode.Unauthorized, HttpStatusCode.TooManyRequests);
    }

    [Fact]
    public async Task NFR_SEC_02_public_metric_reads_are_limited_per_address()
    {
        var ct = TestContext.Current.CancellationToken;
        using var app = App(Password, ("RateLimiting:StatusPublicPermitsPerMinute", "2"));
        using var client = app.CreateClient();

        var statuses = new List<HttpStatusCode>();
        for (var i = 0; i < 3; i++)
        {
            statuses.Add((await client.GetAsync("/api/v1/status/public/metrics", ct)).StatusCode);
        }

        statuses.Should().Equal(HttpStatusCode.OK, HttpStatusCode.OK, HttpStatusCode.TooManyRequests);
    }

    [Theory]
    [InlineData("Basic " + "b3BlcmF0b3I6cGFzcw==", true, "operator", "pass")]
    [InlineData("basic b3BlcmF0b3I6cGFzcw==", true, "operator", "pass")]
    [InlineData("Basic b3BlcmF0b3I6YTpi", true, "operator", "a:b")]
    [InlineData("Bearer abc", false, "", "")]
    [InlineData("Basic !!!not-base64", false, "", "")]
    [InlineData("Basic bm9jb2xvbg==", false, "", "")]
    [InlineData("", false, "", "")]
    public void NFR_OBS_03_basic_credentials_are_read_from_the_authorization_header_and_nothing_else_is_accepted(string header, bool ok, string user, string password)
    {
        OperatorAuthFilter.TryReadCredentials(header, out var readUser, out var readPassword).Should().Be(ok);
        (readUser, readPassword).Should().Be((user, password));
    }

    [Theory]
    [InlineData("operator", "secret", "secret", true)]
    [InlineData("operator", "Secret", "secret", false)]
    [InlineData("operator", "secre", "secret", false)]
    [InlineData("operator", "secrets", "secret", false)]
    [InlineData("admin", "secret", "secret", false)]
    public void NFR_OBS_03_the_password_and_the_user_must_both_match_whatever_the_lengths(string user, string given, string expected, bool matches) =>
        OperatorAuthFilter.Matches(user, given, expected).Should().Be(matches);
}
