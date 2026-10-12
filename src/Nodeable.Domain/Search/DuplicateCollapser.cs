using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace Nodeable.Domain.Search;

/// <summary>
/// Folds duplicate recordings behind the original (FR-SEARCH-02). MusicBrainz lists every live take, remaster and
/// compilation appearance as its own recording, so a search for one song returns the same title seven times.
///
/// Two recordings are duplicates when they have the same title and artist after the decorations "(Live ...)" and
/// "(... Remaster ...)" and the differences of case, accents and punctuation are removed. Remixes and edits are
/// different recordings (different people mixed them), so they keep their own row. The row that stays is the original:
/// a recording with an official release that is neither a live album nor a compilation, earliest first.
/// </summary>
public static partial class DuplicateCollapser
{
    /// <summary>
    /// Groups <paramref name="candidates"/> and returns at most <paramref name="maxGroups"/> groups, best score first.
    /// A group's score is the best score of its members, so an original ranked below a live take still sorts by the take's match.
    /// </summary>
    public static IReadOnlyList<SearchGroup> Collapse(IReadOnlyList<SearchCandidate> candidates, int maxGroups)
    {
        ArgumentOutOfRangeException.ThrowIfLessThan(maxGroups, 1);

        // GroupBy keeps the order in which each key first appears, and OrderByDescending is stable, so groups with the
        // same score keep the order the source sent them in.
        return candidates
            .GroupBy(CreateKey)
            .Select(members => (Best: members.Max(m => m.Score), Group: BuildGroup([.. members])))
            .OrderByDescending(entry => entry.Best)
            .Select(entry => entry.Group)
            .Take(maxGroups)
            .ToList();
    }

    private static SearchGroup BuildGroup(IReadOnlyList<SearchCandidate> members)
    {
        // OrderByDescending on a bool puts true first: the originals come before the live takes and compilations.
        var primary = members
            .OrderByDescending(IsOriginal)
            .ThenBy(m => m.FirstReleaseDate?.Date ?? DateOnly.MaxValue)
            .ThenByDescending(m => m.Score)
            .First();

        var versions = members
            .Where(m => m.Mbid != primary.Mbid)
            .OrderBy(m => m.FirstReleaseDate?.Date ?? DateOnly.MaxValue)
            .ThenByDescending(m => m.Score)
            .Select(m => new SearchVersion(m, KindOf(m)))
            .ToList();

        return new SearchGroup(primary, versions);
    }

    // Unknown is not a mark against a recording: with no releases listed (a bare cache row) it can still be the original.
    private static bool IsOriginal(SearchCandidate candidate) =>
        ParseTitle(candidate.Title).Kind is null
        && (candidate.Releases.Count == 0
            || candidate.Releases.Any(r => !r.IsUnofficial && !r.IsLive && !r.IsCompilation));

    private static VersionKind KindOf(SearchCandidate candidate)
    {
        if (ParseTitle(candidate.Title).Kind is { } decorated)
        {
            return decorated;
        }

        if (candidate.Releases.Count > 0 && candidate.Releases.All(r => r.IsLive))
        {
            return VersionKind.Live;
        }

        if (candidate.Releases.Count > 0 && candidate.Releases.All(r => r.IsCompilation))
        {
            return VersionKind.Compilation;
        }

        return VersionKind.Other;
    }

    private static string CreateKey(SearchCandidate candidate)
    {
        var baseTitle = Normalize(ParseTitle(candidate.Title).BaseTitle);

        // A title that is nothing but a decoration, "(Live)", falls back to itself instead of an empty key.
        if (baseTitle.Length == 0)
        {
            baseTitle = Normalize(candidate.Title);
        }

        return $"{baseTitle}|{Normalize(candidate.Artist)}";
    }

    /// <summary>
    /// Splits "Redbone (Live at Wembley)" or "Redbone - 2011 Remaster" into the title without the decoration and what
    /// the decoration said. A bracket that is not about live or remaster ("(Radio Edit)", "(Tsunxmi Remix)") stays.
    /// </summary>
    internal static (string BaseTitle, VersionKind? Kind) ParseTitle(string title)
    {
        var sawLive = false;
        var sawRemaster = false;

        var baseTitle = Decoration().Replace(title, match =>
        {
            var text = match.Groups["text"].Value;
            if (Different().IsMatch(text))
            {
                return match.Value;
            }

            if (LiveStart().IsMatch(text))
            {
                sawLive = true;
                return string.Empty;
            }

            if (Remaster().IsMatch(text))
            {
                sawRemaster = true;
                return string.Empty;
            }

            return match.Value;
        });

        VersionKind? kind = sawLive ? VersionKind.Live : sawRemaster ? VersionKind.Remaster : null;
        return (baseTitle.Trim(), kind);
    }

    /// <summary>
    /// Lower-cases, drops accents and apostrophes, and turns every other run of punctuation into one space, so
    /// "Don’t Stop (Me Now)" and "dont stop me now" are the same key.
    /// </summary>
    internal static string Normalize(string text)
    {
        // FormD splits "é" into "e" plus a combining accent, which is a NonSpacingMark and is skipped below.
        var decomposed = text.Normalize(NormalizationForm.FormD);
        var builder = new StringBuilder(decomposed.Length);
        var pendingSpace = false;

        foreach (var ch in decomposed)
        {
            if (char.GetUnicodeCategory(ch) == UnicodeCategory.NonSpacingMark || ch is '\'' or '’' or '‘' or '`')
            {
                continue;
            }

            if (char.IsLetterOrDigit(ch))
            {
                if (pendingSpace && builder.Length > 0)
                {
                    builder.Append(' ');
                }

                pendingSpace = false;
                builder.Append(char.ToLowerInvariant(ch));
            }
            else
            {
                pendingSpace = true;
            }
        }

        return builder.ToString();
    }

    // [GeneratedRegex] on a partial method makes the compiler write the matcher as ordinary C# at build time: no Regex object is built or interpreted at runtime, unlike JavaScript's regex literals which the engine compiles when the script loads
    // A bracketed group, or a trailing " - ..." segment; the inside is captured as "text".
    [GeneratedRegex(@"\s*[\(\[](?<text>[^)\]]*)[\)\]]|\s+[-–—]\s+(?<text>[^-–—]*)$", RegexOptions.CultureInvariant)]
    private static partial Regex Decoration();

    [GeneratedRegex(@"\b(?:remix|edit|mix|dub|acoustic|instrumental|demo)\b", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex Different();

    [GeneratedRegex(@"^\s*live\b", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex LiveStart();

    [GeneratedRegex(@"\bremaster(?:ed)?\b", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex Remaster();
}
