using Nodeable.Infrastructure.RateLimiting;
using Nodeable.Tests.Containers;

namespace Nodeable.Infrastructure.Tests.RateLimiting;

// These run the real Lua script on a real Redis (Testcontainers). Waits are asserted with a tolerance of 100 ms:
// the script decides each wait from Redis's own clock, so the numbers are exact up to scheduling noise.
public class RedisRateGateTests(RedisFixture redis)
{
    private static readonly TimeSpan _tolerance = TimeSpan.FromMilliseconds(100);

    [Fact]
    public async Task NFR_RATE_01_concurrent_requests_are_spaced_one_interval_apart()
    {
        var ct = TestContext.Current.CancellationToken;
        var connection = await redis.ConnectAsync();
        var gate = new RedisRateGate(connection, UniqueResource(), new RateGateOptions(TimeSpan.FromMilliseconds(200), 1, TimeSpan.FromSeconds(10)));

        // Five callers arrive at once. The gate hands them consecutive slots instead of letting them through together.
        var waits = await Task.WhenAll(Enumerable.Range(0, 5).Select(_ => gate.AcquireAsync(ct)));

        waits.Order().Select(w => w.TotalMilliseconds).Should().BeEquivalentTo(
            new[] { 0d, 200, 400, 600, 800 },
            options => options.WithStrictOrdering().Using<double>(c => c.Subject.Should().BeApproximately(c.Expectation, _tolerance.TotalMilliseconds)).WhenTypeIs<double>());
    }

    [Fact]
    public async Task NFR_RATE_01_two_instances_share_one_budget()
    {
        var ct = TestContext.Current.CancellationToken;
        var resource = UniqueResource();
        var options = new RateGateOptions(TimeSpan.FromMilliseconds(200), 1, TimeSpan.FromSeconds(10));

        // Two connections stand in for two Worker processes: nothing but Redis connects them.
        var instanceA = new RedisRateGate(await redis.ConnectAsync(), resource, options);
        var instanceB = new RedisRateGate(await redis.ConnectAsync(), resource, options);

        var waits = await Task.WhenAll(
            Enumerable.Range(0, 3).Select(_ => instanceA.AcquireAsync(ct))
                .Concat(Enumerable.Range(0, 3).Select(_ => instanceB.AcquireAsync(ct))));

        // Six requests, one budget: the last has to wait five intervals, not two.
        waits.Max().TotalMilliseconds.Should().BeApproximately(1000, _tolerance.TotalMilliseconds);
        waits.Count(w => w < TimeSpan.FromMilliseconds(50)).Should().Be(1, "only one request may go straight away");
    }

    [Fact]
    public async Task NFR_RATE_01_a_burst_goes_through_immediately_and_the_rest_are_spaced()
    {
        var ct = TestContext.Current.CancellationToken;
        var gate = new RedisRateGate(await redis.ConnectAsync(), UniqueResource(), new RateGateOptions(TimeSpan.FromMilliseconds(300), 3, TimeSpan.FromSeconds(10)));

        var waits = new List<TimeSpan>();
        for (var i = 0; i < 4; i++)
        {
            waits.Add(await gate.AcquireAsync(ct));
        }

        // The first three use the bucket's capacity; the fourth waits for a token to be refilled.
        waits.Take(3).Should().OnlyContain(w => w < TimeSpan.FromMilliseconds(50));
        waits[3].TotalMilliseconds.Should().BeApproximately(300, _tolerance.TotalMilliseconds);
    }

    [Fact]
    public async Task NFR_RATE_01_a_quiet_period_refills_the_bucket()
    {
        var ct = TestContext.Current.CancellationToken;
        var gate = new RedisRateGate(await redis.ConnectAsync(), UniqueResource(), new RateGateOptions(TimeSpan.FromMilliseconds(150), 1, TimeSpan.FromSeconds(10)));

        await gate.AcquireAsync(ct);
        await Task.Delay(TimeSpan.FromMilliseconds(250), ct);
        var wait = await gate.AcquireAsync(ct);

        wait.Should().BeLessThan(TimeSpan.FromMilliseconds(50));
    }

    [Fact]
    public async Task NFR_RATE_01_the_gate_refuses_instead_of_queueing_past_its_maximum_wait()
    {
        var ct = TestContext.Current.CancellationToken;
        var gate = new RedisRateGate(await redis.ConnectAsync(), UniqueResource(), new RateGateOptions(TimeSpan.FromSeconds(1), 1, TimeSpan.FromMilliseconds(500)));
        await gate.AcquireAsync(ct);

        // The next free slot is a second away, which is more than the gate is allowed to make a caller wait.
        Func<Task> second = () => gate.AcquireAsync(ct);

        var thrown = await second.Should().ThrowAsync<RateGateSaturatedException>();
        thrown.Which.Resource.Should().Be(gate.Resource);
        thrown.Which.MaxWait.Should().Be(TimeSpan.FromMilliseconds(500));
    }

    [Fact]
    public async Task NFR_RATE_01_a_refused_request_does_not_use_up_a_slot()
    {
        var ct = TestContext.Current.CancellationToken;
        var gate = new RedisRateGate(await redis.ConnectAsync(), UniqueResource(), new RateGateOptions(TimeSpan.FromMilliseconds(400), 1, TimeSpan.FromMilliseconds(100)));
        await gate.AcquireAsync(ct);

        // Several refused callers in a row must not push the next slot further and further away.
        for (var i = 0; i < 5; i++)
        {
            Func<Task> refused = () => gate.AcquireAsync(ct);
            await refused.Should().ThrowAsync<RateGateSaturatedException>();
        }

        await Task.Delay(TimeSpan.FromMilliseconds(450), ct);
        var wait = await gate.AcquireAsync(ct);

        wait.Should().BeLessThan(TimeSpan.FromMilliseconds(50));
    }

    [Fact]
    public async Task NFR_RATE_01_different_resources_do_not_share_a_budget()
    {
        var ct = TestContext.Current.CancellationToken;
        var connection = await redis.ConnectAsync();
        var options = new RateGateOptions(TimeSpan.FromSeconds(1), 1, TimeSpan.FromSeconds(10));
        var musicBrainz = new RedisRateGate(connection, UniqueResource(), options);
        var discogs = new RedisRateGate(connection, UniqueResource(), options);

        var first = await musicBrainz.AcquireAsync(ct);
        var other = await discogs.AcquireAsync(ct);

        first.Should().Be(TimeSpan.Zero);
        other.Should().Be(TimeSpan.Zero);
    }

    [Fact]
    public async Task NFR_OBS_01_the_time_a_request_waited_is_recorded_per_source()
    {
        var ct = TestContext.Current.CancellationToken;
        var resource = UniqueResource();
        var waited = new System.Collections.Concurrent.ConcurrentBag<double>();
        using var listener = new System.Diagnostics.Metrics.MeterListener();
        listener.InstrumentPublished = (instrument, meterListener) =>
        {
            if (instrument.Meter.Name == "Nodeable.Infrastructure" && instrument.Name == "ratelimit.wait")
            {
                meterListener.EnableMeasurementEvents(instrument);
            }
        };
        listener.SetMeasurementEventCallback<double>((_, value, tags, _) =>
        {
            foreach (var tag in tags)
            {
                if (tag.Key == "source" && Equals(tag.Value, resource))
                {
                    waited.Add(value);
                }
            }
        });
        listener.Start();
        var gate = new RedisRateGate(await redis.ConnectAsync(), resource, new RateGateOptions(TimeSpan.FromMilliseconds(200), 1, TimeSpan.FromSeconds(10)));

        await gate.AcquireAsync(ct);
        await gate.AcquireAsync(ct);

        waited.Should().HaveCount(2);
        waited.Max().Should().BeApproximately(0.2, 0.1);
    }

    // Each test uses its own resource name, so tests that share the Redis container cannot affect each other.
    private static string UniqueResource() => $"test-{Guid.NewGuid():N}";
}
