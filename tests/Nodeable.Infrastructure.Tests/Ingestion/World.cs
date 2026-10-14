using Microsoft.Extensions.DependencyInjection;
using Nodeable.Domain.Enums;
using Nodeable.Infrastructure.Crawling;
using Nodeable.Infrastructure.Graphs;
using Nodeable.Infrastructure.Ingestion;

namespace Nodeable.Infrastructure.Tests.Ingestion;

/// <summary>One Worker process's worth of services over one database.</summary>
internal sealed class World(ServiceProvider provider, string connectionString) : IAsyncDisposable
{
    public ServiceProvider Provider { get; } = provider;

    public string ConnectionString { get; } = connectionString;

    public async Task<IngestionRequestResult> RequestSongAsync(Guid mbid, string title, string artist)
    {
        await using var scope = Provider.CreateAsyncScope();
        return await scope.ServiceProvider.GetRequiredService<SongIngestionService>()
            .RequestAsync(mbid, title, artist, TestContext.Current.CancellationToken);
    }

    public async Task Queue(CrawlJobKind kind, Guid mbid, int priority)
    {
        await using var scope = Provider.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<ICrawlQueue>()
            .EnqueueAsync(kind, mbid, priority, TestContext.Current.CancellationToken);
    }

    public Task<bool> RunOnceAsync() =>
        Provider.GetRequiredService<ICrawlJobRunner>().RunOnceAsync(TestContext.Current.CancellationToken);

    /// <summary>Runs jobs until nothing is ready, as the Worker loop would.</summary>
    public async Task DrainAsync()
    {
        for (var i = 0; i < 20; i++)
        {
            if (!await RunOnceAsync())
            {
                return;
            }
        }

        throw new InvalidOperationException("The queue did not drain in 20 jobs; a job is queuing itself.");
    }

    public ValueTask DisposeAsync() => Provider.DisposeAsync();
}
