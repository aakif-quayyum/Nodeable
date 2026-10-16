using System.Diagnostics;
using Nodeable.Infrastructure.Telemetry;

namespace Nodeable.Infrastructure.RateLimiting;

/// <summary>Counts every HTTP attempt to an external API by source and status code and times it (the <c>external.requests</c> and <c>external.request.duration</c> metrics).</summary>
internal sealed class ExternalRequestMetricsHandler(string source) : DelegatingHandler
{
    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var started = Stopwatch.GetTimestamp();
        try
        {
            var response = await base.SendAsync(request, cancellationToken);
            Count(((int)response.StatusCode).ToString(System.Globalization.CultureInfo.InvariantCulture), started);
            return response;
        }
        catch (HttpRequestException)
        {
            // No response arrived (DNS, refused connection, reset). A cancelled call is not counted: it is not an error of the service.
            Count("error", started);
            throw;
        }
    }

    private void Count(string statusCode, long started)
    {
        var tags = new TagList { { "source", source }, { "status_code", statusCode } };
        InfrastructureTelemetry.ExternalRequests.Add(1, tags);
        InfrastructureTelemetry.ExternalRequestDuration.Record(Stopwatch.GetElapsedTime(started).TotalSeconds, tags);
    }
}
