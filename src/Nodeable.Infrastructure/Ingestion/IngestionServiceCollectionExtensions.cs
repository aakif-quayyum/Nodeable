using Microsoft.Extensions.DependencyInjection;
using Nodeable.Domain.Enums;
using Nodeable.Infrastructure.Crawling;

namespace Nodeable.Infrastructure.Ingestion;

public static class IngestionServiceCollectionExtensions
{
    /// <summary>
    /// Registers the handlers that turn crawl jobs into stored credits: one per job kind, with the kind as the key the
    /// runner looks them up by. Needs <c>AddCrawling()</c>, <c>AddMusicBrainz()</c> and a registered DbContext.
    /// </summary>
    public static IServiceCollection AddIngestion(this IServiceCollection services)
    {
        services.AddOptions<IngestionOptions>().BindConfiguration(IngestionOptions.SectionName);

        services.AddScoped<CreditStore>();

        services.AddKeyedScoped<ICrawlJobHandler, RecordingJobHandler>(CrawlJobKind.Recording);
        services.AddKeyedScoped<ICrawlJobHandler, WorkJobHandler>(CrawlJobKind.Work);
        services.AddKeyedScoped<ICrawlJobHandler, ReleaseJobHandler>(CrawlJobKind.Release);

        return services;
    }
}
