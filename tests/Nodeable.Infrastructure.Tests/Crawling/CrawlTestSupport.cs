using System.Collections.Concurrent;
using System.Diagnostics;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Nodeable.Domain.Entities;
using Nodeable.Domain.Enums;
using Nodeable.Infrastructure.Crawling;
using Nodeable.Infrastructure.Persistence;
using Nodeable.Tests.Containers;

namespace Nodeable.Infrastructure.Tests.Crawling;

internal static class CrawlTestSupport
{
    /// <summary>The xUnit collection of every test class that registers a span listener (see <see cref="SpanCollector"/>).</summary>
    public const string SpanListenerCollection = "global span listener";

    /// <summary>A new, migrated database inside the shared PostgreSQL container.</summary>
    public static async Task<string> NewDatabaseAsync(PostgresFixture postgres)
    {
        var connectionString = await postgres.CreateDatabaseAsync();
        await using var db = Context(connectionString);
        await db.Database.MigrateAsync(TestContext.Current.CancellationToken);
        return connectionString;
    }

    public static NodeableDbContext Context(string connectionString)
    {
        var builder = new DbContextOptionsBuilder<NodeableDbContext>();
        builder.UseNpgsql(connectionString);
        builder.UseNodeableConventions();
        return new NodeableDbContext(builder.Options);
    }

    public static CrawlQueue Queue(NodeableDbContext db, CrawlOptions? options = null) =>
        new(db, Options.Create(options ?? new CrawlOptions()));

    public static Guid Mbid(int n) => new($"00000000-0000-0000-0000-{n:D12}");

    /// <summary>All jobs, oldest id first, read with a context of its own so nothing is served from a tracking cache.</summary>
    public static async Task<List<CrawlJob>> JobsAsync(string connectionString)
    {
        await using var db = Context(connectionString);
        return await db.CrawlJobs.AsNoTracking().OrderBy(j => j.Id).ToListAsync(TestContext.Current.CancellationToken);
    }

    /// <summary>Changes a job directly, for example to make its lock look an hour old.</summary>
    public static async Task SqlAsync(string connectionString, FormattableString sql)
    {
        await using var db = Context(connectionString);
        await db.Database.ExecuteSqlAsync(sql, TestContext.Current.CancellationToken);
    }

    public static CrawlJobKind Recording => CrawlJobKind.Recording;
}

/// <summary>Collects the spans started by Nodeable code (and by the tests themselves) while it is alive.</summary>
internal sealed class SpanCollector : IDisposable
{
    public const string TestSourceName = "Nodeable.Tests";

    private readonly ConcurrentQueue<Activity> _stopped = new();
    private readonly ActivityListener _listener;

    public SpanCollector()
    {
        _listener = new ActivityListener
        {
            ShouldListenTo = source => source.Name.StartsWith("Nodeable.", StringComparison.Ordinal),
            Sample = (ref ActivityCreationOptions<ActivityContext> _) => ActivitySamplingResult.AllDataAndRecorded,
            ActivityStopped = activity => _stopped.Enqueue(activity),
        };
        ActivitySource.AddActivityListener(_listener);
    }

    public ActivitySource TestSource { get; } = new(TestSourceName);

    public IReadOnlyList<Activity> Stopped => [.. _stopped];

    public void Dispose()
    {
        _listener.Dispose();
        TestSource.Dispose();
    }
}
