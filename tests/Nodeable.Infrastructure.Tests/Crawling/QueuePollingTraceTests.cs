using System.Collections.Concurrent;
using System.Diagnostics;
using Microsoft.EntityFrameworkCore;
using Nodeable.Tests.Containers;
using OpenTelemetry;
using OpenTelemetry.Trace;
using static Nodeable.Infrastructure.Tests.Crawling.CrawlTestSupport;

namespace Nodeable.Infrastructure.Tests.Crawling;

// A worker polls the queue every second and most polls find nothing. Each database call is traced by Npgsql, so
// without suppression an idle Worker adds a trace a second to the dashboard (measured: 204 after three and a half minutes).
// These tests use the real OpenTelemetry SDK, because the suppression is honoured by the SDK, not by .NET itself.
public class QueuePollingTraceTests(PostgresFixture postgres)
{
    [Fact]
    public async Task NFR_OBS_01_polling_an_empty_queue_does_not_create_database_spans()
    {
        var ct = TestContext.Current.CancellationToken;
        var connectionString = await NewDatabaseAsync(postgres);
        var recorded = new ConcurrentQueue<Activity>();
        using var provider = Sdk.CreateTracerProviderBuilder()
            .AddSource("Npgsql")
            .AddProcessor(new Collect(recorded))
            .Build();

        await using var db = Context(connectionString);
        var queue = Queue(db);

        // The control: a statement outside the suppressed scope is traced, so the SDK really is recording Npgsql spans.
        const string marker = "queue-polling-trace-control";
        await db.Database.ExecuteSqlRawAsync("SELECT 'queue-polling-trace-control'", ct);

        var claimed = await queue.ClaimNextAsync("worker-a", ct);
        await queue.RecoverStaleAsync(ct);

        claimed.Should().BeNull();
        var statements = recorded.SelectMany(a => a.TagObjects).Select(t => t.Value?.ToString() ?? string.Empty).ToList();
        statements.Should().Contain(s => s.Contains(marker, StringComparison.Ordinal), "the SDK is recording database spans");
        statements.Should().NotContain(s => s.Contains("SKIP LOCKED", StringComparison.Ordinal), "claiming is housekeeping");
        statements.Should().NotContain(s => s.Contains("locked_at <", StringComparison.Ordinal), "recovery is housekeeping");
    }

    private sealed class Collect(ConcurrentQueue<Activity> sink) : BaseProcessor<Activity>
    {
        public override void OnEnd(Activity data) => sink.Enqueue(data);
    }
}
