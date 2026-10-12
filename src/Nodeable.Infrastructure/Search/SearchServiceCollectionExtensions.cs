using Microsoft.Extensions.DependencyInjection;

namespace Nodeable.Infrastructure.Search;

public static class SearchServiceCollectionExtensions
{
    /// <summary>
    /// Registers recording search. The caller must also have registered <c>AddMusicBrainz()</c> (the client and its
    /// rate gate) and the <c>NodeableDbContext</c>.
    /// </summary>
    public static IServiceCollection AddRecordingSearch(this IServiceCollection services)
    {
        services.AddOptions<SearchOptions>()
            .BindConfiguration(SearchOptions.SectionName)
            .ValidateDataAnnotations()
            .ValidateOnStart();

        // Scoped: it uses the request's DbContext, which is scoped too, so both live and die with the request.
        services.AddScoped<IRecordingSearchService, RecordingSearchService>();

        return services;
    }
}
