using System.Diagnostics;
using Nodeable.Domain.Crawling;
using Nodeable.Domain.Enums;
using Nodeable.Infrastructure.Crawling;
using Nodeable.Tests.Containers;
using Npgsql;
using static Nodeable.Infrastructure.Tests.Crawling.CrawlTestSupport;

namespace Nodeable.Infrastructure.Tests.Crawling;

// The queue is SQL, so these run against a real PostgreSQL: a fake could not show that two workers never claim the
// same row, which is the whole point of FOR UPDATE SKIP LOCKED.
public class CrawlQueueTests(PostgresFixture postgres)
{
    [Fact]
    public async Task NFR_REL_01_enqueue_stores_one_pending_job_with_the_callers_trace_context()
    {
        var ct = TestContext.Current.CancellationToken;
        using var spans = new SpanCollector();
        var connectionString = await NewDatabaseAsync(postgres);
        await using var db = Context(connectionString);

        using var request = spans.TestSource.StartActivity("test.request")!;
        var result = await Queue(db).EnqueueAsync(Recording, Mbid(1), CrawlPriority.Interactive, ct);

        result.Should().Be(EnqueueResult.Enqueued);
        var job = (await JobsAsync(connectionString)).Should().ContainSingle().Subject;
        job.Status.Should().Be(CrawlJobStatus.Pending);
        job.Kind.Should().Be(CrawlJobKind.Recording);
        job.Priority.Should().Be(CrawlPriority.Interactive);
        job.Attempts.Should().Be(0);

        // The stored context is the crawl.enqueue span's, which is a child of the request's span in the same trace.
        // The listener sees spans from tests running in parallel too, so the span is picked out by trace.
        var enqueue = spans.Stopped.Single(a => a.OperationName == "crawl.enqueue" && a.TraceId == request.TraceId);
        enqueue.TraceId.Should().Be(request.TraceId);
        job.Traceparent.Should().Be($"00-{enqueue.TraceId}-{enqueue.SpanId}-01");
    }

    [Fact]
    public async Task NFR_REL_01_enqueue_without_any_trace_stores_no_context()
    {
        var ct = TestContext.Current.CancellationToken;
        var connectionString = await NewDatabaseAsync(postgres);
        await using var db = Context(connectionString);

        await Queue(db).EnqueueAsync(Recording, Mbid(1), CrawlPriority.Interactive, ct);

        (await JobsAsync(connectionString)).Single().Traceparent.Should().BeNull();
    }

    [Fact]
    public async Task NFR_REL_01_the_same_fetch_is_not_queued_twice_while_it_is_outstanding()
    {
        var ct = TestContext.Current.CancellationToken;
        var connectionString = await NewDatabaseAsync(postgres);
        await using var db = Context(connectionString);
        var queue = Queue(db);

        var first = await queue.EnqueueAsync(Recording, Mbid(1), CrawlPriority.Interactive, ct);
        var second = await queue.EnqueueAsync(Recording, Mbid(1), CrawlPriority.Interactive, ct);
        var claimed = await queue.ClaimNextAsync("worker-a", ct);
        var whileRunning = await queue.EnqueueAsync(Recording, Mbid(1), CrawlPriority.Interactive, ct);

        first.Should().Be(EnqueueResult.Enqueued);
        second.Should().Be(EnqueueResult.AlreadyQueued);
        whileRunning.Should().Be(EnqueueResult.AlreadyQueued);
        (await JobsAsync(connectionString)).Should().ContainSingle();

        // Once it is done it is history, so the same target can be fetched again later (a stale-cache refresh).
        await queue.CompleteAsync(claimed!, "worker-a", ct);
        var afterDone = await queue.EnqueueAsync(Recording, Mbid(1), CrawlPriority.Scheduled, ct);

        afterDone.Should().Be(EnqueueResult.Enqueued);
        (await JobsAsync(connectionString)).Should().HaveCount(2);
    }

    [Fact]
    public async Task NFR_REL_01_a_different_kind_or_target_is_a_different_job()
    {
        var ct = TestContext.Current.CancellationToken;
        var connectionString = await NewDatabaseAsync(postgres);
        await using var db = Context(connectionString);
        var queue = Queue(db);

        await queue.EnqueueAsync(CrawlJobKind.Recording, Mbid(1), CrawlPriority.Interactive, ct);
        await queue.EnqueueAsync(CrawlJobKind.Work, Mbid(1), CrawlPriority.Interactive, ct);
        await queue.EnqueueAsync(CrawlJobKind.Recording, Mbid(2), CrawlPriority.Interactive, ct);

        (await JobsAsync(connectionString)).Should().HaveCount(3);
    }

    [Fact]
    public async Task NFR_REL_01_a_person_asking_for_a_waiting_background_job_moves_it_up()
    {
        var ct = TestContext.Current.CancellationToken;
        var connectionString = await NewDatabaseAsync(postgres);
        await using var db = Context(connectionString);
        var queue = Queue(db);
        await queue.EnqueueAsync(Recording, Mbid(1), CrawlPriority.Scheduled, ct);

        var result = await queue.EnqueueAsync(Recording, Mbid(1), CrawlPriority.Interactive, ct);

        result.Should().Be(EnqueueResult.AlreadyQueued);
        (await JobsAsync(connectionString)).Single().Priority.Should().Be(CrawlPriority.Interactive);

        // And never the other way: a background request must not demote what a person is waiting for.
        await queue.EnqueueAsync(Recording, Mbid(1), CrawlPriority.Scheduled, ct);
        (await JobsAsync(connectionString)).Single().Priority.Should().Be(CrawlPriority.Interactive);
    }

    [Fact]
    public async Task NFR_REL_01_claim_takes_the_highest_priority_first_then_the_oldest()
    {
        var ct = TestContext.Current.CancellationToken;
        var connectionString = await NewDatabaseAsync(postgres);
        await using var db = Context(connectionString);
        var queue = Queue(db);
        await queue.EnqueueAsync(Recording, Mbid(1), CrawlPriority.Scheduled, ct);
        await queue.EnqueueAsync(Recording, Mbid(2), CrawlPriority.Interactive, ct);
        await queue.EnqueueAsync(Recording, Mbid(3), CrawlPriority.Interactive, ct);

        var order = new List<Guid>();
        while (await queue.ClaimNextAsync("worker-a", ct) is { } job)
        {
            order.Add(job.TargetMbid);
        }

        order.Should().Equal(Mbid(2), Mbid(3), Mbid(1));
    }

    [Fact]
    public async Task NFR_REL_01_claim_marks_the_job_running_for_the_worker_and_counts_the_attempt()
    {
        var ct = TestContext.Current.CancellationToken;
        var connectionString = await NewDatabaseAsync(postgres);
        await using var db = Context(connectionString);
        var queue = Queue(db);
        await queue.EnqueueAsync(Recording, Mbid(1), CrawlPriority.Interactive, ct);

        var claimed = await queue.ClaimNextAsync("worker-a", ct);

        claimed.Should().NotBeNull();
        claimed!.Status.Should().Be(CrawlJobStatus.Running);
        claimed.Attempts.Should().Be(1);
        claimed.LockedBy.Should().Be("worker-a");
        claimed.LockedAt.Should().BeCloseTo(DateTimeOffset.UtcNow, TimeSpan.FromSeconds(30));

        var stored = (await JobsAsync(connectionString)).Single();
        stored.Status.Should().Be(CrawlJobStatus.Running);
        stored.LockedBy.Should().Be("worker-a");
        (await queue.ClaimNextAsync("worker-b", ct)).Should().BeNull("a running job is not claimable");
    }

    [Fact]
    public async Task NFR_REL_01_claim_leaves_alone_jobs_that_are_not_due_yet()
    {
        var ct = TestContext.Current.CancellationToken;
        var connectionString = await NewDatabaseAsync(postgres);
        await using var db = Context(connectionString);
        var queue = Queue(db);
        await queue.EnqueueAsync(Recording, Mbid(1), CrawlPriority.Interactive, ct);
        await SqlAsync(connectionString, $"UPDATE crawl_jobs SET run_after = now() + interval '1 hour'");

        (await queue.ClaimNextAsync("worker-a", ct)).Should().BeNull();
    }

    [Fact]
    public async Task NFR_REL_01_claim_skips_a_row_another_worker_holds_instead_of_waiting_for_it()
    {
        var ct = TestContext.Current.CancellationToken;
        var connectionString = await NewDatabaseAsync(postgres);
        await using var db = Context(connectionString);
        var queue = Queue(db);
        await queue.EnqueueAsync(Recording, Mbid(1), CrawlPriority.Interactive, ct);
        await queue.EnqueueAsync(Recording, Mbid(2), CrawlPriority.Scheduled, ct);

        // Another worker is in the middle of claiming the best job: its transaction holds that row's lock.
        await using var other = new NpgsqlConnection(connectionString);
        await other.OpenAsync(ct);
        await using var transaction = await other.BeginTransactionAsync(ct);
        await using (var hold = new NpgsqlCommand(
            "SELECT id FROM crawl_jobs WHERE target_mbid = '00000000-0000-0000-0000-000000000001' FOR UPDATE", other, transaction))
        {
            await hold.ExecuteScalarAsync(ct);
        }

        // Without SKIP LOCKED this call would block until the other transaction ends, which never happens here. The
        // timeout turns that into a failing test instead of a hung one.
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(TimeSpan.FromSeconds(10));
        var started = Stopwatch.GetTimestamp();
        var claimed = await queue.ClaimNextAsync("worker-a", timeout.Token);
        var elapsed = Stopwatch.GetElapsedTime(started);

        claimed.Should().NotBeNull();
        claimed!.TargetMbid.Should().Be(Mbid(2), "the held row was skipped and the next job was taken");
        elapsed.Should().BeLessThan(TimeSpan.FromSeconds(5));
    }

    [Fact]
    public async Task NFR_REL_01_many_workers_claiming_at_once_never_get_the_same_job()
    {
        var ct = TestContext.Current.CancellationToken;
        var connectionString = await NewDatabaseAsync(postgres);
        await using (var setup = Context(connectionString))
        {
            var queue = Queue(setup);
            for (var i = 1; i <= 30; i++)
            {
                await queue.EnqueueAsync(Recording, Mbid(i), CrawlPriority.Interactive, ct);
            }
        }

        // Eight workers, each with its own connection, pull until the queue is empty.
        var claimedIds = await Task.WhenAll(Enumerable.Range(0, 8).Select(async worker =>
        {
            var ids = new List<long>();
            await using var db = Context(connectionString);
            var queue = Queue(db);
            while (await queue.ClaimNextAsync($"worker-{worker}", ct) is { } job)
            {
                ids.Add(job.Id);
            }

            return ids;
        }));

        var all = claimedIds.SelectMany(ids => ids).ToList();
        all.Should().HaveCount(30, "every job was claimed");
        all.Should().OnlyHaveUniqueItems("no job was claimed by two workers");
    }

    [Fact]
    public async Task NFR_REL_01_complete_marks_done_and_clears_the_lock()
    {
        var ct = TestContext.Current.CancellationToken;
        var connectionString = await NewDatabaseAsync(postgres);
        await using var db = Context(connectionString);
        var queue = Queue(db);
        await queue.EnqueueAsync(Recording, Mbid(1), CrawlPriority.Interactive, ct);
        var job = await queue.ClaimNextAsync("worker-a", ct);

        var completed = await queue.CompleteAsync(job!, "worker-a", ct);

        completed.Should().BeTrue();
        var stored = (await JobsAsync(connectionString)).Single();
        stored.Status.Should().Be(CrawlJobStatus.Done);
        stored.LockedBy.Should().BeNull();
        stored.LockedAt.Should().BeNull();
    }

    [Fact]
    public async Task NFR_REL_01_a_worker_that_lost_its_lock_cannot_complete_the_job()
    {
        var ct = TestContext.Current.CancellationToken;
        var connectionString = await NewDatabaseAsync(postgres);
        await using var db = Context(connectionString);
        var queue = Queue(db);
        await queue.EnqueueAsync(Recording, Mbid(1), CrawlPriority.Interactive, ct);
        var job = await queue.ClaimNextAsync("worker-a", ct);

        // worker-a was too slow: its lock expired, and worker-b took the job.
        await SqlAsync(connectionString, $"UPDATE crawl_jobs SET locked_by = 'worker-b'");

        (await queue.CompleteAsync(job!, "worker-a", ct)).Should().BeFalse();
        (await queue.FailAsync(job!, "worker-a", "late", cancellationToken: ct)).Should().Be(FailResult.LockLost);
        var stored = (await JobsAsync(connectionString)).Single();
        stored.Status.Should().Be(CrawlJobStatus.Running);
        stored.LockedBy.Should().Be("worker-b");
    }

    [Fact]
    public async Task NFR_REL_01_a_failed_attempt_goes_back_to_pending_after_a_backoff()
    {
        var ct = TestContext.Current.CancellationToken;
        var connectionString = await NewDatabaseAsync(postgres);
        await using var db = Context(connectionString);
        var queue = Queue(db);
        await queue.EnqueueAsync(Recording, Mbid(1), CrawlPriority.Interactive, ct);
        var job = await queue.ClaimNextAsync("worker-a", ct);

        var result = await queue.FailAsync(job!, "worker-a", "MusicBrainz was busy", cancellationToken: ct);

        result.Should().Be(FailResult.WillRetry);
        var stored = (await JobsAsync(connectionString)).Single();
        stored.Status.Should().Be(CrawlJobStatus.Pending);
        stored.Attempts.Should().Be(1);
        stored.LastError.Should().Be("MusicBrainz was busy");
        stored.LockedBy.Should().BeNull();

        // 30 s base delay, spread by up to 20%: well in the future, so it is not claimable now.
        stored.RunAfter.Should().BeAfter(DateTimeOffset.UtcNow.AddSeconds(20));
        (await queue.ClaimNextAsync("worker-a", ct)).Should().BeNull();
    }

    [Fact]
    public async Task NFR_REL_01_a_job_that_uses_all_its_attempts_is_marked_failed()
    {
        var ct = TestContext.Current.CancellationToken;
        var connectionString = await NewDatabaseAsync(postgres);
        await using var db = Context(connectionString);
        var queue = Queue(db, new CrawlOptions { MaxAttempts = 2 });
        await queue.EnqueueAsync(Recording, Mbid(1), CrawlPriority.Interactive, ct);

        var first = await queue.ClaimNextAsync("worker-a", ct);
        (await queue.FailAsync(first!, "worker-a", "boom 1", cancellationToken: ct)).Should().Be(FailResult.WillRetry);
        await SqlAsync(connectionString, $"UPDATE crawl_jobs SET run_after = now()");
        var second = await queue.ClaimNextAsync("worker-a", ct);
        var result = await queue.FailAsync(second!, "worker-a", "boom 2", cancellationToken: ct);

        result.Should().Be(FailResult.Failed);
        var stored = (await JobsAsync(connectionString)).Single();
        stored.Status.Should().Be(CrawlJobStatus.Failed);
        stored.Attempts.Should().Be(2);
        stored.LastError.Should().Be("boom 2");
    }

    [Fact]
    public async Task NFR_REL_01_a_permanent_failure_is_not_retried()
    {
        var ct = TestContext.Current.CancellationToken;
        var connectionString = await NewDatabaseAsync(postgres);
        await using var db = Context(connectionString);
        var queue = Queue(db);
        await queue.EnqueueAsync(Recording, Mbid(1), CrawlPriority.Interactive, ct);
        var job = await queue.ClaimNextAsync("worker-a", ct);

        var result = await queue.FailAsync(job!, "worker-a", "no handler", permanent: true, cancellationToken: ct);

        result.Should().Be(FailResult.Failed);
        (await JobsAsync(connectionString)).Single().Status.Should().Be(CrawlJobStatus.Failed);
    }

    [Fact]
    public async Task NFR_REL_01_a_released_job_is_claimable_at_once_and_the_attempt_is_not_counted()
    {
        var ct = TestContext.Current.CancellationToken;
        var connectionString = await NewDatabaseAsync(postgres);
        await using var db = Context(connectionString);
        var queue = Queue(db);
        await queue.EnqueueAsync(Recording, Mbid(1), CrawlPriority.Interactive, ct);
        var job = await queue.ClaimNextAsync("worker-a", ct);

        var released = await queue.ReleaseAsync(job!, "worker-a", ct);

        released.Should().BeTrue();
        var again = await queue.ClaimNextAsync("worker-b", ct);
        again.Should().NotBeNull();
        again!.Id.Should().Be(job!.Id);
        again.Attempts.Should().Be(1, "the attempt cut short by the shutdown did not count");
    }

    [Fact]
    public async Task NFR_REL_01_jobs_abandoned_by_a_dead_worker_go_back_to_the_queue()
    {
        var ct = TestContext.Current.CancellationToken;
        var connectionString = await NewDatabaseAsync(postgres);
        await using var db = Context(connectionString);
        var queue = Queue(db);
        await queue.EnqueueAsync(Recording, Mbid(1), CrawlPriority.Interactive, ct);
        await queue.EnqueueAsync(Recording, Mbid(2), CrawlPriority.Interactive, ct);
        await queue.ClaimNextAsync("dead-worker", ct);
        await queue.ClaimNextAsync("live-worker", ct);

        // The first worker has been silent for an hour; the second claimed its job a moment ago.
        await SqlAsync(connectionString, $"UPDATE crawl_jobs SET locked_at = now() - interval '1 hour' WHERE locked_by = 'dead-worker'");
        var recovered = await queue.RecoverStaleAsync(ct);

        recovered.Should().Be(1);
        var jobs = await JobsAsync(connectionString);
        jobs.Single(j => j.TargetMbid == Mbid(1)).Status.Should().Be(CrawlJobStatus.Pending);
        jobs.Single(j => j.TargetMbid == Mbid(2)).Status.Should().Be(CrawlJobStatus.Running);
        (await queue.ClaimNextAsync("new-worker", ct))!.TargetMbid.Should().Be(Mbid(1));
    }

    [Fact]
    public async Task NFR_REL_01_a_job_that_keeps_killing_its_worker_is_eventually_failed()
    {
        var ct = TestContext.Current.CancellationToken;
        var connectionString = await NewDatabaseAsync(postgres);
        await using var db = Context(connectionString);
        var queue = Queue(db, new CrawlOptions { MaxAttempts = 2 });
        await queue.EnqueueAsync(Recording, Mbid(1), CrawlPriority.Interactive, ct);

        // Two workers in a row claim it and die without a word.
        for (var i = 0; i < 2; i++)
        {
            await queue.ClaimNextAsync($"worker-{i}", ct);
            await SqlAsync(connectionString, $"UPDATE crawl_jobs SET locked_at = now() - interval '1 hour'");
            await queue.RecoverStaleAsync(ct);
        }

        var stored = (await JobsAsync(connectionString)).Single();
        stored.Status.Should().Be(CrawlJobStatus.Failed);
        stored.Attempts.Should().Be(2);
        stored.LastError.Should().Contain("worker stopped");
    }
}
