using System.Diagnostics;
using System.Net;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Nodeable.Domain.Enums;
using Nodeable.Domain.Search;
using Nodeable.Infrastructure.MusicBrainz;
using Nodeable.Infrastructure.Persistence;
using Nodeable.Infrastructure.RateLimiting;
using Nodeable.Infrastructure.Telemetry;
using Polly.Timeout;

namespace Nodeable.Infrastructure.Search;

/// <summary>
/// Recording search (FR-SEARCH-01, FR-SEARCH-02). The cache is asked first; MusicBrainz is asked only when the
/// cache cannot fill a page by itself. Either way the same collapsing runs, so a result list never shows seven rows
/// for one song.
///
/// This is the one place the Api, not the Worker, calls MusicBrainz (decision 0018): a search must answer in the
/// same request. It still goes through the shared Redis gate, with a short wait cap, so the 1 request per second
/// limit holds for the whole system (NFR-RATE-01).
/// </summary>
public sealed class RecordingSearchService(
    NodeableDbContext db,
    IMusicBrainzClient musicBrainz,
    IOptions<SearchOptions> options) : IRecordingSearchService
{
    // How long a refused caller is told to wait when MusicBrainz is busy: long enough for its 503s to clear.
    private static readonly TimeSpan _upstreamRetryAfter = TimeSpan.FromSeconds(5);

    public async Task<SearchOutcome> SearchAsync(string title, string? artist, CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(title);
        var settings = options.Value;

        using var activity = InfrastructureTelemetry.ActivitySource.StartActivity("search.recordings");

        var cached = await SearchCacheAsync(title, artist, settings.FetchLimit, cancellationToken);
        var cachedGroups = DuplicateCollapser.Collapse(cached.Candidates, settings.MaxResults);
        activity?.SetTag("search.cache_matches", cached.Candidates.Count);

        // The cache answers alone only when it fills the page: with fewer matches, MusicBrainz may know a song the
        // cache has never seen, and hiding it would make search look like it has a smaller catalogue than it has.
        if (cachedGroups.Count >= settings.MaxResults)
        {
            InfrastructureTelemetry.CacheLookups.Add(1, new("entity", "recording_search"), new("result", "hit"));
            return Finish(activity, SearchSource.Cache, cached.Candidates.Count, cachedGroups, cached.Statuses);
        }

        InfrastructureTelemetry.CacheLookups.Add(1, new("entity", "recording_search"), new("result", "miss"));

        var response = await AskMusicBrainzAsync(title, artist, settings.FetchLimit, cancellationToken);
        var candidates = response.Recordings.Select(SearchCandidateMapper.FromMusicBrainz).ToList();
        var groups = DuplicateCollapser.Collapse(candidates, settings.MaxResults);

        var statuses = await LoadStatusesAsync(groups, cancellationToken);
        return Finish(activity, SearchSource.MusicBrainz, candidates.Count, groups, statuses);
    }

    private static SearchOutcome Finish(
        Activity? activity,
        SearchSource source,
        int candidateCount,
        IReadOnlyList<SearchGroup> groups,
        IReadOnlyDictionary<Guid, CreditsStatus> statuses)
    {
        activity?.SetTag("search.source", source == SearchSource.Cache ? "cache" : "musicbrainz");
        activity?.SetTag("search.candidates", candidateCount);
        activity?.SetTag("search.results", groups.Count);
        activity?.SetTag("search.collapsed", groups.Sum(g => g.Versions.Count));

        return new SearchOutcome(source, groups, statuses);
    }

    private async Task<(List<SearchCandidate> Candidates, Dictionary<Guid, CreditsStatus> Statuses)> SearchCacheAsync(
        string title,
        string? artist,
        int limit,
        CancellationToken cancellationToken)
    {
        // LEARN: LG-03 trigram-similarity | TrigramsAreSimilar becomes PostgreSQL's pg_trgm "%" operator, which the GIN index on recordings.title answers without reading every row; TrigramsSimilarity scores the matches so the best come first
        var query = db.Recordings.AsNoTracking().Where(r => EF.Functions.TrigramsAreSimilar(r.Title, title));

        if (!string.IsNullOrWhiteSpace(artist))
        {
            var pattern = $"%{EscapeLike(artist.Trim())}%";

            // The two-argument ILike is sent with ESCAPE '' (no escape character at all), so the backslashes added
            // by EscapeLike would be matched literally. The escape character has to be passed explicitly.
            query = query.Where(r => EF.Functions.ILike(r.ArtistCredit, pattern, LikeEscape));
        }

        var rows = await query
            .Select(r => new { Recording = r, Similarity = EF.Functions.TrigramsSimilarity(r.Title, title) })
            .OrderByDescending(x => x.Similarity)
            .Take(limit)
            .ToListAsync(cancellationToken);

        if (rows.Count == 0)
        {
            return ([], []);
        }

        // A second query for the releases, not a join in the first: one row per recording stays one row.
        var mbids = rows.Select(x => x.Recording.Mbid).ToList();
        var releaseRows = await (
            from link in db.RecordingReleases.AsNoTracking()
            where mbids.Contains(link.RecordingMbid)
            join release in db.Releases.AsNoTracking() on link.ReleaseMbid equals release.Mbid
            select new { link.RecordingMbid, Release = release })
            .ToListAsync(cancellationToken);
        var releasesByRecording = releaseRows.ToLookup(x => x.RecordingMbid, x => x.Release);

        var candidates = rows
            .Select(x => SearchCandidateMapper.FromRecording(x.Recording, x.Similarity, releasesByRecording[x.Recording.Mbid]))
            .ToList();
        var statuses = rows.ToDictionary(x => x.Recording.Mbid, x => x.Recording.CreditsStatus);

        return (candidates, statuses);
    }

    private async Task<MusicBrainz.Models.RecordingSearchResponse> AskMusicBrainzAsync(
        string title,
        string? artist,
        int limit,
        CancellationToken cancellationToken)
    {
        try
        {
            return await musicBrainz.SearchRecordingsAsync(title, artist, limit, cancellationToken);
        }
        catch (RateGateSaturatedException ex)
        {
            throw new SearchUnavailableException(SearchFailure.RateLimited, ex.MaxWait, ex);
        }
        catch (MusicBrainzException ex) when (ex.StatusCode is HttpStatusCode.ServiceUnavailable or HttpStatusCode.TooManyRequests)
        {
            throw new SearchUnavailableException(SearchFailure.UpstreamUnavailable, _upstreamRetryAfter, ex);
        }
        catch (MusicBrainzException ex)
        {
            throw new SearchUnavailableException(SearchFailure.UpstreamError, _upstreamRetryAfter, ex);
        }
        catch (Exception ex) when (ex is TimeoutRejectedException or HttpRequestException)
        {
            // The resilience pipeline gave up (its timeout, or the network). A caller that cancelled is not caught
            // here: OperationCanceledException is neither of these and propagates.
            throw new SearchUnavailableException(SearchFailure.UpstreamUnavailable, _upstreamRetryAfter, ex);
        }
    }

    private async Task<Dictionary<Guid, CreditsStatus>> LoadStatusesAsync(
        IReadOnlyList<SearchGroup> groups,
        CancellationToken cancellationToken)
    {
        var mbids = groups
            .SelectMany(g => g.Versions.Select(v => v.Candidate.Mbid).Prepend(g.Primary.Mbid))
            .ToList();

        if (mbids.Count == 0)
        {
            return [];
        }

        return await db.Recordings
            .AsNoTracking()
            .Where(r => mbids.Contains(r.Mbid))
            .ToDictionaryAsync(r => r.Mbid, r => r.CreditsStatus, cancellationToken);
    }

    // LIKE gives % and _ special meaning; an artist called "100%" must match literally.
    private const string LikeEscape = "\\";

    private static string EscapeLike(string text) =>
        text.Replace(LikeEscape, LikeEscape + LikeEscape, StringComparison.Ordinal)
            .Replace("%", LikeEscape + "%", StringComparison.Ordinal)
            .Replace("_", LikeEscape + "_", StringComparison.Ordinal);
}
