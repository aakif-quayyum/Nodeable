namespace Nodeable.Infrastructure.RateLimiting;

/// <summary>
/// Makes every HTTP request wait for the rate gate before it is sent. It sits inside the retry handler in the client's
/// pipeline, so a retry after a 503 is a new request that waits for its own slot instead of skipping the line.
/// </summary>
// LEARN: LG-02 delegating-handler | A DelegatingHandler is middleware for an HttpClient: each handler wraps the next one, like Express middleware, so cross-cutting work such as waiting for a rate slot or counting requests stays out of the client code
internal sealed class RateGateHandler(IRateGate gate) : DelegatingHandler
{
    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        await gate.AcquireAsync(cancellationToken);
        return await base.SendAsync(request, cancellationToken);
    }
}
