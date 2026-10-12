using System.Diagnostics;
using System.Diagnostics.Metrics;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Nodeable.Domain.Crawling;
using Nodeable.Domain.Entities;
using Nodeable.Domain.Enums;
using Nodeable.Infrastructure.Crawling;
using Nodeable.Infrastructure.Persistence;
using Nodeable.Tests.Containers;
using static Nodeable.Infrastructure.Tests.Crawling.CrawlTestSupport;

namespace Nodeable.Infrastructure.Tests.Crawling;

// The runner is built the way the Worker builds it (AddCrawling plus a handler registered for the job kind), against a
// real PostgreSQL. The handlers are fakes: what is under test is the lifecycle around them.
// A span listener is global to the process: while one is registered, every Nodeable span in every test is recorded and
// its trace context stored. Classes that register a listener, or assert that none exists, run one after the other.
[Collection(CrawlTestSupport.SpanListenerCollection)]
public class CrawlJobRunnerTests(PostgresFixture postgres)
{
    [Fact]
    public async Task NFR_REL_01_a_job_that_its_handler_finishes_is_marked_done()
    {
        var ct = TestContext.Current.CancellationToken;
        var handled = new List<long>();
        var (provider, connectionString) = await BuildAsync((job, _) => { handled.Add(job.Id); return Task.CompletedTask; });
        await using var _ = provider;
        await EnqueueAsync(provider, Mbid(1));
        var runner = provider.GetRequiredService<ICrawlJobRunner>();

        var ranJob = await runner.RunOnceAsync(ct);

        ranJob.Should().BeTrue();
        handled.Should().HaveCount(1);
        var job = (await JobsAsync(connectionString)).Single();
        job.Status.Should().Be(CrawlJobStatus.Done);
        job.Attempts.Should().Be(1);
        (await runner.RunOnceAsync(ct)).Should().BeFalse("the queue is empty now");
    }

    [Fact]
    public async Task NFR_REL_01_a_handler_that_throws_leaves_the_job_pending_with_its_error()
    {
        var ct = TestContext.Current.CancellationToken;
        var (provider, connectionString) = await BuildAsync((_, _) => throw new InvalidOperationException("MusicBrainz said no"));
        await using var _ = provider;
        await EnqueueAsync(provider, Mbid(1));
        var runner = provider.GetRequiredService<ICrawlJobRunner>();

        await runner.RunOnceAsync(ct);

        var job = (await JobsAsync(connectionString)).Single();
        job.Status.Should().Be(CrawlJobStatus.Pending);
        job.Attempts.Should().Be(1);
        job.LastError.Should().Be("MusicBrainz said no");
        job.RunAfter.Should().BeAfter(DateTimeOffset.UtcNow.AddSeconds(20));
    }

    [Fact]
    public async Task NFR_REL_01_a_job_whose_handler_keeps_throwing_ends_up_failed()
    {
        var ct = TestContext.Current.CancellationToken;
        var (provider, connectionString) = await BuildAsync(
            (_, _) => throw new InvalidOperationException("still no"),
            new() { ["Crawl:MaxAttempts"] = "2" });
        await using var _ = provider;
        await EnqueueAsync(provider, Mbid(1));
        var runner = provider.GetRequiredService<ICrawlJobRunner>();

        await runner.RunOnceAsync(ct);
        await SqlAsync(connectionString, $"UPDATE crawl_jobs SET run_after = now()");
        await runner.RunOnceAsync(ct);

        var job = (await JobsAsync(connectionString)).Single();
        job.Status.Should().Be(CrawlJobStatus.Failed);
        job.Attempts.Should().Be(2);
    }

    [Fact]
    public async Task NFR_REL_01_a_kind_with_no_handler_is_failed_at_once_not_retried()
    {
        var ct = TestContext.Current.CancellationToken;
        var (provider, connectionString) = await BuildAsync((_, _) => Task.CompletedTask);
        await using var _ = provider;
        await using (var scope = provider.CreateAsyncScope())
        {
            // Only Recording has a handler in this setup; a Preview job has none.
            await scope.ServiceProvider.GetRequiredService<ICrawlQueue>()
                .EnqueueAsync(CrawlJobKind.Preview, Mbid(1), CrawlPriority.Interactive, ct);
        }

        await provider.GetRequiredService<ICrawlJobRunner>().RunOnceAsync(ct);

        var job = (await JobsAsync(connectionString)).Single();
        job.Status.Should().Be(CrawlJobStatus.Failed);
        job.LastError.Should().Contain("No handler");
    }

    [Fact]
    public async Task NFR_REL_01_stopping_the_worker_hands_the_running_job_back_without_counting_the_attempt()
    {
        var ct = TestContext.Current.CancellationToken;
        var started = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var (provider, connectionString) = await BuildAsync(async (_, token) =>
        {
            started.SetResult();
            await Task.Delay(Timeout.Infinite, token);
        });
        await using var _ = provider;
        await EnqueueAsync(provider, Mbid(1));
        var runner = provider.GetRequiredService<ICrawlJobRunner>();
        using var stopping = CancellationTokenSource.CreateLinkedTokenSource(ct);

        var running = runner.RunOnceAsync(stopping.Token);
        await started.Task.WaitAsync(TimeSpan.FromSeconds(10), ct);
        await stopping.CancelAsync();
        Func<Task> act = () => running;

        await act.Should().ThrowAsync<OperationCanceledException>();
        var job = (await JobsAsync(connectionString)).Single();
        job.Status.Should().Be(CrawlJobStatus.Pending);
        job.Attempts.Should().Be(0);
        job.LockedBy.Should().BeNull();
    }

    [Fact]
    public async Task NFR_REL_01_a_job_left_running_by_a_crashed_worker_is_finished_by_another()
    {
        var ct = TestContext.Current.CancellationToken;
        var handled = new List<long>();
        var (provider, connectionString) = await BuildAsync((job, _) => { handled.Add(job.Id); return Task.CompletedTask; });
        await using var _ = provider;
        await EnqueueAsync(provider, Mbid(1));

        // The first worker claims the job and then dies: nothing ever completes or releases it.
        await using (var scope = provider.CreateAsyncScope())
        {
            await scope.ServiceProvider.GetRequiredService<ICrawlQueue>().ClaimNextAsync("crashed-worker", ct);
        }

        (await JobsAsync(connectionString)).Single().Status.Should().Be(CrawlJobStatus.Running);

        // Its lock ages past the timeout. A replacement worker recovers the job and runs it.
        await SqlAsync(connectionString, $"UPDATE crawl_jobs SET locked_at = now() - interval '1 hour'");
        var replacement = provider.GetRequiredService<ICrawlJobRunner>();
        (await replacement.RecoverStaleAsync(ct)).Should().Be(1);
        await replacement.RunOnceAsync(ct);

        handled.Should().HaveCount(1);
        var job = (await JobsAsync(connectionString)).Single();
        job.Status.Should().Be(CrawlJobStatus.Done);
        job.Attempts.Should().Be(2, "one attempt by the crashed worker and one by the replacement");
    }

    [Fact]
    public async Task NFR_OBS_01_the_job_span_continues_the_trace_of_the_request_that_queued_it()
    {
        var ct = TestContext.Current.CancellationToken;
        using var spans = new SpanCollector();
        var (provider, _) = await BuildAsync((_, _) => Task.CompletedTask);
        await using var _ = provider;
        var traceId = default(ActivityTraceId);

        // The "request": a span in which the song is queued.
        using (var request = spans.TestSource.StartActivity("test.request"))
        {
            traceId = request!.TraceId;
            await EnqueueAsync(provider, Mbid(1));
        }

        // Later, in a different context entirely (no current span), the Worker runs the job.
        Activity.Current = null;
        await provider.GetRequiredService<ICrawlJobRunner>().RunOnceAsync(ct);

        var enqueue = spans.Stopped.Single(a => a.OperationName == "crawl.enqueue" && a.TraceId == traceId);
        var job = spans.Stopped.Single(a => a.OperationName == "crawl.job" && a.TraceId == traceId);
        job.ParentSpanId.Should().Be(enqueue.SpanId);
        job.Kind.Should().Be(ActivityKind.Consumer);
        job.GetTagItem("crawl.kind").Should().Be("recording");
        job.GetTagItem("crawl.attempt").Should().Be(1);
        job.GetTagItem("crawl.queue_wait_ms").Should().NotBeNull();
    }

    [Fact]
    public async Task NFR_OBS_01_a_job_with_no_stored_trace_context_starts_a_trace_of_its_own()
    {
        var ct = TestContext.Current.CancellationToken;
        using var spans = new SpanCollector();
        var (provider, connectionString) = await BuildAsync((_, _) => Task.CompletedTask);
        await using var _ = provider;

        // A target of its own, because the listener also sees the spans of tests running in parallel.
        var target = Guid.NewGuid();
        await EnqueueAsync(provider, target);

        // Rows queued before tracing existed, or by something that was not traced, have no context stored.
        await SqlAsync(connectionString, $"UPDATE crawl_jobs SET traceparent = NULL");
        Activity.Current = null;

        await provider.GetRequiredService<ICrawlJobRunner>().RunOnceAsync(ct);

        var job = spans.Stopped.Single(a => a.OperationName == "crawl.job" && Equals(a.GetTagItem("crawl.target_mbid"), target));
        job.ParentSpanId.Should().Be(default(ActivitySpanId), "the job starts a trace of its own");
    }

    [Fact]
    public async Task NFR_OBS_01_duration_is_recorded_with_the_kind_and_how_the_job_ended()
    {
        var ct = TestContext.Current.CancellationToken;
        var measurements = new System.Collections.Concurrent.ConcurrentBag<(string Kind, string Outcome)>();
        using var meterListener = new MeterListener();
        meterListener.InstrumentPublished = (instrument, listener) =>
        {
            if (instrument.Meter.Name == "Nodeable.Infrastructure" && instrument.Name == "crawl.job.duration")
            {
                listener.EnableMeasurementEvents(instrument);
            }
        };
        meterListener.SetMeasurementEventCallback<double>((_, _, tags, _) =>
        {
            string? kind = null;
            string? outcome = null;
            foreach (var tag in tags)
            {
                if (tag.Key == "kind") { kind = tag.Value as string; }
                if (tag.Key == "outcome") { outcome = tag.Value as string; }
            }

            measurements.Add((kind ?? "", outcome ?? ""));
        });
        meterListener.Start();

        var (provider, _) = await BuildAsync((_, _) => Task.CompletedTask);
        await using var _ = provider;
        await EnqueueAsync(provider, Mbid(1));

        await provider.GetRequiredService<ICrawlJobRunner>().RunOnceAsync(ct);

        measurements.Should().Contain(("recording", "done"));
    }

    private async Task<(ServiceProvider Provider, string ConnectionString)> BuildAsync(
        Func<CrawlJob, CancellationToken, Task> handler,
        Dictionary<string, string?>? settings = null)
    {
        var connectionString = await NewDatabaseAsync(postgres);

        var services = new ServiceCollection();
        services.AddLogging();
        services.AddSingleton<IConfiguration>(new ConfigurationBuilder().AddInMemoryCollection(settings ?? []).Build());
        services.AddDbContext<NodeableDbContext>(options => options.UseNpgsql(connectionString).UseNodeableConventions());
        services.AddCrawling();
        services.AddKeyedSingleton<ICrawlJobHandler>(CrawlJobKind.Recording, new DelegateHandler(handler));

        return (services.BuildServiceProvider(), connectionString);
    }

    private static async Task EnqueueAsync(ServiceProvider provider, Guid mbid)
    {
        await using var scope = provider.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<ICrawlQueue>()
            .EnqueueAsync(CrawlJobKind.Recording, mbid, CrawlPriority.Interactive, TestContext.Current.CancellationToken);
    }

    private sealed class DelegateHandler(Func<CrawlJob, CancellationToken, Task> handler) : ICrawlJobHandler
    {
        public Task HandleAsync(CrawlJob job, CancellationToken cancellationToken) => handler(job, cancellationToken);
    }
}
