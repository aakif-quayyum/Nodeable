using Nodeable.Domain.Mapping;

namespace Nodeable.Domain.Tests;

public class ReleaseSelectorTests
{
    private static readonly Guid _a = Guid.Parse("00000000-0000-0000-0000-00000000000a");
    private static readonly Guid _b = Guid.Parse("00000000-0000-0000-0000-00000000000b");
    private static readonly Guid _c = Guid.Parse("00000000-0000-0000-0000-00000000000c");

    [Fact]
    public void FR_GRAPH_03_the_earliest_dated_release_is_chosen()
    {
        var chosen = ReleaseSelector.Earliest([(_a, new DateOnly(2017, 3, 1)), (_b, new DateOnly(2016, 12, 2)), (_c, new DateOnly(2019, 1, 1))]);

        chosen.Should().Be(_b);
    }

    [Fact]
    public void FR_GRAPH_03_an_undated_release_is_chosen_only_when_no_release_has_a_date()
    {
        ReleaseSelector.Earliest([(_a, null), (_b, new DateOnly(2016, 12, 2))]).Should().Be(_b);
        ReleaseSelector.Earliest([(_a, null), (_b, null)]).Should().Be(_a);
    }

    [Fact]
    public void FR_GRAPH_03_releases_with_the_same_date_keep_the_order_musicbrainz_sent()
    {
        var sameDay = new DateOnly(2016, 12, 2);

        ReleaseSelector.Earliest([(_c, sameDay), (_a, sameDay), (_b, sameDay)]).Should().Be(_c);
    }

    [Fact]
    public void FR_GRAPH_03_no_releases_means_nothing_to_fetch()
    {
        ReleaseSelector.Earliest([]).Should().BeNull();
    }
}
