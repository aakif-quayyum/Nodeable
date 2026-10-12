using Nodeable.Domain.Dates;
using Nodeable.Domain.Enums;
using Nodeable.Domain.Search;

namespace Nodeable.Domain.Tests;

public class DuplicateCollapserTests
{
    // Shapes taken from the real search for "Redbone" by Childish Gambino (Fixtures/musicbrainz/search-recordings-duplicates.json).
    private static readonly CandidateRelease _album = new("Awaken, My Love!", Year(2016));
    private static readonly CandidateRelease _liveBootleg = new("Live Bootleg", Year(2021), IsUnofficial: true, IsLive: true);
    private static readonly CandidateRelease _promoCompilation = new("Promo Only", Year(2016), IsUnofficial: true, IsCompilation: true);
    private static readonly CandidateRelease _djMix = new("Annie Mac Presents 2017", Year(2017), IsCompilation: true);

    private static PartialDate Year(int year) => new(new DateOnly(year, 1, 1), DatePrecision.Year);

    private static SearchCandidate Candidate(
        int n,
        string title,
        string artist = "Childish Gambino",
        int score = 100,
        PartialDate? first = null,
        params CandidateRelease[] releases) =>
        new(new Guid(n, 0, 0, new byte[8]), title, artist, score, first, releases);

    [Fact]
    public void FR_SEARCH_02_the_original_stays_and_live_and_compilation_takes_are_folded_behind_it()
    {
        var live = Candidate(1, "Redbone", first: Year(2021), releases: _liveBootleg);
        var promo = Candidate(2, "Redbone", first: Year(2016), releases: _promoCompilation);
        var original = Candidate(3, "Redbone", first: new PartialDate(new DateOnly(2016, 11, 17), DatePrecision.Day), releases: [_album, _djMix]);

        var groups = DuplicateCollapser.Collapse([live, promo, original], 10);

        var group = groups.Should().ContainSingle().Subject;
        group.Primary.Mbid.Should().Be(original.Mbid);
        group.Versions.Select(v => (v.Candidate.Mbid, v.Kind)).Should().BeEquivalentTo(
            [(promo.Mbid, VersionKind.Compilation), (live.Mbid, VersionKind.Live)],
            options => options.WithStrictOrdering());
    }

    [Fact]
    public void FR_SEARCH_02_an_unofficial_release_with_the_earliest_date_does_not_become_the_original()
    {
        // A promotional single that is neither live nor a compilation: only its status, not its type, rules it out.
        // It is dated "2016", which sorts before the album's 2016-11-17, so date alone would make it the original.
        var promo = Candidate(1, "Redbone", first: Year(2016), releases: new CandidateRelease("Radio promo", Year(2016), IsUnofficial: true));
        var original = Candidate(2, "Redbone", first: new PartialDate(new DateOnly(2016, 11, 17), DatePrecision.Day), releases: _album);

        var group = DuplicateCollapser.Collapse([promo, original], 10).Single();

        group.Primary.Mbid.Should().Be(original.Mbid);
    }

    [Theory]
    [InlineData("Redbone (Live)")]
    [InlineData("Redbone (live at Wembley, 1986)")]
    [InlineData("Redbone - Live")]
    [InlineData("Redbone [Live in London]")]
    public void FR_SEARCH_02_a_live_decoration_folds_the_title_into_the_original_and_is_marked_live(string title)
    {
        var original = Candidate(1, "Redbone", releases: _album);
        var live = Candidate(2, title, releases: _album);

        var group = DuplicateCollapser.Collapse([live, original], 10).Single();

        group.Primary.Mbid.Should().Be(original.Mbid);
        group.Versions.Should().ContainSingle().Which.Kind.Should().Be(VersionKind.Live);
    }

    [Theory]
    [InlineData("Redbone (Remastered)")]
    [InlineData("Redbone (2011 Remaster)")]
    [InlineData("Redbone - Remastered 2011")]
    [InlineData("Redbone - 2011 Remaster")]
    public void FR_SEARCH_02_a_remaster_decoration_folds_the_title_into_the_original_and_is_marked_remaster(string title)
    {
        var original = Candidate(1, "Redbone", releases: _album);
        var remaster = Candidate(2, title, releases: _album);

        var group = DuplicateCollapser.Collapse([remaster, original], 10).Single();

        group.Primary.Mbid.Should().Be(original.Mbid);
        group.Versions.Should().ContainSingle().Which.Kind.Should().Be(VersionKind.Remaster);
    }

    [Theory]
    [InlineData("Redbone (radio edit)")]
    [InlineData("Redbone (Tsunxmi remix)")]
    [InlineData("Redbone (Live and Let Die remix)")]
    [InlineData("Redbone - Acoustic")]
    public void FR_SEARCH_02_remixes_and_edits_are_different_recordings_and_keep_their_own_row(string title)
    {
        var original = Candidate(1, "Redbone", releases: _album);
        var other = Candidate(2, title, releases: _album);

        var groups = DuplicateCollapser.Collapse([original, other], 10);

        groups.Select(g => g.Primary.Mbid).Should().Equal(original.Mbid, other.Mbid);
        groups.Should().OnlyContain(g => g.Versions.Count == 0);
    }

    [Fact]
    public void FR_SEARCH_02_case_accents_and_apostrophes_do_not_make_two_recordings_different()
    {
        var a = Candidate(1, "Don’t Stop Me Now", artist: "Queen", releases: _album);
        var b = Candidate(2, "DON'T STOP ME NOW", artist: "Queen", releases: _album);
        var c = Candidate(3, "Dön’t stop me, now!", artist: "QUEEN", releases: _album);

        DuplicateCollapser.Collapse([a, b, c], 10).Should().ContainSingle();
    }

    [Fact]
    public void FR_SEARCH_02_the_same_title_by_a_different_artist_is_a_different_song()
    {
        var gambino = Candidate(1, "Redbone", releases: _album);
        var cover = Candidate(2, "Redbone", artist: "Someone Else", releases: _album);

        DuplicateCollapser.Collapse([gambino, cover], 10).Should().HaveCount(2);
    }

    [Fact]
    public void FR_SEARCH_02_the_word_live_outside_a_decoration_is_part_of_the_title()
    {
        var song = Candidate(1, "Live and Let Die", artist: "Paul McCartney", releases: _album);
        var liveTake = Candidate(2, "Live and Let Die (Live)", artist: "Paul McCartney", releases: _album);

        var group = DuplicateCollapser.Collapse([liveTake, song], 10).Single();

        group.Primary.Mbid.Should().Be(song.Mbid);
        group.Versions.Should().ContainSingle().Which.Kind.Should().Be(VersionKind.Live);
    }

    [Fact]
    public void FR_SEARCH_02_when_every_version_is_a_live_take_the_earliest_one_stays()
    {
        var late = Candidate(1, "Redbone (Live)", first: Year(2021), releases: _liveBootleg);
        var early = Candidate(2, "Redbone (Live)", first: Year(2019), releases: _liveBootleg);

        var group = DuplicateCollapser.Collapse([late, early], 10).Single();

        group.Primary.Mbid.Should().Be(early.Mbid);
    }

    [Fact]
    public void FR_SEARCH_02_a_recording_with_no_releases_listed_is_not_marked_down()
    {
        // The cache stores no release status, so an unknown recording must be able to be the original.
        var bare = Candidate(1, "Redbone", first: Year(2016));
        var live = Candidate(2, "Redbone", first: Year(2015), releases: _liveBootleg);

        var group = DuplicateCollapser.Collapse([live, bare], 10).Single();

        group.Primary.Mbid.Should().Be(bare.Mbid);
    }

    [Fact]
    public void FR_SEARCH_01_groups_are_ordered_by_their_best_score_and_limited_to_the_page_size()
    {
        var a = Candidate(1, "Alpha", score: 70, releases: _album);
        var b = Candidate(2, "Bravo", score: 100, releases: _album);
        var c = Candidate(3, "Charlie", score: 85, releases: _album);
        var bLive = Candidate(4, "Bravo (Live)", score: 100, releases: _album);

        var groups = DuplicateCollapser.Collapse([a, b, c, bLive], 2);

        groups.Select(g => g.Primary.Title).Should().Equal("Bravo", "Charlie");
    }

    [Fact]
    public void FR_SEARCH_01_groups_with_the_same_score_keep_the_order_the_source_sent()
    {
        var first = Candidate(1, "Zulu", releases: _album);
        var second = Candidate(2, "Alpha", releases: _album);

        DuplicateCollapser.Collapse([first, second], 10).Select(g => g.Primary.Title).Should().Equal("Zulu", "Alpha");
    }

    [Fact]
    public void FR_SEARCH_01_the_first_release_title_prefers_an_official_release_then_the_earliest_date()
    {
        var candidate = Candidate(
            1,
            "Redbone",
            releases:
            [
                new CandidateRelease("Promo 2015", Year(2015), IsUnofficial: true),
                new CandidateRelease("Single 2017", Year(2017)),
                new CandidateRelease("Album 2016", Year(2016)),
                new CandidateRelease("Undated", null),
            ]);

        candidate.FirstReleaseTitle.Should().Be("Album 2016");
    }

    [Fact]
    public void FR_SEARCH_01_no_candidates_give_no_groups()
    {
        DuplicateCollapser.Collapse([], 10).Should().BeEmpty();
    }

    [Fact]
    public void FR_SEARCH_01_a_page_size_below_one_is_refused()
    {
        var act = () => DuplicateCollapser.Collapse([], 0);

        act.Should().Throw<ArgumentOutOfRangeException>();
    }
}
