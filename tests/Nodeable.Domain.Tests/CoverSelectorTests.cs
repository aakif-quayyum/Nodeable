using Nodeable.Domain.Art;
using Nodeable.Domain.Dates;
using Nodeable.Domain.Enums;

namespace Nodeable.Domain.Tests;

public class CoverSelectorTests
{
    private static readonly Guid _single = Guid.Parse("00000000-0000-0000-0000-0000000000a1");
    private static readonly Guid _album = Guid.Parse("00000000-0000-0000-0000-0000000000a2");
    private static readonly Guid _live = Guid.Parse("00000000-0000-0000-0000-0000000000a3");
    private static readonly Guid _promo = Guid.Parse("00000000-0000-0000-0000-0000000000a4");
    private static readonly Guid _groupSingle = Guid.Parse("00000000-0000-0000-0000-0000000000b1");
    private static readonly Guid _groupAlbum = Guid.Parse("00000000-0000-0000-0000-0000000000b2");
    private static readonly Guid _groupLive = Guid.Parse("00000000-0000-0000-0000-0000000000b3");

    private static PartialDate Day(int year, int month, int day) => new(new DateOnly(year, month, day), DatePrecision.Day);

    [Fact]
    public void FR_ART_01_the_earliest_dated_release_is_chosen_with_its_own_release_group()
    {
        var choice = CoverSelector.Choose(
        [
            new CoverCandidate(_album, _groupAlbum, Day(2016, 12, 2)),
            new CoverCandidate(_single, _groupSingle, Day(2016, 11, 17)),
        ]);

        choice.Should().Be(new CoverChoice(_single, _groupSingle));
    }

    [Fact]
    public void FR_ART_01_an_official_release_beats_an_earlier_promotion()
    {
        var choice = CoverSelector.Choose(
        [
            new CoverCandidate(_promo, null, Day(2016, 1, 1), IsUnofficial: true),
            new CoverCandidate(_album, _groupAlbum, Day(2016, 12, 2)),
        ]);

        choice.ReleaseMbid.Should().Be(_album);
    }

    [Fact]
    public void FR_ART_01_a_studio_release_beats_an_earlier_live_album_or_compilation()
    {
        var choice = CoverSelector.Choose(
        [
            new CoverCandidate(_live, _groupLive, Day(2016, 1, 1), IsLive: true),
            new CoverCandidate(_promo, null, Day(2016, 2, 1), IsCompilation: true),
            new CoverCandidate(_album, _groupAlbum, Day(2017, 6, 1)),
        ]);

        choice.Should().Be(new CoverChoice(_album, _groupAlbum));
    }

    [Fact]
    public void FR_ART_01_a_live_album_is_still_chosen_when_it_is_all_there_is()
    {
        var choice = CoverSelector.Choose([new CoverCandidate(_live, _groupLive, Day(2019, 1, 1), IsLive: true)]);

        choice.ReleaseMbid.Should().Be(_live);
    }

    [Fact]
    public void FR_ART_01_an_undated_release_ranks_after_every_dated_one()
    {
        var choice = CoverSelector.Choose(
        [
            new CoverCandidate(_single, _groupSingle, null),
            new CoverCandidate(_album, _groupAlbum, Day(2020, 1, 1)),
        ]);

        choice.ReleaseMbid.Should().Be(_album);
    }

    [Fact]
    public void FR_ART_01_releases_that_tie_keep_the_order_the_source_sent()
    {
        var first = CoverSelector.Choose([new CoverCandidate(_album, _groupAlbum, Day(2016, 12, 2)), new CoverCandidate(_single, _groupSingle, Day(2016, 12, 2))]);
        var second = CoverSelector.Choose([new CoverCandidate(_single, _groupSingle, Day(2016, 12, 2)), new CoverCandidate(_album, _groupAlbum, Day(2016, 12, 2))]);

        first.ReleaseMbid.Should().Be(_album);
        second.ReleaseMbid.Should().Be(_single);
    }

    [Fact]
    public void FR_ART_01_a_release_with_no_group_borrows_the_group_of_the_next_best_release()
    {
        // Rows fetched before the release group was stored have no group; a cover can still be found by group.
        var choice = CoverSelector.Choose(
        [
            new CoverCandidate(_single, null, Day(2016, 11, 17)),
            new CoverCandidate(_album, _groupAlbum, Day(2016, 12, 2)),
        ]);

        choice.Should().Be(new CoverChoice(_single, _groupAlbum));
    }

    [Fact]
    public void FR_ART_01_no_releases_give_no_cover()
    {
        CoverSelector.Choose([]).Should().Be(CoverChoice.None);
        CoverChoice.None.ReleaseMbid.Should().BeNull();
        CoverChoice.None.ReleaseGroupMbid.Should().BeNull();
    }
}
