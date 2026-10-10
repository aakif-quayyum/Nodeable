using System.Diagnostics;
using Microsoft.Extensions.Logging.Abstractions;

namespace Nodeable.Worker.Tests;

public class CrawlWorkerTests
{
    [Fact]
    public async Task NFR_OBS_01_worker_emits_a_heartbeat_span_when_started()
    {
        var ct = TestContext.Current.CancellationToken;
        var heartbeat = new TaskCompletionSource<Activity>(TaskCreationOptions.RunContinuationsAsynchronously);

        using var listener = new ActivityListener
        {
            ShouldListenTo = source => source.Name == CrawlWorker.ActivitySourceName,
            Sample = (ref ActivityCreationOptions<ActivityContext> _) => ActivitySamplingResult.AllDataAndRecorded,
            ActivityStopped = activity => heartbeat.TrySetResult(activity),
        };
        ActivitySource.AddActivityListener(listener);

        using var worker = new CrawlWorker(NullLogger<CrawlWorker>.Instance);

        await worker.StartAsync(ct);
        var span = await heartbeat.Task.WaitAsync(TimeSpan.FromSeconds(5), ct);
        await worker.StopAsync(ct);

        Assert.Equal("worker.heartbeat", span.OperationName);
        Assert.Equal(nameof(CrawlWorker), span.GetTagItem("worker.name"));
    }

    [Fact]
    public async Task NFR_REL_01_worker_stops_promptly_when_cancellation_is_requested()
    {
        var ct = TestContext.Current.CancellationToken;
        using var worker = new CrawlWorker(NullLogger<CrawlWorker>.Instance);

        await worker.StartAsync(ct);
        await worker.StopAsync(ct).WaitAsync(TimeSpan.FromSeconds(5), ct);

        // The heartbeat interval is 30 s, so finishing well inside the 5 s timeout shows the delay was cancelled, not waited out.
        Assert.True(worker.ExecuteTask is { IsCompleted: true });
    }
}
