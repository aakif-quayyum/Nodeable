using OpenTelemetry.Trace;

namespace Nodeable.ServiceDefaults;

/// <summary>
/// Drops the Redis <c>PING</c> spans that the readiness health check produces. The AppHost probes <c>/health</c> every
/// 30 seconds; the HTTP span for that probe is already filtered out (see <c>ConfigureOpenTelemetry</c>), which leaves the
/// Redis check's own span as a trace of its own, one every 30 seconds on an idle system. The application never sends
/// PING itself (the rate gate runs a script), so nothing real is lost.
/// Every other span is decided exactly as the default sampler would: follow the parent, record when there is none.
/// </summary>
public sealed class IgnoreHealthCheckPingSampler : Sampler
{
    // A sampler decides before a span exists, from its name, kind and starting tags; a dropped span costs nothing.
    private readonly ParentBasedSampler _default = new(new AlwaysOnSampler());

    public override SamplingResult ShouldSample(in SamplingParameters samplingParameters) =>
        samplingParameters.Name == "PING"
            ? new SamplingResult(SamplingDecision.Drop)
            : _default.ShouldSample(in samplingParameters);
}
