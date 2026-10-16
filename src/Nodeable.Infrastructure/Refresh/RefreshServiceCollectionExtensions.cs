using Microsoft.Extensions.DependencyInjection;

namespace Nodeable.Infrastructure.Refresh;

public static class RefreshServiceCollectionExtensions
{
    /// <summary>Registers the 30-day cache refresh and its settings (NFR-REL-03). The Worker schedules it with Hangfire.</summary>
    public static IServiceCollection AddCacheRefresh(this IServiceCollection services)
    {
        services.AddOptions<RefreshOptions>()
            .BindConfiguration(RefreshOptions.SectionName)
            .ValidateDataAnnotations()
            .ValidateOnStart();

        services.AddScoped<StaleCacheRefresher>();
        return services;
    }
}
