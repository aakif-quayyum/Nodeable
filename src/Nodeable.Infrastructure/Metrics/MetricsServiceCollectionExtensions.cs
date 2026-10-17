using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Nodeable.Infrastructure.Metrics;

public static class MetricsServiceCollectionExtensions
{
    /// <summary>
    /// The write side of the metrics rollup for a process (NFR-OBS-02, decision 0023): a recorder that listens to the
    /// process's own meters and a flusher that adds what it saw to <c>metric_rollups</c> once a minute. Both the Api and
    /// the Worker call this; the Worker also runs <see cref="RollupMaintenance"/>.
    /// </summary>
    public static IServiceCollection AddMetricsRollup(this IServiceCollection services, string processName)
    {
        services.AddSingleton(new RollupProcess(processName));
        services.TryAddSingleton(TimeProvider.System);
        services.AddSingleton<RollupRecorder>();
        services.AddScoped<RollupWriter>();
        services.AddScoped<RollupMaintenance>();
        services.AddScoped<SloChecker>();
        services.AddScoped<StatusMetricsReader>();
        services.AddSingleton<RollupFlusher>();
        services.AddHostedService(provider => provider.GetRequiredService<RollupFlusher>());
        return services;
    }
}
