using System.Diagnostics;
using Nodeable.ServiceDefaults;
using OpenTelemetry.Trace;

namespace Nodeable.Api.Tests;

public class TracingNoiseTests
{
    private static SamplingResult Decide(string name, ActivityContext parent = default) =>
        new IgnoreHealthCheckPingSampler().ShouldSample(new SamplingParameters(
            parent,
            ActivityTraceId.CreateRandom(),
            name,
            ActivityKind.Client,
            tags: null,
            links: null));

    // Found by running the real stack: the AppHost probes /health every 30 seconds, the HTTP span is filtered, and the
    // Redis check's PING became a trace of its own, one every 30 seconds on an idle system.
    [Fact]
    public void NFR_OBS_01_the_redis_health_check_ping_is_not_recorded()
    {
        Decide("PING").Decision.Should().Be(SamplingDecision.Drop);
    }

    [Fact]
    public void NFR_OBS_01_every_other_span_is_recorded_as_before()
    {
        Decide("EVALSHA").Decision.Should().Be(SamplingDecision.RecordAndSample);
        Decide("search.recordings").Decision.Should().Be(SamplingDecision.RecordAndSample);
    }

    [Fact]
    public void NFR_OBS_01_a_span_follows_its_parents_decision()
    {
        var unsampled = new ActivityContext(ActivityTraceId.CreateRandom(), ActivitySpanId.CreateRandom(), ActivityTraceFlags.None);

        Decide("search.recordings", unsampled).Decision.Should().Be(SamplingDecision.Drop);
    }
}
