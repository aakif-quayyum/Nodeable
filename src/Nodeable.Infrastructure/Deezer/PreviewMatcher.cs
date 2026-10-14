using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace Nodeable.Infrastructure.Deezer;

/// <summary>
/// The guard behind the title-and-artist fallback of FR-PREVIEW-01 (spec section 10, decision 0025). A wrong preview is
/// worse than none (principle 5), so a Deezer track is accepted only when all of these hold: it has a preview, its
/// artist and title equal the recording's after normalising, and its length is within ten seconds of the recording's.
/// Nothing is scored or guessed: every candidate either passes every rule or is not used.
/// </summary>
public static partial class PreviewMatcher
{
    /// <summary>How far, in seconds, the track's length may be from the recording's. Versions, edits and live takes differ by more.</summary>
    public const int MaxLengthDifferenceSeconds = 10;

    // Decoration that does not make a different recording, taken off both sides before they are compared: a featuring
    // credit in the title (MusicBrainz keeps it in the artist credit), and a remaster or "album version" label.
    // Anything else in brackets (live, remix, acoustic, radio edit, a year of a re-recording) stays and must be equal.
    // LEARN: LG-04 guard-not-score | A match that must not be wrong is a list of rules that all have to hold, not a similarity score with a threshold: each rule is a named, testable reason to reject, and a near miss is simply no match
    [GeneratedRegex(@"\s*[\(\[]\s*(?:feat|ft|featuring)\b[^\)\]]*[\)\]]", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex FeaturingInBrackets();

    [GeneratedRegex(
        @"\s*[\(\[]\s*(?:(?:\d{4}\s+)?(?:digital\s+)?remaster(?:ed)?(?:\s+(?:version|\d{4}))?|(?:album|single|original)\s+version|(?:mono|stereo)(?:\s+(?:version|mix))?)\s*[\)\]]",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex HarmlessLabelInBrackets();

    [GeneratedRegex(@"\s+-\s+(?:\d{4}\s+)?(?:digital\s+)?remaster(?:ed)?(?:\s+(?:version|\d{4}))?\s*$", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex RemasterAfterDash();

    [GeneratedRegex(@"\s+(?:feat\.?|ft\.?|featuring)\s+", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex FeaturingInArtistCredit();

    /// <summary>
    /// The best track among a search's candidates that passes the guard, or null. When several pass, the one whose length
    /// is closest to the recording's wins, and Deezer's own order breaks a tie.
    /// </summary>
    /// <param name="title">The recording's title at MusicBrainz.</param>
    /// <param name="artistCredit">The recording's artist credit at MusicBrainz.</param>
    /// <param name="lengthMs">The recording's length; without it nothing can be checked, so nothing matches.</param>
    /// <param name="candidates">The tracks of a Deezer search, in Deezer's order.</param>
    public static DeezerTrack? Pick(string title, string artistCredit, int? lengthMs, IEnumerable<DeezerTrack> candidates)
    {
        if (lengthMs is not > 0)
        {
            return null;
        }

        var wantedTitle = NormaliseTitle(title);
        var wantedArtist = NormaliseArtist(artistCredit);
        if (wantedTitle.Length == 0 || wantedArtist.Length == 0)
        {
            return null;
        }

        // OrderBy is stable: candidates with the same difference keep Deezer's order.
        return candidates
            .Where(t => t.PreviewUrl is not null && t.ArtistName is not null && t.DurationSeconds is not null)
            .Where(t => NormaliseArtist(t.ArtistName!) == wantedArtist && NormaliseTitle(t.Title) == wantedTitle)
            .Select(t => (Track: t, Difference: Math.Abs((t.DurationSeconds!.Value * 1000) - lengthMs.Value)))
            .Where(c => c.Difference <= MaxLengthDifferenceSeconds * 1000)
            .OrderBy(c => c.Difference)
            .Select(c => c.Track)
            .FirstOrDefault();
    }

    /// <summary>The words to search Deezer for: the first-named artist and the title, as MusicBrainz has them.</summary>
    public static string SearchQuery(string title, string artistCredit) =>
        $"{FeaturingInArtistCredit().Split(artistCredit)[0].Trim()} {title.Trim()}";

    internal static string NormaliseTitle(string title)
    {
        var text = FeaturingInBrackets().Replace(title, string.Empty);
        text = HarmlessLabelInBrackets().Replace(text, string.Empty);
        text = RemasterAfterDash().Replace(text, string.Empty);
        return Fold(text);
    }

    /// <summary>The first-named artist only, so "Daft Punk feat. Pharrell Williams" and "Daft Punk" are the same artist.</summary>
    internal static string NormaliseArtist(string artist) => Fold(FeaturingInArtistCredit().Split(artist)[0]);

    // Equal "ignoring case, accents and punctuation": é is e, "&" is "and", and "Don't" is "dont".
    private static string Fold(string text)
    {
        var decomposed = text.Replace("&", " and ", StringComparison.Ordinal).Normalize(NormalizationForm.FormD);
        var builder = new StringBuilder(decomposed.Length);
        var pendingSpace = false;

        foreach (var c in decomposed)
        {
            var category = CharUnicodeInfo.GetUnicodeCategory(c);
            if (category == UnicodeCategory.NonSpacingMark || c is '\'' or '’' or '‘' or '`')
            {
                continue;
            }

            if (char.IsLetterOrDigit(c))
            {
                if (pendingSpace && builder.Length > 0)
                {
                    builder.Append(' ');
                }

                builder.Append(char.ToLowerInvariant(c));
                pendingSpace = false;
            }
            else
            {
                pendingSpace = true;
            }
        }

        return builder.ToString();
    }
}
