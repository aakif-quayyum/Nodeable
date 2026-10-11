using System.Net;
using System.Net.Http.Headers;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Http.Resilience;
using Microsoft.Extensions.Options;
using Nodeable.Infrastructure.RateLimiting;
using Polly;
using Polly.Timeout;
using StackExchange.Redis;

namespace Nodeable.Infrastructure.MusicBrainz;

public static class MusicBrainzServiceCollectionExtensions
{
    private const string Source = "musicbrainz";

    /// <summary>
    /// Registers the MusicBrainz client, its settings and its rate gate. The caller must also register an
    /// <see cref="IConnectionMultiplexer"/> (the Worker does this with Aspire's <c>AddRedisClient("redis")</c>), because
    /// the gate keeps its state in Redis.
    /// </summary>
    public static IServiceCollection AddMusicBrainz(this IServiceCollection services)
    {
        // ValidateOnStart makes a missing contact URL fail when the host starts, not on the first request.
        services.AddOptions<MusicBrainzOptions>()
            .BindConfiguration(MusicBrainzOptions.SectionName)
            .ValidateDataAnnotations()
            .ValidateOnStart();

        // LEARN: LG-02 keyed-service | A keyed service lets one interface have several registrations told apart by a key, so a second external API (Discogs, v2) can get its own IRateGate without a new interface
        services.AddKeyedSingleton<IRateGate>(Source, (provider, _) =>
        {
            var options = provider.GetRequiredService<IOptions<MusicBrainzOptions>>().Value;
            return new RedisRateGate(
                provider.GetRequiredService<IConnectionMultiplexer>(),
                Source,
                new RateGateOptions(options.MinRequestInterval, options.Burst, options.MaxGateWait));
        });

        var client = services.AddHttpClient<IMusicBrainzClient, MusicBrainzClient>((provider, http) =>
        {
            var options = provider.GetRequiredService<IOptions<MusicBrainzOptions>>().Value;

            // A BaseAddress without a trailing slash would drop its last path segment when a relative URI is added.
            http.BaseAddress = new Uri(options.BaseUrl.TrimEnd('/') + "/");
            http.DefaultRequestHeaders.UserAgent.ParseAdd(
                MusicBrainzUserAgent.Create(MusicBrainzUserAgent.CurrentVersion(), options.ContactUrl));
            http.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

            // The resilience pipeline owns timeouts, so HttpClient's own 100 second limit must not cut in first.
            http.Timeout = Timeout.InfiniteTimeSpan;
        });

        // ServiceDefaults gives every HttpClient the standard resilience handler (3 retries, a circuit breaker, short
        // timeouts). MusicBrainz needs different numbers, and stacking two retry layers would multiply the attempts.
        // The API is marked experimental by Microsoft; a test counts the attempts so a change in behaviour shows up.
#pragma warning disable EXTEXP0001
        client.RemoveAllResilienceHandlers();
#pragma warning restore EXTEXP0001

        // Handlers run in the order they are added, outermost first: the retry pipeline wraps the gate, so every
        // attempt, including each retry, waits for its own slot (NFR-RATE-01 and NFR-RATE-03 together).
        client.AddResilienceHandler("musicbrainz", ConfigureResilience);
        client.AddHttpMessageHandler(provider => new RateGateHandler(provider.GetRequiredKeyedService<IRateGate>(Source)));
        client.AddHttpMessageHandler(() => new ExternalRequestMetricsHandler(Source));

        return services;
    }

    // LEARN: LG-02 resilience-pipeline | A Polly resilience pipeline is built from strategies that wrap each other, outermost first: a total timeout, then retry with exponential backoff and jitter, then a per-attempt timeout
    private static void ConfigureResilience(ResiliencePipelineBuilder<HttpResponseMessage> pipeline, ResilienceHandlerContext context)
    {
        var options = context.ServiceProvider.GetRequiredService<IOptions<MusicBrainzOptions>>().Value;

        pipeline
            .AddTimeout(options.TotalTimeout)
            .AddRetry(new HttpRetryStrategyOptions
            {
                MaxRetryAttempts = options.MaxRetries,
                Delay = options.RetryBaseDelay,
                BackoffType = DelayBackoffType.Exponential,

                // Jitter spreads retries from many instances so they do not all come back at the same instant.
                UseJitter = true,

                // A Retry-After header, when the server sends one, replaces the calculated delay.
                ShouldRetryAfterHeader = true,

                // NFR-RATE-03 names 503 and 429. Network failures and a timed-out attempt are transient in the same way.
                // Other statuses, such as 400 or 404, would fail again the same way, so they are returned as they are.
                ShouldHandle = args => ValueTask.FromResult(args.Outcome switch
                {
                    { Result.StatusCode: HttpStatusCode.ServiceUnavailable or HttpStatusCode.TooManyRequests } => true,
                    { Exception: HttpRequestException or TimeoutRejectedException } => true,
                    _ => false,
                }),
            })
            .AddTimeout(options.AttemptTimeout);
    }
}
