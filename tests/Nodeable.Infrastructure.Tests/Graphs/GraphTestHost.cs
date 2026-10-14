using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Time.Testing;
using Nodeable.Domain.Art;
using Nodeable.Domain.Crawling;
using Nodeable.Domain.Entities;
using Nodeable.Domain.Enums;
using Nodeable.Infrastructure.Crawling;
using Nodeable.Infrastructure.Graphs;
using Nodeable.Infrastructure.MusicBrainz;
using Nodeable.Infrastructure.Persistence;
using Nodeable.Infrastructure.Tests.Crawling;
using Nodeable.Tests.Containers;
using static Nodeable.Infrastructure.Tests.Crawling.CrawlTestSupport;

namespace Nodeable.Infrastructure.Tests.Graphs;

/// <summary>
/// The graph feature built the way the Api and the Worker build it (<c>AddCrawling</c>, <c>AddGraphEvents</c>,
/// <c>AddGraphs</c>, <c>AddGraphJobEvents</c>) over a real PostgreSQL, with three stand-ins: the events (so a test can
/// read what would have been sent), MusicBrainz's recording lookup, and the clock.
/// </summary>
internal sealed class GraphTestHost : IAsyncDisposable
{
    private GraphTestHost(ServiceProvider provider, string connectionString, RecordingGraphEvents events, FakeResolver resolver, FakeTimeProvider time)
    {
        Provider = provider;
        ConnectionString = connectionString;
        Events = events;
        Resolver = resolver;
        Time = time;
    }

    public ServiceProvider Provider { get; }

    public string ConnectionString { get; }

    public RecordingGraphEvents Events { get; }

    public FakeResolver Resolver { get; }

    public FakeTimeProvider Time { get; }

    public static async Task<GraphTestHost> CreateAsync(PostgresFixture postgres, Dictionary<string, string?>? settings = null)
    {
        var connectionString = await NewDatabaseAsync(postgres);
        var events = new RecordingGraphEvents();
        var resolver = new FakeResolver();
        var time = new FakeTimeProvider(new DateTimeOffset(2026, 10, 12, 12, 0, 0, TimeSpan.Zero));

        var services = new ServiceCollection();
        services.AddLogging();
        services.AddOptions();
        services.AddSingleton<IConfiguration>(new ConfigurationBuilder().AddInMemoryCollection(settings ?? []).Build());
        services.AddDbContext<NodeableDbContext>(options => options.UseNpgsql(connectionString).UseNodeableConventions());

        // The clock is registered before AddGraphEvents, which only adds the system clock when there is none.
        services.AddSingleton<TimeProvider>(time);

        services.AddCrawling();
        services.AddGraphEvents();
        services.AddGraphs();
        services.AddGraphJobEvents();

        services.RemoveAll<IGraphEvents>();
        services.AddSingleton<IGraphEvents>(events);
        services.RemoveAll<IRecordingResolver>();
        services.AddScoped<IRecordingResolver>(_ => resolver);

        return new GraphTestHost(services.BuildServiceProvider(), connectionString, events, resolver, time);
    }

    public async Task<T> InScopeAsync<T>(Func<IServiceProvider, Task<T>> action)
    {
        await using var scope = Provider.CreateAsyncScope();
        return await action(scope.ServiceProvider);
    }

    public async Task SeedAsync(Func<NodeableDbContext, Task> seed)
    {
        await using var db = Context(ConnectionString);
        await seed(db);
        await db.SaveChangesAsync(TestContext.Current.CancellationToken);
    }

    public Task<Guid> SeedGraphAsync(string name = "Test graph") => InScopeAsync(async services =>
    {
        var created = await services.GetRequiredService<GraphService>().CreateAsync(name, TestContext.Current.CancellationToken);
        return created.Id;
    });

    public Task SeedRecordingAsync(Guid mbid, string title, string artist, CreditsStatus status = CreditsStatus.None) =>
        SeedAsync(db =>
        {
            db.Recordings.Add(new Recording
            {
                Mbid = mbid,
                Title = title,
                ArtistCredit = artist,
                CreditsStatus = status,
                FetchedAt = DateTimeOffset.UtcNow,
            });
            return Task.CompletedTask;
        });

    public Task SeedPersonAsync(Guid mbid, string name) =>
        SeedAsync(db =>
        {
            db.People.Add(new Person { Mbid = mbid, Name = name, FetchedAt = DateTimeOffset.UtcNow });
            return Task.CompletedTask;
        });

    public Task SeedCreditAsync(Guid person, CreditSubjectType level, Guid subject, CreditRole role, string detail = "") =>
        SeedAsync(db =>
        {
            db.Credits.Add(new Credit { PersonMbid = person, SubjectType = level, SubjectMbid = subject, Role = role, Detail = detail });
            return Task.CompletedTask;
        });

    /// <summary>A work linked to a recording, with its row (the link has foreign keys to both).</summary>
    public Task SeedWorkAsync(Guid work, Guid recording) =>
        SeedAsync(async db =>
        {
            db.Works.Add(new Work { Mbid = work, Title = "Work", FetchedAt = DateTimeOffset.UtcNow });
            await db.SaveChangesAsync(TestContext.Current.CancellationToken);
            db.RecordingWorks.Add(new RecordingWork { RecordingMbid = recording, WorkMbid = work });
        });

    public Task AddToGraphAsync(Guid graph, Guid recording) =>
        SeedAsync(db =>
        {
            db.GraphSongs.Add(new GraphSong { GraphId = graph, RecordingMbid = recording });
            return Task.CompletedTask;
        });

    public async Task<IReadOnlyList<CrawlJob>> JobsAsync() => await CrawlTestSupport.JobsAsync(ConnectionString);

    public async Task SetJobStatusAsync(CrawlJobKind kind, Guid target, CrawlJobStatus status)
    {
        var text = status.ToString().ToLowerInvariant();
        var kindText = kind.ToString().ToLowerInvariant();
        await using var db = Context(ConnectionString);
        await db.Database.ExecuteSqlAsync(
            $"UPDATE crawl_jobs SET status = {text} WHERE kind = {kindText} AND target_mbid = {target}",
            TestContext.Current.CancellationToken);
    }

    public Task EnqueueAsync(CrawlJobKind kind, Guid target) =>
        InScopeAsync(async services =>
        {
            await services.GetRequiredService<ICrawlQueue>()
                .EnqueueAsync(kind, target, CrawlPriority.Interactive, TestContext.Current.CancellationToken);
            return 0;
        });

    public ValueTask DisposeAsync() => Provider.DisposeAsync();

    /// <summary>One thing the code under test asked the hub to send.</summary>
    public sealed record SentEvent(Guid GraphId, string Name, Guid? Song = null, object? Payload = null);

    /// <summary>Records what would have been sent. Sequence numbers are the publisher's job and are tested with the real hub.</summary>
    public sealed class RecordingGraphEvents : IGraphEvents
    {
        private readonly List<SentEvent> _sent = [];
        private readonly Dictionary<(Guid, Guid), SongStatus> _remembered = [];
        private readonly object _gate = new();

        public IReadOnlyList<SentEvent> Sent
        {
            get
            {
                lock (_gate)
                {
                    return [.. _sent];
                }
            }
        }

        public IReadOnlyDictionary<(Guid, Guid), SongStatus> Remembered => _remembered;

        public IEnumerable<SentEvent> Named(string name) => Sent.Where(e => e.Name == name);

        public Task<long> CurrentSeqAsync(Guid graphId, CancellationToken cancellationToken = default) => Task.FromResult(Sent.Count(e => e.GraphId == graphId) + 0L);

        public Task CreditsResolvedAsync(Guid graphId, Guid songMbid, IReadOnlyList<PersonItem> people, IReadOnlyList<CreditItem> credits, CoverChoice? cover = null, CancellationToken cancellationToken = default) =>
            Record(new SentEvent(graphId, "CreditsResolved", songMbid, new CreditsResolvedMessage(0, songMbid, people, credits, cover?.ReleaseMbid, cover?.ReleaseGroupMbid)));

        public Task<bool> SongStatusChangedAsync(Guid graphId, Guid songMbid, SongStatus status, CancellationToken cancellationToken = default)
        {
            Record(new SentEvent(graphId, "SongStatusChanged", songMbid, status));
            return Task.FromResult(true);
        }

        public Task RememberSongStatusAsync(Guid graphId, Guid songMbid, SongStatus status, CancellationToken cancellationToken = default)
        {
            _remembered[(graphId, songMbid)] = status;
            return Task.CompletedTask;
        }

        public Task HubsUpdatedAsync(Guid graphId, IReadOnlyList<HubItem> hubs, CancellationToken cancellationToken = default) =>
            Record(new SentEvent(graphId, "HubsUpdated", null, hubs));

        public Task PreviewFoundAsync(Guid graphId, Guid songMbid, string? deezerCoverMd5, CancellationToken cancellationToken = default) =>
            Record(new SentEvent(graphId, "PreviewFound", songMbid, deezerCoverMd5));

        public Task CrawlProgressAsync(Guid graphId, CrawlProgressItem progress, CancellationToken cancellationToken = default) =>
            Record(new SentEvent(graphId, "CrawlProgress", null, progress));

        public Task CrawlFailedAsync(Guid graphId, Guid songMbid, string reason, CancellationToken cancellationToken = default) =>
            Record(new SentEvent(graphId, "CrawlFailed", songMbid, reason));

        private Task Record(SentEvent sent)
        {
            lock (_gate)
            {
                _sent.Add(sent);
            }

            return Task.CompletedTask;
        }
    }

    /// <summary>MusicBrainz's answer to "what is this recording called", chosen by the test.</summary>
    public sealed class FakeResolver : IRecordingResolver
    {
        private readonly Dictionary<Guid, ResolvedRecording> _known = [];

        public int Calls { get; private set; }

        public Exception? Throws { get; set; }

        public void Knows(Guid mbid, string title, string artist) => _known[mbid] = new ResolvedRecording(title, artist);

        public Task<ResolvedRecording?> ResolveAsync(Guid recordingMbid, CancellationToken cancellationToken)
        {
            Calls++;
            if (Throws is not null)
            {
                throw Throws;
            }

            return Task.FromResult(_known.GetValueOrDefault(recordingMbid));
        }
    }
}
