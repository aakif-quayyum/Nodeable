using System.Diagnostics;
using System.Globalization;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Nodeable.Infrastructure.MusicBrainz.Models;
using Nodeable.Infrastructure.Telemetry;

namespace Nodeable.Infrastructure.MusicBrainz;

/// <summary>
/// A typed HttpClient for the MusicBrainz web service. It only builds requests and reads responses; waiting for the
/// rate gate, retrying 503 and 429, and timeouts are the HttpClient pipeline's job (see
/// <see cref="MusicBrainzServiceCollectionExtensions"/>), so every request goes through them whatever calls it.
/// </summary>
// LEARN: LG-02 typed-client | A "typed client" is a class that takes an HttpClient in its constructor; the factory configures that client (base address, User-Agent, handlers) and manages the connection pool, much like a preconfigured axios instance
public sealed class MusicBrainzClient(HttpClient http) : IMusicBrainzClient
{
    // MusicBrainz asks for fmt=json (the default is XML).
    private const string Format = "fmt=json";

    private const string RecordingIncludes = "artist-credits+artist-rels+work-rels+releases+isrcs";
    private const string ArtistRelationshipIncludes = "artist-rels";

    private static readonly JsonSerializerOptions _json = new(JsonSerializerDefaults.Web)
    {
        // A response that is missing a field the typed model requires fails loudly instead of leaving a null in
        // a non-nullable property (spec principle 5: honest data).
        RespectNullableAnnotations = true,
        RespectRequiredConstructorParameters = true,
    };

    public Task<RecordingSearchResponse> SearchRecordingsAsync(string title, string? artist = null, int limit = 10, CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(title);
        ArgumentOutOfRangeException.ThrowIfLessThan(limit, 1);
        ArgumentOutOfRangeException.ThrowIfGreaterThan(limit, 100);

        var query = $"recording:{Quote(title)}";
        if (!string.IsNullOrWhiteSpace(artist))
        {
            query += $" AND artist:{Quote(artist)}";
        }

        var uri = $"recording?query={Uri.EscapeDataString(query)}&limit={limit.ToString(CultureInfo.InvariantCulture)}&{Format}";
        return GetRequiredAsync<RecordingSearchResponse>(uri, "recording_search", null, cancellationToken);
    }

    public Task<RecordingLookup?> GetRecordingAsync(Guid mbid, CancellationToken cancellationToken = default) =>
        GetAsync<RecordingLookup>($"recording/{mbid:D}?inc={RecordingIncludes}&{Format}", "recording", RecordingIncludes, cancellationToken);

    public Task<WorkLookup?> GetWorkAsync(Guid mbid, CancellationToken cancellationToken = default) =>
        GetAsync<WorkLookup>($"work/{mbid:D}?inc={ArtistRelationshipIncludes}&{Format}", "work", ArtistRelationshipIncludes, cancellationToken);

    public Task<ReleaseLookup?> GetReleaseAsync(Guid mbid, CancellationToken cancellationToken = default) =>
        GetAsync<ReleaseLookup>($"release/{mbid:D}?inc={ArtistRelationshipIncludes}&{Format}", "release", ArtistRelationshipIncludes, cancellationToken);

    /// <summary>Quotes a phrase for the search syntax MusicBrainz uses (Lucene), escaping the characters that would end it.</summary>
    internal static string Quote(string phrase) =>
        "\"" + phrase.Replace("\\", "\\\\", StringComparison.Ordinal).Replace("\"", "\\\"", StringComparison.Ordinal) + "\"";

    private async Task<T> GetRequiredAsync<T>(string uri, string entity, string? include, CancellationToken cancellationToken)
        where T : class =>
        await GetAsync<T>(uri, entity, include, cancellationToken)
        ?? throw new MusicBrainzException(HttpStatusCode.NotFound, "The search endpoint answered 404.");

    private async Task<T?> GetAsync<T>(string uri, string entity, string? include, CancellationToken cancellationToken)
        where T : class
    {
        // The Client span carries the MusicBrainz-specific facts; the HTTP instrumentation adds one child span per attempt.
        using var activity = InfrastructureTelemetry.ActivitySource.StartActivity("musicbrainz.fetch", ActivityKind.Client);
        activity?.SetTag("mb.entity", entity);
        activity?.SetTag("mb.inc", include);

        using var response = await http.GetAsync(uri, cancellationToken);
        activity?.SetTag("http.response.status_code", (int)response.StatusCode);

        if (response.StatusCode == HttpStatusCode.NotFound)
        {
            return null;
        }

        if (!response.IsSuccessStatusCode)
        {
            var message = await ReadErrorMessageAsync(response, cancellationToken);
            activity?.SetStatus(ActivityStatusCode.Error, message);
            throw new MusicBrainzException(response.StatusCode, message);
        }

        return await response.Content.ReadFromJsonAsync<T>(_json, cancellationToken);
    }

    // MusicBrainz errors are {"error": "..."}; anything else is shortened so a stray HTML page does not flood logs.
    private static async Task<string> ReadErrorMessageAsync(HttpResponseMessage response, CancellationToken cancellationToken)
    {
        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        try
        {
            using var document = JsonDocument.Parse(body);
            if (document.RootElement.TryGetProperty("error", out var error) && error.ValueKind == JsonValueKind.String)
            {
                return error.GetString() ?? string.Empty;
            }
        }
        catch (JsonException)
        {
            // Not JSON: fall through to the raw text.
        }

        return body.Length <= 200 ? body : body[..200];
    }
}
