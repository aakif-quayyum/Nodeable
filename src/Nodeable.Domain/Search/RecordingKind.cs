using System.Text.RegularExpressions;

namespace Nodeable.Domain.Search;

/// <summary>
/// What a recording is when it is a different recording of a song rather than the song itself (spec section 9,
/// FR-SEARCH-02). A remix or an edit keeps its own row in a search, and the tag says why it is there.
/// </summary>
public enum RecordingKind
{
    Remix,
    Edit,
    Bootleg,
    Mixtape,
}

/// <summary>
/// Decides the <see cref="RecordingKind"/> of a recording. The rules run in this order and the first that decides wins:
/// <list type="number">
/// <item>the recording's disambiguation comment, which MusicBrainz editors write about this recording ("radio edit", "Tsunxmi remix");</item>
/// <item>the decoration at the end of the title, in brackets or after a dash ("(WBBL remix)", "- Radio Edit");</item>
/// <item>the release groups it appears on, only when it is on at least two and every one is a remix album or a mixtape.</item>
/// </list>
/// A word in the middle of a title never counts: only the comment and the final decoration are read.
///
/// The release groups come last because they describe a release, not a recording. Real data: the original
/// "Telegraph Ave." is listed on one single whose release group has the secondary type Remix (the single holds the
/// original and a remix), so reading the group first marked the original as a remix. One group is not evidence; two
/// remix albums with nothing else to say is the most a group can add.
/// </summary>
public static partial class RecordingKindClassifier
{
    public static RecordingKind? Classify(string title, string? disambiguation, IReadOnlyList<CandidateRelease> releases)
    {
        if (!string.IsNullOrWhiteSpace(disambiguation) && FromText(disambiguation) is { } fromComment)
        {
            return fromComment;
        }

        if (DecorationOf(title) is { } decoration && FromText(decoration) is { } fromTitle)
        {
            return fromTitle;
        }

        return FromReleaseGroups(releases);
    }

    // Only releases whose group is known say anything: a cache row with no group types is "not known", not "not a remix".
    private static RecordingKind? FromReleaseGroups(IReadOnlyList<CandidateRelease> releases)
    {
        var known = releases.Where(r => r.ReleaseGroupMbid is not null).ToList();

        // One group (or one release repeated) proves nothing about the recording: see the type's remarks.
        if (known.Select(r => r.ReleaseGroupMbid).Distinct().Count() < 2)
        {
            return null;
        }

        if (known.All(r => r.IsRemix))
        {
            return RecordingKind.Remix;
        }

        return known.All(r => r.IsMixtape) ? RecordingKind.Mixtape : null;
    }

    // "bootleg" is checked first: "(Club Bootleg Remix)" is an unofficial mix before it is a remix.
    private static RecordingKind? FromText(string text)
    {
        if (BootlegWord().IsMatch(text)) return RecordingKind.Bootleg;
        if (RemixWord().IsMatch(text)) return RecordingKind.Remix;
        if (MixtapeWord().IsMatch(text)) return RecordingKind.Mixtape;
        if (EditWord().IsMatch(text)) return RecordingKind.Edit;
        return null;
    }

    // The last bracketed group, or what follows the last " - ". "Edit My Heart" has neither, so it is not an edit.
    private static string? DecorationOf(string title)
    {
        var bracketed = TrailingBrackets().Match(title);
        if (bracketed.Success)
        {
            return bracketed.Groups[1].Value;
        }

        var dashed = TrailingDash().Match(title);
        return dashed.Success ? dashed.Groups[1].Value : null;
    }

    [GeneratedRegex(@"\bbootleg\b", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex BootlegWord();

    [GeneratedRegex(@"\bremix(ed)?\b", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex RemixWord();

    [GeneratedRegex(@"\bmixtape\b", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex MixtapeWord();

    [GeneratedRegex(@"\bedit\b", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex EditWord();

    [GeneratedRegex(@"[\(\[]([^()\[\]]*)[\)\]]\s*$", RegexOptions.CultureInvariant)]
    private static partial Regex TrailingBrackets();

    [GeneratedRegex(@"\s[-–—]\s+([^-–—]+)$", RegexOptions.CultureInvariant)]
    private static partial Regex TrailingDash();
}
