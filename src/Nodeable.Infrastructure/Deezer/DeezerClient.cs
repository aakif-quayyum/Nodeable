using System.Diagnostics;
using System.Globalization;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Nodeable.Infrastructure.Telemetry;

namespace Nodeable.Infrastructure.Deezer;

/// <summary>
/// A typed HttpClient for Deezer's public API. Like the MusicBrainz client it only builds requests and reads responses:
/// the rate gate, retries and timeouts are the pipeline's job (<see cref="DeezerServiceCollectionExtensions"/>).
/// </summary>
public sealed class DeezerClient(HttpClient http) : IDeezerClient
{
    // Deezer's error codes (https://developers.deezer.com/api/errors): 4 is "quota limit exceeded", 700 is "service busy",
    // 800 is "data not found". The others (a bad parameter, a missing permission) would fail the same way again.
    private const int QuotaExceeded = 4;
    private const int ServiceBusy = 700;
    private const int DataNotFound = 800;

    private static readonly JsonSerializerOptions _json = new(JsonSerializerDefaults.Web);

    public Task<DeezerTrack?> GetTrackByIsrcAsync(string isrc, CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(isrc);

        // "isrc:" is part of Deezer's path, so it is not escaped; the code itself is.
        return FetchAsync($"track/isrc:{Uri.EscapeDataString(isrc)}", "isrc", cancellationToken);
    }

    public Task<DeezerTrack?> GetTrackAsync(string trackId, CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(trackId);
        return FetchAsync($"track/{Uri.EscapeDataString(trackId)}", "id", cancellationToken);
    }

    private async Task<DeezerTrack?> FetchAsync(string uri, string lookup, CancellationToken cancellationToken)
    {
        using var activity = InfrastructureTelemetry.ActivitySource.StartActivity("deezer.lookup", ActivityKind.Client);
        activity?.SetTag("deezer.lookup", lookup);

        using var response = await http.GetAsync(uri, cancellationToken);
        activity?.SetTag("http.response.status_code", (int)response.StatusCode);

        if (response.StatusCode == HttpStatusCode.NotFound)
        {
            return null;
        }

        if (!response.IsSuccessStatusCode)
        {
            var transient = (int)response.StatusCode >= 500 || response.StatusCode == HttpStatusCode.TooManyRequests;
            throw new DeezerException($"Deezer answered {(int)response.StatusCode}.", transient);
        }

        TrackResponse? body;
        try
        {
            body = await response.Content.ReadFromJsonAsync<TrackResponse>(_json, cancellationToken);
        }
        catch (JsonException ex)
        {
            throw new DeezerException("Deezer's answer was not readable JSON.", isTransient: false, ex);
        }

        // LEARN: LG-04 error-in-200 | Deezer answers 200 with an error object for a miss as well as for a failure, so the status code is not the answer: the client reads the body and turns "no data" into null so callers never meet the quirk
        if (body?.Error is { } error)
        {
            if (error.Code == DataNotFound)
            {
                activity?.SetTag("deezer.found", false);
                return null;
            }

            var transient = error.Code is QuotaExceeded or ServiceBusy;
            var message = $"Deezer reported error {error.Code?.ToString(CultureInfo.InvariantCulture) ?? "?"}: {error.Message}.";
            activity?.SetStatus(ActivityStatusCode.Error, message);
            throw new DeezerException(message, transient);
        }

        if (body?.Id is not { } id)
        {
            throw new DeezerException("Deezer's answer had no track ID.", isTransient: false);
        }

        activity?.SetTag("deezer.found", true);
        return new DeezerTrack(
            id.ToString(CultureInfo.InvariantCulture),
            body.Title ?? string.Empty,
            NullIfEmpty(body.Preview),
            NullIfEmpty(body.Album?.Md5Image));
    }

    // Deezer sends "" for a missing preview or cover, which would otherwise read as a URL that is present.
    private static string? NullIfEmpty(string? value) => string.IsNullOrWhiteSpace(value) ? null : value;

    private sealed record TrackResponse(
        long? Id,
        string? Title,
        string? Preview,
        AlbumResponse? Album,
        ErrorResponse? Error);

    private sealed record AlbumResponse([property: JsonPropertyName("md5_image")] string? Md5Image);

    private sealed record ErrorResponse(int? Code, string? Message);
}
