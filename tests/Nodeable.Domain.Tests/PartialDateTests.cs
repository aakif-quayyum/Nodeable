using Nodeable.Domain.Dates;
using Nodeable.Domain.Entities;
using Nodeable.Domain.Enums;

namespace Nodeable.Domain.Tests;

// Decision 0008: partial MusicBrainz dates are stored as the earliest possible day plus a precision.
public class PartialDateTests
{
    [Theory]
    [InlineData("1995", 1995, 1, 1, DatePrecision.Year)]
    [InlineData("1995-03", 1995, 3, 1, DatePrecision.Month)]
    [InlineData("1995-03-07", 1995, 3, 7, DatePrecision.Day)]
    [InlineData(" 1995-03-07 ", 1995, 3, 7, DatePrecision.Day)]
    [InlineData("2024-02-29", 2024, 2, 29, DatePrecision.Day)]
    public void FR_SEARCH_01_a_partial_date_becomes_its_earliest_day_with_the_precision_it_was_given(
        string text, int year, int month, int day, DatePrecision precision)
    {
        var parsed = PartialDate.TryParse(text, out var date);

        parsed.Should().BeTrue();
        date.Date.Should().Be(new DateOnly(year, month, day));
        date.Precision.Should().Be(precision);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("soon")]
    [InlineData("95")]
    [InlineData("1995-3")]
    [InlineData("1995-13")]
    [InlineData("1995-00")]
    [InlineData("1995-02-30")]
    [InlineData("2023-02-29")]
    [InlineData("1995-03-07-01")]
    [InlineData("0000")]
    [InlineData("-199")]
    public void FR_SEARCH_01_text_that_is_not_a_date_is_not_parsed_instead_of_guessed(string? text)
    {
        var parsed = PartialDate.TryParse(text, out var date);

        parsed.Should().BeFalse();
        date.Should().Be(default(PartialDate));
    }

    [Fact]
    public void FR_SEARCH_01_dates_sort_by_the_earliest_day_whatever_the_precision()
    {
        var year = Parse("1995");
        var month = Parse("1995-03");

        year.Date.Should().BeBefore(month.Date);
    }

    [Fact]
    public void FR_SEARCH_01_a_recording_keeps_date_and_precision_together()
    {
        var recording = new Recording { Mbid = Guid.NewGuid(), Title = "Redbone", ArtistCredit = "Childish Gambino" };
        var date = Parse("2016-11");

        recording.SetFirstReleaseDate(date);

        recording.FirstReleaseDate.Should().Be(new DateOnly(2016, 11, 1));
        recording.FirstReleaseDatePrecision.Should().Be(DatePrecision.Month);
    }

    [Fact]
    public void FR_SEARCH_01_clearing_a_recordings_date_clears_the_precision_too()
    {
        var recording = new Recording { Mbid = Guid.NewGuid(), Title = "Redbone", ArtistCredit = "Childish Gambino" };
        var date = Parse("2016");
        recording.SetFirstReleaseDate(date);

        recording.SetFirstReleaseDate(null);

        recording.FirstReleaseDate.Should().BeNull();
        recording.FirstReleaseDatePrecision.Should().BeNull();
    }

    [Fact]
    public void FR_SEARCH_01_a_release_keeps_date_and_precision_together()
    {
        var release = new Release { Mbid = Guid.NewGuid(), Title = "Awaken, My Love!" };
        var date = Parse("2016-12-02");

        release.SetDate(date);

        release.Date.Should().Be(new DateOnly(2016, 12, 2));
        release.DatePrecision.Should().Be(DatePrecision.Day);

        release.SetDate(null);

        release.Date.Should().BeNull();
        release.DatePrecision.Should().BeNull();
    }

    // A test that parses a date it expects to be valid fails loudly here, not later on a default value.
    private static PartialDate Parse(string text)
    {
        PartialDate.TryParse(text, out var date).Should().BeTrue();
        return date;
    }
}
