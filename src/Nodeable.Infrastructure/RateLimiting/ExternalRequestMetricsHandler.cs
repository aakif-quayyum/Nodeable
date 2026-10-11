using Nodeable.Infrastructure.Telemetry;

namespace Nodeable.Infrastructure.RateLimiting;

/// <summary>Counts every HTTP attempt to an external API by source and status code (the <c>external.requests</c> metric).</summary>
internal sealed class ExternalRequestMetricsHandler(string source) : DelegatingHandler
{
    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        try
        {
            var response = await base.SendAsync(request, cancellationToken);
            Count(((int)response.StatusCode).ToString(System.Globalization.CultureInfo.InvariantCulture));
            return response;
        }
        catch (HttpRequestException)
        {
            // No response arrived (DNS, refused connection, reset). A cancelled call is not counted: it is not an error of the service.
            Count("error");
            throw;
        }
    }

    private void Count(string statusCode) =>
        InfrastructureTelemetry.ExternalRequests.Add(
            1,
            new KeyValuePair<string, object?>("source", source),
            new KeyValuePair<string, object?>("status_code", statusCode));
}
