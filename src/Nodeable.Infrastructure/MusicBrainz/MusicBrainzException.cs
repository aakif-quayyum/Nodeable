using System.Net;

namespace Nodeable.Infrastructure.MusicBrainz;

/// <summary>MusicBrainz answered with an error status that is not "not found", after any retries.</summary>
public sealed class MusicBrainzException : Exception
{
    public MusicBrainzException(HttpStatusCode statusCode, string message)
        : base($"MusicBrainz returned {(int)statusCode} {statusCode}: {message}")
    {
        StatusCode = statusCode;
    }

    public HttpStatusCode StatusCode { get; }
}
