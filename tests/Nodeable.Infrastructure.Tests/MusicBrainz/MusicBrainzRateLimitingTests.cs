using System.Collections.Concurrent;
using Microsoft.Extensions.DependencyInjection;
using Nodeable.Infrastructure.MusicBrainz;
using Nodeable.Infrastructure.RateLimiting;
using Nodeable.Tests.Containers;
using WireMock.RequestBuilders;
using WireMock.ResponseBuilders;
using WireMock.Server;

namespace Nodeable.Infrastructure.Tests.MusicBrainz;

// The client, the real Redis rate gate and the retry pipeline together: what the Worker will actually run.
//
// The assertions are on the moments the gate released each request, recorded by a decorator around the real gate.
// That is what the gate controls. The moment a request reaches the server also includes connection setup and JIT
// time, which is latency, not rate limiting, and would make these tests depend on how warm the process is.
public sealed class MusicBrainzRateLimitingTests(RedisFixture redis) : IDisposable
{
    private static readonly Guid _workMbid = Guid.Parse("c44370d6-70af-454f-8381-021d1f7b6fac");

    private readonly WireMockServer _server = WireMockServer.Start();

    public void Dispose() => _server.Dispose();

    [Fact]
    public async Task NFR_RATE_01_concurrent_lookups_are_released_one_interval_apart()
    {
        var ct = TestContext.Current.CancellationToken;
        ServeWork();
        var (provider, gate) = await BuildAsync(interval: TimeSpan.FromMilliseconds(300));
        await using var _ = provider;
        var client = provider.GetRequiredService<IMusicBrainzClient>();

        await Task.WhenAll(Enumerable.Range(0, 4).Select(_ => client.GetWorkAsync(_workMbid, ct)));

        gate.ReleasedAt.Should().HaveCount(4);
        gate.Gaps().Should().OnlyContain(
            gap => gap >= TimeSpan.FromMilliseconds(250),
            "MusicBrainz must never be sent two requests closer than the interval");
        _server.LogEntries.Should().HaveCount(4);
    }

    [Fact]
    public async Task NFR_RATE_01_and_03_a_retry_goes_back_through_the_gate_for_its_own_slot()
    {
        var ct = TestContext.Current.CancellationToken;
        _server.Given(Request.Create().WithPath("/ws/2/work/*").UsingGet()).InScenario("busy-once")
            .WillSetStateTo("recovered")
            .RespondWith(Response.Create().WithStatusCode(503).WithBody(MusicBrainzTestHost.FixtureText("error-503.json")));
        _server.Given(Request.Create().WithPath("/ws/2/work/*").UsingGet()).InScenario("busy-once").WhenStateIs("recovered")
            .RespondWith(Response.Create().WithStatusCode(200).WithHeader("Content-Type", "application/json")
                .WithBody(MusicBrainzTestHost.FixtureText("work-lookup.json")));

        // The retry's own backoff is 10 ms. Had the retry skipped the gate it would have been sent about 10 ms after
        // the first attempt; going back through the gate puts it a full interval later.
        var (provider, gate) = await BuildAsync(interval: TimeSpan.FromMilliseconds(400));
        await using var _ = provider;
        var client = provider.GetRequiredService<IMusicBrainzClient>();

        var work = await client.GetWorkAsync(_workMbid, ct);

        work.Should().NotBeNull();
        _server.LogEntries.Should().HaveCount(2, "one attempt and one retry reached MusicBrainz");
        gate.ReleasedAt.Should().HaveCount(2, "the retry acquired a slot of its own");
        gate.Gaps().Should().ContainSingle().Which.Should().BeGreaterThanOrEqualTo(TimeSpan.FromMilliseconds(350));
    }

    [Fact]
    public async Task NFR_RATE_01_a_saturated_gate_fails_the_call_without_sending_a_request()
    {
        var ct = TestContext.Current.CancellationToken;
        ServeWork();

        // The interval is far longer than any test run, so the second call can never be given a slot by the clock moving
        // on: it has to wait longer than maxGateWait and is refused at once. (With 5 seconds a slow first call, on a
        // loaded machine, outlasted the interval and the second call was let through.)
        var (provider, _) = await BuildAsync(interval: TimeSpan.FromMinutes(5), maxGateWait: TimeSpan.FromMilliseconds(200));
        await using var _ = provider;
        var client = provider.GetRequiredService<IMusicBrainzClient>();
        await client.GetWorkAsync(_workMbid, ct);

        Func<Task> second = () => client.GetWorkAsync(_workMbid, ct);

        await second.Should().ThrowAsync<RateGateSaturatedException>();
        _server.LogEntries.Should().ContainSingle("the refused call must not have reached MusicBrainz");
    }

    private void ServeWork() =>
        _server.Given(Request.Create().WithPath("/ws/2/work/*").UsingGet())
            .RespondWith(Response.Create().WithStatusCode(200).WithHeader("Content-Type", "application/json")
                .WithBody(MusicBrainzTestHost.FixtureText("work-lookup.json")));

    // Each test gets its own gate, on its own Redis key: AddMusicBrainz uses the fixed resource "musicbrainz", which
    // tests running in parallel on one container would otherwise share.
    private async Task<(ServiceProvider Provider, RecordingGate Gate)> BuildAsync(TimeSpan interval, TimeSpan? maxGateWait = null)
    {
        var real = new RedisRateGate(
            await redis.ConnectAsync(),
            $"test-{Guid.NewGuid():N}",
            new RateGateOptions(interval, 1, maxGateWait ?? TimeSpan.FromSeconds(20)));
        var gate = new RecordingGate(real);

        return (MusicBrainzTestHost.Build(_server, gate), gate);
    }

    /// <summary>Wraps a gate and notes when each caller was let through.</summary>
    private sealed class RecordingGate(IRateGate inner) : IRateGate
    {
        private readonly ConcurrentQueue<DateTimeOffset> _released = new();

        public string Resource => inner.Resource;

        public IReadOnlyList<DateTimeOffset> ReleasedAt => [.. _released.Order()];

        public async Task<TimeSpan> AcquireAsync(CancellationToken cancellationToken = default)
        {
            var wait = await inner.AcquireAsync(cancellationToken);
            _released.Enqueue(DateTimeOffset.UtcNow);
            return wait;
        }

        public List<TimeSpan> Gaps()
        {
            var times = ReleasedAt;
            return times.Zip(times.Skip(1), (earlier, later) => later - earlier).ToList();
        }
    }
}
