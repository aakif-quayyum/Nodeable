using System.ComponentModel.DataAnnotations;
using System.Globalization;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Options;
using Nodeable.Api.Endpoints;

namespace Nodeable.Api.RateLimiting;

/// <summary>Per-IP limits on the public endpoints (NFR-SEC-02), bound from the "RateLimiting" section.</summary>
public sealed class ApiRateLimitOptions
{
    public const string SectionName = "RateLimiting";

    /// <summary>NFR-SEC-02: 60 searches per minute per IP address.</summary>
    [Range(1, 100_000)]
    public int SearchPermitsPerMinute { get; set; } = 60;

    /// <summary>NFR-SEC-02: 20 song additions per minute per IP address.</summary>
    [Range(1, 100_000)]
    public int SongAdditionPermitsPerMinute { get; set; } = 20;
}

public static class ApiRateLimiting
{
    /// <summary>The names an endpoint passes to <c>RequireRateLimiting</c>.</summary>
    public const string SearchPolicy = "search";

    public const string SongAdditionPolicy = "song-additions";

    public static IServiceCollection AddApiRateLimiting(this IServiceCollection services)
    {
        services.AddOptions<ApiRateLimitOptions>()
            .BindConfiguration(ApiRateLimitOptions.SectionName)
            .ValidateDataAnnotations()
            .ValidateOnStart();

        // LEARN: LG-03 rate-limiter-partition | ASP.NET Core ships a rate limiter as middleware: a policy returns a "partition" per request (here the client IP) and the framework keeps one fixed-window counter per partition, so the 61st search in a minute from one address gets a 429 without any package or Redis
        services.AddRateLimiter(limiter =>
        {
            limiter.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            limiter.OnRejected = WriteRejectedAsync;

            limiter.AddPolicy(SearchPolicy, context => PerClient(context, o => o.SearchPermitsPerMinute));
            limiter.AddPolicy(SongAdditionPolicy, context => PerClient(context, o => o.SongAdditionPermitsPerMinute));
        });

        return services;
    }

    private static RateLimitPartition<string> PerClient(HttpContext context, Func<ApiRateLimitOptions, int> permitsOf)
    {
        var permits = permitsOf(context.RequestServices.GetRequiredService<IOptions<ApiRateLimitOptions>>().Value);

        // Behind Caddy in production every request arrives from the proxy, so forwarded headers must be
        // honoured there (M4, deployment); until then the key is the direct peer.
        var client = context.Connection.RemoteIpAddress?.ToString() ?? "unknown";

        return RateLimitPartition.GetFixedWindowLimiter(client, _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = permits,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0,
        });
    }

    private static async ValueTask WriteRejectedAsync(OnRejectedContext context, CancellationToken cancellationToken)
    {
        var http = context.HttpContext;
        var retryAfter = context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var wait)
            ? Math.Max(1, (int)Math.Ceiling(wait.TotalSeconds))
            : 60;

        http.Response.StatusCode = StatusCodes.Status429TooManyRequests;
        http.Response.Headers.RetryAfter = retryAfter.ToString(CultureInfo.InvariantCulture);

        await http.RequestServices.GetRequiredService<IProblemDetailsService>().WriteAsync(new ProblemDetailsContext
        {
            HttpContext = http,
            ProblemDetails =
            {
                Type = ProblemTypes.RateLimited,
                Title = "Too many requests",
                Status = StatusCodes.Status429TooManyRequests,
                Detail = $"This address has used its requests for this minute. Try again in {retryAfter} seconds.",
                Extensions = { ["retryAfterSeconds"] = retryAfter },
            },
        });
    }
}
