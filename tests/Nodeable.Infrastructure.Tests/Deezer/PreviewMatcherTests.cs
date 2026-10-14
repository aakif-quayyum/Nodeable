using Nodeable.Infrastructure.Deezer;

namespace Nodeable.Infrastructure.Tests.Deezer;

// FR-PREVIEW-01: the guard of the title-and-artist fallback. A wrong preview is worse than none, so most of these tests are
// about what must NOT match. The tracks are real Deezer search results (Fixtures/deezer/search-*.json), with the
// recording's length taken from MusicBrainz.
public sealed class PreviewMatcherTests
{
    private const string PreviewUrl = "https://cdnt-preview.dzcdn.net/api/1/1/a/b/c/0/x.mp3?hdnea=exp=1791969375~hmac=00";

    private static DeezerTrack Track(string id, string title, string artist, int seconds, string? preview = PreviewUrl) =>
        new(id, title, preview, "cover", artist, seconds);

    private static string? Pick(string title, string artist, int? lengthMs, params DeezerTrack[] candidates) =>
        PreviewMatcher.Pick(title, artist, lengthMs, candidates)?.Id;

    [Fact]
    public void FR_PREVIEW_01_a_track_with_the_same_artist_and_title_and_a_length_within_five_seconds_matches()
    {
        Pick("Billie Jean", "Michael Jackson", 294_000, Track("1", "Billie Jean", "Michael Jackson", 293))
            .Should().Be("1");
    }

    [Fact]
    public void FR_PREVIEW_01_the_length_may_differ_by_exactly_ten_seconds_and_not_by_more()
    {
        Pick("Song", "Artist", 200_000, Track("1", "Song", "Artist", 210)).Should().Be("1");
        Pick("Song", "Artist", 200_000, Track("1", "Song", "Artist", 190)).Should().Be("1");
        Pick("Song", "Artist", 200_000, Track("1", "Song", "Artist", 211)).Should().BeNull();
        Pick("Song", "Artist", 200_000, Track("1", "Song", "Artist", 189)).Should().BeNull();
    }

    // The two songs of the first twenty-song check that the 5 second rule refused and that were probably the same
    // recording (decision 0025): MusicBrainz's length against Deezer's whole-track length, 8 and 9 seconds apart.
    [Theory]
    [InlineData("HUMBLE.", "Kendrick Lamar", 185_000, 177)]
    [InlineData("Three Little Birds", "Bob Marley & The Wailers", 192_000, 183)]
    public void FR_PREVIEW_01_the_same_song_8_or_9_seconds_apart_matches(string title, string artist, int lengthMs, int seconds)
    {
        Pick(title, artist, lengthMs, Track("1", title, artist, seconds)).Should().Be("1");
    }

    [Theory]
    [InlineData("Three Little Birds (Exodus 40 Mix)", 191)]
    [InlineData("Three Little Birds Dub", 195)]
    [InlineData("Three Little Birds (Alternate Mix)", 187)]
    public void FR_PREVIEW_01_a_mix_or_dub_a_few_seconds_away_is_still_refused_by_its_label(string deezerTitle, int seconds)
    {
        // The recorded Deezer versions of the song against MusicBrainz's 192 seconds: well inside ten seconds, so only the
        // title can refuse them.
        Pick("Three Little Birds", "Bob Marley & The Wailers", 192_000, Track("1", deezerTitle, "Bob Marley & The Wailers", seconds))
            .Should().BeNull();
    }

    [Theory]
    [InlineData("Blinding Lights", "Blinding Light")]
    [InlineData("Blinding Lights", "Blinding Lights (Instrumental)")]
    [InlineData("Redbone", "Redbone (8-Bit Childish Gambino Emulation)")]
    [InlineData("Billie Jean", "Billie Jeans")]
    [InlineData("Get Lucky", "Get Lucky (Lullaby Version of Daft Punk)")]
    public void FR_PREVIEW_01_a_near_miss_of_the_title_is_rejected_even_when_the_length_is_exact(string recording, string deezer)
    {
        Pick(recording, "Some Artist", 200_000, Track("1", deezer, "Some Artist", 200)).Should().BeNull();
    }

    [Fact]
    public void FR_PREVIEW_01_a_longer_version_with_the_same_title_is_rejected_by_its_length()
    {
        // MusicBrainz's studio recording is 4:54; this is Deezer's 12-inch with the same words in the title.
        Pick("Billie Jean", "Michael Jackson", 294_000, Track("1", "Billie Jean", "Michael Jackson", 380)).Should().BeNull();
    }

    [Fact]
    public void FR_PREVIEW_01_the_long_version_is_rejected_by_its_title_as_well()
    {
        // Same length as the recording on purpose: only the title can reject it.
        Pick("Billie Jean", "Michael Jackson", 380_000, Track("1", "Billie Jean (Long Version)", "Michael Jackson", 380))
            .Should().BeNull();
    }

    [Theory]
    [InlineData("Billie Jean (live)", 375)]
    [InlineData("Billie Jean (Live 1987 FM Broadcast)", 374)]
    [InlineData("Billie Jean (Live in Bucharest)", 294)]
    public void FR_PREVIEW_01_a_live_version_is_rejected_whatever_its_length(string deezerTitle, int seconds)
    {
        Pick("Billie Jean", "Michael Jackson", 294_000, Track("1", deezerTitle, "Michael Jackson", seconds)).Should().BeNull();
    }

    [Fact]
    public void FR_PREVIEW_01_a_live_recording_matches_a_live_track_of_the_same_title()
    {
        Pick("Billie Jean (live)", "Michael Jackson", 375_000, Track("1", "Billie Jean (live)", "Michael Jackson", 375))
            .Should().Be("1");
    }

    [Theory]
    [InlineData("Lee Sang Gul")]
    [InlineData("Mellow Melodies")]
    [InlineData("Daft Punk Experience")]
    public void FR_PREVIEW_01_a_cover_by_another_artist_is_rejected(string coverArtist)
    {
        Pick("Redbone", "Childish Gambino", 326_000, Track("1", "Redbone", coverArtist, 326)).Should().BeNull();
    }

    [Fact]
    public void FR_PREVIEW_01_a_track_without_a_preview_never_matches()
    {
        Pick("Redbone", "Childish Gambino", 326_000, Track("1", "Redbone", "Childish Gambino", 326, preview: null)).Should().BeNull();
    }

    [Fact]
    public void FR_PREVIEW_01_a_recording_without_a_length_matches_nothing_because_nothing_can_be_checked()
    {
        Pick("Redbone", "Childish Gambino", null, Track("1", "Redbone", "Childish Gambino", 326)).Should().BeNull();
        Pick("Redbone", "Childish Gambino", 0, Track("1", "Redbone", "Childish Gambino", 326)).Should().BeNull();
    }

    [Fact]
    public void FR_PREVIEW_01_a_track_without_a_length_or_an_artist_matches_nothing()
    {
        var noLength = new DeezerTrack("1", "Redbone", PreviewUrl, null, "Childish Gambino", null);
        var noArtist = new DeezerTrack("2", "Redbone", PreviewUrl, null, null, 326);

        Pick("Redbone", "Childish Gambino", 326_000, noLength, noArtist).Should().BeNull();
    }

    [Theory]
    [InlineData("Beyoncé", "Beyonce")]
    [InlineData("BEYONCÉ", "beyoncé")]
    [InlineData("Simon & Garfunkel", "Simon and Garfunkel")]
    [InlineData("Guns N' Roses", "Guns N’ Roses")]
    [InlineData("A$AP Rocky", "A AP Rocky")]
    [InlineData("The  Weeknd", "The Weeknd")]
    public void FR_PREVIEW_01_case_accents_and_punctuation_do_not_make_two_artists_different(string a, string b)
    {
        Pick("Song", a, 200_000, Track("1", "Song", b, 200)).Should().Be("1");
    }

    [Fact]
    public void FR_PREVIEW_01_a_featuring_credit_is_the_artist_credits_business_and_not_the_titles()
    {
        // MusicBrainz: artist credit "Daft Punk feat. Pharrell Williams & Nile Rodgers", title "Get Lucky".
        // Deezer: artist "Daft Punk", title "Get Lucky (feat. Pharrell Williams and Nile Rodgers)".
        Pick(
                "Get Lucky",
                "Daft Punk feat. Pharrell Williams & Nile Rodgers",
                367_000,
                Track("1", "Get Lucky (feat. Pharrell Williams and Nile Rodgers)", "Daft Punk", 367))
            .Should().Be("1");
    }

    [Theory]
    [InlineData("Heroes - 2017 Remaster")]
    [InlineData("Heroes (2017 Remaster)")]
    [InlineData("Heroes (Remastered 2017)")]
    [InlineData("Heroes (Remastered)")]
    [InlineData("Heroes (Album Version)")]
    public void FR_PREVIEW_01_a_remaster_label_does_not_make_a_different_recording(string deezerTitle)
    {
        Pick("Heroes", "David Bowie", 370_000, Track("1", deezerTitle, "David Bowie", 370)).Should().Be("1");
    }

    [Theory]
    [InlineData("Heroes (Live Remastered 2017)")]
    [InlineData("Heroes - Live at Wembley - 2017 Remaster")]
    [InlineData("Heroes (Remix)")]
    [InlineData("Heroes (Radio Edit)")]
    [InlineData("Heroes (Acoustic)")]
    public void FR_PREVIEW_01_a_label_that_changes_the_recording_is_never_stripped(string deezerTitle)
    {
        Pick("Heroes", "David Bowie", 370_000, Track("1", deezerTitle, "David Bowie", 370)).Should().BeNull();
    }

    [Fact]
    public void FR_PREVIEW_01_of_several_that_pass_the_closest_length_wins_and_deezers_order_breaks_a_tie()
    {
        var first = Track("1", "Redbone", "Childish Gambino", 323);
        var closer = Track("2", "Redbone", "Childish Gambino", 327);
        var tie = Track("3", "Redbone", "Childish Gambino", 327);

        Pick("Redbone", "Childish Gambino", 326_933, first, closer, tie).Should().Be("2");
    }

    [Fact]
    public void FR_PREVIEW_01_a_title_of_only_punctuation_matches_nothing()
    {
        Pick("???", "Artist", 200_000, Track("1", "!!!", "Artist", 200)).Should().BeNull();
    }

    [Fact]
    public void FR_PREVIEW_01_the_search_asks_for_the_first_named_artist_and_the_title()
    {
        PreviewMatcher.SearchQuery("Get Lucky", "Daft Punk feat. Pharrell Williams & Nile Rodgers")
            .Should().Be("Daft Punk Get Lucky");
        PreviewMatcher.SearchQuery("Redbone", "Childish Gambino").Should().Be("Childish Gambino Redbone");
    }
}
