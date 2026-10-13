using Nodeable.Domain.Search;

namespace Nodeable.Domain.Tests;

public class RecordingKindClassifierTests
{
    // Each call is a different release group, as two different albums would be.
    private static CandidateRelease InGroup(bool remix = false, bool mixtape = false, bool compilation = false) =>
        new("A release", null, IsCompilation: compilation, ReleaseGroupMbid: Guid.NewGuid(), IsRemix: remix, IsMixtape: mixtape);

    // Titles and comments below are real: they came from MusicBrainz searches made while building FR-SEARCH-02.
    [Theory]
    [InlineData("Redbone (WBBL remix)", RecordingKind.Remix)]
    [InlineData("Redbone (Tsunxmi remix)", RecordingKind.Remix)]
    [InlineData("Redbone (Nick Bike edit)", RecordingKind.Edit)]
    [InlineData("Redbone (radio edit)", RecordingKind.Edit)]
    [InlineData("Telegraph Ave. (Ta-ku remix)", RecordingKind.Remix)]
    [InlineData("Telegraph Ave (Bear//Face bootleg)", RecordingKind.Bootleg)]
    [InlineData("This Is America (DVBLEX Remix)", RecordingKind.Remix)]
    [InlineData("This Is America (Eddie Le Funk Remix)", RecordingKind.Remix)]
    [InlineData("This Is America (Freeky P & Shaunic Afrobeat Remix)", RecordingKind.Remix)]
    [InlineData("This Is America vs. 9th Symphony 2nd Movement (DJs From Mars club Bootleg)", RecordingKind.Bootleg)]
    [InlineData("This Is America (Louie Vega & Todd Terry remix)", RecordingKind.Remix)]
    [InlineData("Creep - Radio Edit", RecordingKind.Edit)]
    [InlineData("Creep [Club Remix]", RecordingKind.Remix)]
    public void FR_SEARCH_02_the_final_decoration_of_a_real_title_says_what_the_recording_is(string title, RecordingKind expected)
    {
        RecordingKindClassifier.Classify(title, null, []).Should().Be(expected);
    }

    [Theory]
    [InlineData("Redbone")]
    [InlineData("This Is America")]
    [InlineData("Telegraph Ave.")]
    [InlineData("III. Telegraph Ave. (“Oakland” by Lloyd)")]
    [InlineData("Telegraph Ave (Oakland by Lloyd)")]
    [InlineData("This is America (Ryn flip)")]
    [InlineData("This Is America (MOЯIS BLAK x Aqua Vitae revision)")]
    public void FR_SEARCH_02_a_title_without_a_known_decoration_is_not_marked(string title)
    {
        RecordingKindClassifier.Classify(title, null, []).Should().BeNull();
    }

    [Theory]
    [InlineData("Edit My Heart")]
    [InlineData("Remix Of Me")]
    [InlineData("The Bootleg Series")]
    public void FR_SEARCH_02_a_word_in_the_middle_of_a_title_is_not_a_decoration(string title)
    {
        RecordingKindClassifier.Classify(title, null, []).Should().BeNull();
    }

    [Fact]
    public void FR_SEARCH_02_two_remix_albums_with_nothing_else_to_say_make_a_remix()
    {
        var kind = RecordingKindClassifier.Classify("Redbone", null, [InGroup(remix: true), InGroup(remix: true)]);

        kind.Should().Be(RecordingKind.Remix);
    }

    [Fact]
    public void FR_SEARCH_02_the_original_listed_only_on_a_remix_single_is_not_a_remix()
    {
        // Real data: MusicBrainz lists the original "Telegraph Ave." on one single whose release group has the secondary
        // type Remix (the single holds the original and a remix). One group says nothing about the recording.
        var kind = RecordingKindClassifier.Classify("Telegraph Ave.", null, [InGroup(remix: true)]);

        kind.Should().BeNull();
    }

    [Fact]
    public void FR_SEARCH_02_the_title_and_the_comment_are_read_before_the_release_groups()
    {
        var groups = new[] { InGroup(remix: true), InGroup(remix: true) };

        RecordingKindClassifier.Classify("Redbone (radio edit)", null, groups).Should().Be(RecordingKind.Edit);
        RecordingKindClassifier.Classify("Redbone", "bootleg", groups).Should().Be(RecordingKind.Bootleg);
    }

    [Fact]
    public void FR_SEARCH_02_two_mixtape_groups_make_a_mixtape_recording()
    {
        RecordingKindClassifier.Classify("Telegraph Ave (Oakland by Lloyd)", null, [InGroup(mixtape: true), InGroup(mixtape: true)])
            .Should().Be(RecordingKind.Mixtape);
    }

    [Fact]
    public void FR_SEARCH_02_one_remix_album_among_other_releases_does_not_make_a_remix()
    {
        // An original that also turns up on a remix album is still the original.
        var kind = RecordingKindClassifier.Classify("Redbone", null, [InGroup(remix: true), InGroup(), InGroup(compilation: true)]);

        kind.Should().BeNull();
    }

    [Fact]
    public void FR_SEARCH_02_a_release_with_no_known_group_says_nothing()
    {
        var unknown = new CandidateRelease("Cached release", null, IsRemix: true);

        RecordingKindClassifier.Classify("Redbone", null, [unknown, unknown]).Should().BeNull();
    }

    [Fact]
    public void FR_SEARCH_02_the_comment_decides_before_the_title()
    {
        RecordingKindClassifier.Classify("Redbone", "Tsunxmi remix", []).Should().Be(RecordingKind.Remix);
        RecordingKindClassifier.Classify("Redbone (radio edit)", "bootleg", []).Should().Be(RecordingKind.Bootleg);
    }

    [Fact]
    public void FR_SEARCH_02_bootleg_wins_over_remix_in_the_same_text()
    {
        RecordingKindClassifier.Classify("Creep (Club Bootleg Remix)", null, []).Should().Be(RecordingKind.Bootleg);
    }

    [Fact]
    public void FR_SEARCH_02_a_dash_decoration_is_only_read_after_a_spaced_dash()
    {
        // "Re-edit" has a hyphen but no spaced dash and no brackets: nothing is read from it.
        RecordingKindClassifier.Classify("Re-edit", null, []).Should().BeNull();
        RecordingKindClassifier.Classify("Creep - 2009 Remastered", null, []).Should().BeNull();
    }
}
