using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Nodeable.Infrastructure.Crawling;

namespace Nodeable.Worker.Tests;

// The worker loop is tested with a fake runner: what is under test is when it asks for work, when it rests and how it
// stops. The lifecycle of one job (claim, handler, retry, release) is tested in Nodeable.Infrastructure.Tests.
public class CrawlWorkerTests
{
    [Fact]
    public async Task NFR_REL_01_the_worker_recovers_abandoned_jobs_before_it_takes_new_ones()
    {
        var ct = TestContext.Current.CancellationToken;
        var runner = new FakeRunner();
        using var worker = NewWorker(runner, new CrawlOptions { PollInterval = TimeSpan.FromMilliseconds(5) });

        await worker.StartAsync(ct);
        await runner.WaitForRunsAsync(1);
        await worker.StopAsync(ct);

        runner.Calls.Should().StartWith(["recover", "run"]);
    }

    [Fact]
    public async Task NFR_REL_01_the_worker_takes_jobs_back_to_back_and_rests_only_when_the_queue_is_empty()
    {
        var ct = TestContext.Current.CancellationToken;
        var runner = new FakeRunner(hasWork: [true, true, true]);

        // An hour-long poll interval: if the worker rested after a job instead of asking again, the three jobs
        // would never run within the test's wait.
        using var worker = NewWorker(runner, new CrawlOptions { PollInterval = TimeSpan.FromHours(1) });

        await worker.StartAsync(ct);
        await runner.WaitForRunsAsync(4);
        await worker.StopAsync(ct);

        runner.Calls.Count(c => c == "run").Should().Be(4, "three jobs, then one empty poll before the long rest");
    }

    [Fact]
    public async Task NFR_REL_01_the_worker_keeps_polling_while_the_queue_is_empty()
    {
        var ct = TestContext.Current.CancellationToken;
        var runner = new FakeRunner();
        using var worker = NewWorker(runner, new CrawlOptions { PollInterval = TimeSpan.FromMilliseconds(5) });

        await worker.StartAsync(ct);
        await runner.WaitForRunsAsync(5);
        await worker.StopAsync(ct);

        runner.Calls.Count(c => c == "run").Should().BeGreaterThanOrEqualTo(5);
    }

    [Fact]
    public async Task NFR_REL_01_an_unexpected_error_does_not_end_the_worker()
    {
        var ct = TestContext.Current.CancellationToken;
        var runner = new FakeRunner(throwOnRun: 1);
        using var worker = NewWorker(runner, new CrawlOptions { PollInterval = TimeSpan.FromMilliseconds(5), ErrorDelay = TimeSpan.FromMilliseconds(5) });

        await worker.StartAsync(ct);
        await runner.WaitForRunsAsync(3);
        await worker.StopAsync(ct);

        runner.Calls.Count(c => c == "run").Should().BeGreaterThanOrEqualTo(3, "it carried on after the exception on the first run");
    }

    [Fact]
    public async Task NFR_REL_01_the_worker_stops_promptly_when_cancellation_is_requested()
    {
        var ct = TestContext.Current.CancellationToken;
        var runner = new FakeRunner();
        using var worker = NewWorker(runner, new CrawlOptions { PollInterval = TimeSpan.FromHours(1) });

        await worker.StartAsync(ct);
        await runner.WaitForRunsAsync(1);
        await worker.StopAsync(ct).WaitAsync(TimeSpan.FromSeconds(5), ct);

        // The poll interval is an hour, so finishing inside the timeout shows the wait was cancelled, not waited out.
        worker.ExecuteTask.Should().NotBeNull();
        worker.ExecuteTask!.IsCompleted.Should().BeTrue();
    }

    private static CrawlWorker NewWorker(ICrawlJobRunner runner, CrawlOptions options) =>
        new(runner, Options.Create(options), NullLogger<CrawlWorker>.Instance);

    private sealed class FakeRunner(bool[]? hasWork = null, int? throwOnRun = null) : ICrawlJobRunner
    {
        private readonly object _gate = new();
        private readonly List<string> _calls = [];
        private readonly Queue<bool> _work = new(hasWork ?? []);
        private readonly List<(int Count, TaskCompletionSource Done)> _waiters = [];
        private int _runs;

        public IReadOnlyList<string> Calls
        {
            get
            {
                lock (_gate)
                {
                    return [.. _calls];
                }
            }
        }

        public Task<bool> RunOnceAsync(CancellationToken cancellationToken)
        {
            lock (_gate)
            {
                _calls.Add("run");
                _runs++;
                foreach (var (count, done) in _waiters.Where(w => _runs >= w.Count))
                {
                    done.TrySetResult();
                }

                if (throwOnRun == _runs)
                {
                    throw new InvalidOperationException("the database is unreachable");
                }

                return Task.FromResult(_work.Count > 0 && _work.Dequeue());
            }
        }

        public Task<int> RecoverStaleAsync(CancellationToken cancellationToken)
        {
            lock (_gate)
            {
                _calls.Add("recover");
            }

            return Task.FromResult(0);
        }

        public Task WaitForRunsAsync(int count)
        {
            TaskCompletionSource done;
            lock (_gate)
            {
                done = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
                if (_runs >= count)
                {
                    done.SetResult();
                }
                else
                {
                    _waiters.Add((count, done));
                }
            }

            return done.Task.WaitAsync(TimeSpan.FromSeconds(10));
        }
    }
}
