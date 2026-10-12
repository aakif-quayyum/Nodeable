using Microsoft.AspNetCore.SignalR.StackExchangeRedis;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Nodeable.Infrastructure.Crawling;
using StackExchange.Redis;

namespace Nodeable.Infrastructure.Graphs;

public static class GraphServiceCollectionExtensions
{
    /// <summary>
    /// Registers what both processes need to send graph events: SignalR with the Redis backplane (so a message sent in
    /// the Worker reaches a browser connected to the Api), the publisher, the debouncer and the shared reads. The Api
    /// also maps <see cref="GraphHub"/>; the Worker only sends.
    /// </summary>
    /// <remarks>
    /// The backplane uses the same Redis as the rate gate (the AppHost's <c>ConnectionStrings:redis</c>). It is read when
    /// the backplane first connects, not at startup, so the OpenAPI document can still be generated at build time
    /// without a Redis to point at.
    /// </remarks>
    public static IServiceCollection AddGraphEvents(this IServiceCollection services)
    {
        services.AddSignalR()
            // Enums travel as their names ("complete"), like in the REST responses, not as the numbers 0, 1, 2.
            .AddJsonProtocol(protocol =>
                protocol.PayloadSerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter(System.Text.Json.JsonNamingPolicy.CamelCase)))
            .AddStackExchangeRedis(_ => { });

        services.AddOptions<RedisOptions>().Configure<IConfiguration>((redis, configuration) =>
        {
            var connectionString = configuration.GetConnectionString("redis")
                ?? throw new InvalidOperationException("ConnectionStrings:redis is missing: the AppHost's WithReference(redis) provides it.");
            redis.Configuration = ConfigurationOptions.Parse(connectionString);

            // Both processes name the channels the same way, so a message sent by one is seen by the other.
            redis.Configuration.ChannelPrefix = RedisChannel.Literal("nodeable");
        });

        services.TryAddSingleton(TimeProvider.System);
        services.AddSingleton<IGraphEvents, GraphEventPublisher>();
        services.AddSingleton<HubsUpdatedDebouncer>();

        services.AddScoped<GraphReadModel>();
        services.AddScoped<GraphEventNotifier>();
        services.AddScoped<IGraphAccess, GraphAccess>();

        return services;
    }

    /// <summary>
    /// Registers the graph operations of the Api: create, read, add and remove songs. Needs
    /// <c>AddGraphEvents</c>, <c>AddMusicBrainz</c>, <c>AddCrawling</c> and the DbContext.
    /// </summary>
    public static IServiceCollection AddGraphs(this IServiceCollection services)
    {
        services.AddOptions<GraphOptions>()
            .BindConfiguration(GraphOptions.SectionName)
            .ValidateDataAnnotations()
            .ValidateOnStart();

        services.AddScoped<IRecordingResolver, RecordingResolver>();
        services.AddScoped<GraphService>();

        return services;
    }

    /// <summary>The Worker's side: after each job, tell the browsers watching the songs it concerned.</summary>
    public static IServiceCollection AddGraphJobEvents(this IServiceCollection services)
    {
        services.AddScoped<ICrawlJobObserver, GraphJobObserver>();
        return services;
    }
}
