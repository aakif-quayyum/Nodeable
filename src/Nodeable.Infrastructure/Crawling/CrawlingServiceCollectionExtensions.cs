using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace Nodeable.Infrastructure.Crawling;

public static class CrawlingServiceCollectionExtensions
{
    /// <summary>
    /// Registers the crawl queue, the ingestion request service and the runner. The caller registers the
    /// <c>NodeableDbContext</c> and one <see cref="ICrawlJobHandler"/> per job kind, with the kind as the service key:
    /// <c>services.AddKeyedScoped&lt;ICrawlJobHandler, RecordingJobHandler&gt;(CrawlJobKind.Recording)</c>.
    /// </summary>
    public static IServiceCollection AddCrawling(this IServiceCollection services)
    {
        services.AddOptions<CrawlOptions>()
            .BindConfiguration(CrawlOptions.SectionName)
            .ValidateDataAnnotations()
            .ValidateOnStart();

        // The DbContext is scoped (one per request, or per job), so the things that use it are scoped too.
        services.AddScoped<ICrawlQueue, CrawlQueue>();
        services.AddScoped<SongIngestionService>();

        // The runner lives as long as the process: it creates a scope per job, so it holds no DbContext itself.
        services.AddSingleton<CrawlJobRunner>();
        services.AddSingleton<ICrawlJobRunner>(provider => provider.GetRequiredService<CrawlJobRunner>());

        return services;
    }
}
