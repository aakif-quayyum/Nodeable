using Nodeable.Domain.Dates;
using Nodeable.Domain.Entities;
using Nodeable.Domain.Search;
using Nodeable.Infrastructure.MusicBrainz.Models;

namespace Nodeable.Infrastructure.Search;

/// <summary>
/// Turns the two places a search can read from, MusicBrainz's JSON and our own rows, into the one shape the Domain
/// collapses (<see cref="SearchCandidate"/>).
/// </summary>
internal static class SearchCandidateMapper
{
    private const string UnknownArtist = "Unknown artist";

    public static SearchCandidate FromMusicBrainz(RecordingSearchResult hit) => new(
        hit.Id,
        hit.Title,
        FormatArtist(hit.ArtistCredit),
        hit.Score,
        ParseDate(hit.FirstReleaseDate),
        (hit.Releases ?? []).Select(ToRelease).ToList(),
        string.IsNullOrWhiteSpace(hit.Disambiguation) ? null : hit.Disambiguation);

    /// <param name="similarity">Trigram similarity of the title to the query, 0 to 1.</param>
    /// <param name="releases">The releases the cache holds for this recording. They carry no status or type, so none is marked down.</param>
    public static SearchCandidate FromRecording(Recording recording, double similarity, IEnumerable<Release> releases) => new(
        recording.Mbid,
        recording.Title,
        string.IsNullOrWhiteSpace(recording.ArtistCredit) ? UnknownArtist : recording.ArtistCredit,
        (int)Math.Round(similarity * 100, MidpointRounding.AwayFromZero),
        recording.FirstReleaseDate is { } date && recording.FirstReleaseDatePrecision is { } precision
            ? new PartialDate(date, precision)
            : null,
        releases
            .Select(r => new CandidateRelease(
                r.Title,
                r.Date is { } d && r.DatePrecision is { } p ? new PartialDate(d, p) : null))
            .ToList());

    // "Beyoncé feat. Jay-Z" arrives as two names with their join phrases: "Beyoncé" + " feat. " and "Jay-Z".
    private static string FormatArtist(IReadOnlyList<ArtistCreditName>? credit)
    {
        if (credit is null || credit.Count == 0)
        {
            return UnknownArtist;
        }

        return string.Concat(credit.Select(name => name.Name + name.JoinPhrase));
    }

    private static CandidateRelease ToRelease(ReleaseRef release)
    {
        var secondaryTypes = release.ReleaseGroup?.SecondaryTypes ?? [];

        return new CandidateRelease(
            release.Title,
            ParseDate(release.Date),
            // A missing status is not a mark against the release; only an explicit non-Official one is.
            IsUnofficial: release.Status is { } status && !status.Equals("Official", StringComparison.OrdinalIgnoreCase),
            IsLive: secondaryTypes.Contains("Live", StringComparer.OrdinalIgnoreCase),
            IsCompilation: secondaryTypes.Any(type => type.Equals("Compilation", StringComparison.OrdinalIgnoreCase)
                || type.Equals("DJ-mix", StringComparison.OrdinalIgnoreCase)));
    }

    private static PartialDate? ParseDate(string? text) =>
        PartialDate.TryParse(text, out var date) ? date : null;
}
