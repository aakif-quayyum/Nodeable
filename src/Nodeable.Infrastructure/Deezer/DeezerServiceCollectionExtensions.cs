using System.Net;
using System.Net.Http.Headers;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Http.Resilience;
using Microsoft.Extensions.Options;
using Nodeable.Infrastructure.RateLimiting;
using Polly;
using Polly.Timeout;
using StackExchange.Redis;

namespace Nodeable.Infrastructure.Deezer;

public static class DeezerServiceCollectionExtensions
{
    private const string Source = "deezer";

    /// <summary>
    /// Registers the Deezer client, its settings, its own rate gate and the service that answers the Api's preview
    /// request. The caller must also register an <see cref="IConnectionMultiplexer"/> and a DbContext, as for MusicBrainz.
    /// </summary>
    public static IServiceCollection AddDeezer(this IServiceCollection services)
    {
        services.AddOptions<DeezerOptions>()
            .BindConfiguration(DeezerOptions.SectionName)
            .ValidateDataAnnotations()
            .ValidateOnStart();

        // LEARN: LG-04 second-gate | The keyed registration from LG-02 pays off: the same IRateGate and Redis implementation under a second key gives Deezer its own limit, shared by every instance and independent of MusicBrainz, with no new class
        services.AddKeyedSingleton<IRateGate>(Source, (provider, _) =>
        {
            var options = provider.GetRequiredService<IOptions<DeezerOptions>>().Value;
            return new RedisRateGate(
                provider.GetRequiredService<IConnectionMultiplexer>(),
                Source,
                new RateGateOptions(options.MinRequestInterval, options.Burst, options.MaxGateWait));
        });

        var client = services.AddHttpClient<IDeezerClient, DeezerClient>((provider, http) =>
        {
            var options = provider.GetRequiredService<IOptions<DeezerOptions>>().Value;
            http.BaseAddress = new Uri(options.BaseUrl.TrimEnd('/') + "/");
            http.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
            http.Timeout = Timeout.InfiniteTimeSpan;
        });

        // As for MusicBrainz: the default pipeline is replaced, so retries are counted once and every retry waits for its slot.
#pragma warning disable EXTEXP0001
        client.RemoveAllResilienceHandlers();
#pragma warning restore EXTEXP0001

        client.AddResilienceHandler("deezer", ConfigureResilience);
        client.AddHttpMessageHandler(provider => new RateGateHandler(provider.GetRequiredKeyedService<IRateGate>(Source)));
        client.AddHttpMessageHandler(() => new ExternalRequestMetricsHandler(Source));

        services.AddScoped<PreviewLinkService>();

        return services;
    }

    private static void ConfigureResilience(ResiliencePipelineBuilder<HttpResponseMessage> pipeline, ResilienceHandlerContext context)
    {
        var options = context.ServiceProvider.GetRequiredService<IOptions<DeezerOptions>>().Value;

        pipeline
            .AddTimeout(options.TotalTimeout)
            .AddRetry(new HttpRetryStrategyOptions
            {
                MaxRetryAttempts = options.MaxRetries,
                Delay = options.RetryBaseDelay,
                BackoffType = DelayBackoffType.Exponential,
                UseJitter = true,
                ShouldHandle = args => ValueTask.FromResult(args.Outcome switch
                {
                    { Result.StatusCode: HttpStatusCode.ServiceUnavailable or HttpStatusCode.TooManyRequests or HttpStatusCode.BadGateway } => true,
                    { Exception: HttpRequestException or TimeoutRejectedException } => true,
                    _ => false,
                }),
            })
            .AddTimeout(options.AttemptTimeout);
    }
}
