using System.Text.RegularExpressions;
using Microsoft.Extensions.DependencyInjection;
using Nodeable.Infrastructure.Deezer;
using WireMock.RequestBuilders;
using WireMock.ResponseBuilders;
using WireMock.Server;

namespace Nodeable.Infrastructure.Tests.Deezer;

public sealed class DeezerClientTests : IDisposable
{
    private const string Isrc = "USYAH1600107";

    private readonly WireMockServer _server = WireMockServer.Start();

    public void Dispose() => _server.Dispose();

    [Fact]
    public async Task FR_PREVIEW_01_a_track_is_found_by_isrc_with_its_preview_and_cover_id()
    {
        var ct = TestContext.Current.CancellationToken;
        Serve($"/track/isrc:{Isrc}", "track-by-isrc.json");
        await using var provider = DeezerTestHost.Build(_server);

        var track = await provider.GetRequiredService<IDeezerClient>().GetTrackByIsrcAsync(Isrc, ct);

        track.Should().NotBeNull();
        track.Id.Should().Be("350320101");
        track.Title.Should().Be("Redbone");
        track.PreviewUrl.Should().StartWith("https://cdnt-preview.dzcdn.net/").And.Contain("hdnea=exp=");
        track.CoverMd5.Should().Be("52a01335022b31b52b96106583ead686");
    }

    [Fact]
    public async Task FR_PREVIEW_01_a_search_returns_the_tracks_with_artist_and_whole_track_length()
    {
        var ct = TestContext.Current.CancellationToken;
        Serve("/search", "search-redbone.json");
        await using var provider = DeezerTestHost.Build(_server);

        var tracks = await provider.GetRequiredService<IDeezerClient>().SearchTracksAsync("Childish Gambino Redbone", ct);

        tracks.Should().HaveCount(5);
        var first = tracks[0];
        first.Id.Should().Be("435821782");
        first.Title.Should().Be("Redbone");
        first.ArtistName.Should().Be("Childish Gambino");
        first.DurationSeconds.Should().Be(326);
        first.CoverMd5.Should().Be("964acadabc2b6e286ce5e8e5add495a0");
        first.PreviewUrl.Should().StartWith("https://cdnt-preview.dzcdn.net/");

        var request = _server.LogEntries.Single().RequestMessage!;
        request.Query!.Should().ContainKey("q").WhoseValue.Should().Equal("Childish Gambino Redbone");
        request.Query.Should().ContainKey("limit").WhoseValue.Should().Equal("25");
    }

    [Fact]
    public async Task FR_PREVIEW_01_a_search_with_no_results_or_a_no_data_answer_is_an_empty_list()
    {
        var ct = TestContext.Current.CancellationToken;
        _server.Given(Request.Create().WithPath("/search").WithParam("q", "nothing here").UsingGet())
            .RespondWith(Response.Create().WithStatusCode(200).WithBody("""{"data":[],"total":0}"""));
        Serve("/search", "no-data.json");
        await using var provider = DeezerTestHost.Build(_server);
        var client = provider.GetRequiredService<IDeezerClient>();

        (await client.SearchTracksAsync("nothing here", ct)).Should().BeEmpty();
        (await client.SearchTracksAsync("something else", ct)).Should().BeEmpty();
    }

    [Fact]
    public async Task FR_PREVIEW_01_deezers_no_data_answer_is_null_and_not_an_error()
    {
        // Deezer reports a miss as HTTP 200 with {"error":{"code":800}}: the quirk is the client's, not the caller's.
        var ct = TestContext.Current.CancellationToken;
        Serve("/track/isrc:ZZZZ00000000", "no-data.json");
        await using var provider = DeezerTestHost.Build(_server);

        var track = await provider.GetRequiredService<IDeezerClient>().GetTrackByIsrcAsync("ZZZZ00000000", ct);

        track.Should().BeNull();
    }

    [Fact]
    public async Task FR_PREVIEW_01_a_missing_preview_is_null_and_not_an_empty_address()
    {
        var ct = TestContext.Current.CancellationToken;
        var recorded = DeezerTestHost.FixtureText("track-by-id.json");
        var withoutPreview = Regex.Replace(recorded, "\"preview\":\"[^\"]*\"", "\"preview\":\"\"");
        withoutPreview.Should().NotBe(recorded, "the fixture has a preview to take away");
        _server.Given(Request.Create().WithPath("/track/350320101").UsingGet())
            .RespondWith(Response.Create().WithStatusCode(200).WithBody(withoutPreview));
        await using var provider = DeezerTestHost.Build(_server);

        var track = await provider.GetRequiredService<IDeezerClient>().GetTrackAsync("350320101", ct);

        track.Should().NotBeNull();
        track.PreviewUrl.Should().BeNull();
    }

    [Theory]
    [InlineData(4, true)]
    [InlineData(700, true)]
    [InlineData(501, false)]
    public async Task FR_PREVIEW_01_a_quota_or_busy_error_is_transient_and_other_errors_are_not(int code, bool transient)
    {
        var ct = TestContext.Current.CancellationToken;
        var body = "{\"error\":{\"type\":\"Exception\",\"message\":\"x\",\"code\":" + code + "}}";
        _server.Given(Request.Create().WithPath($"/track/isrc:{Isrc}").UsingGet())
            .RespondWith(Response.Create().WithStatusCode(200).WithBody(body));
        await using var provider = DeezerTestHost.Build(_server);

        var act = () => provider.GetRequiredService<IDeezerClient>().GetTrackByIsrcAsync(Isrc, ct);

        (await act.Should().ThrowAsync<DeezerException>()).Which.IsTransient.Should().Be(transient);
    }

    [Fact]
    public async Task NFR_RATE_03_a_busy_deezer_is_retried_a_bounded_number_of_times()
    {
        var ct = TestContext.Current.CancellationToken;
        _server.Given(Request.Create().WithPath($"/track/isrc:{Isrc}").UsingGet())
            .RespondWith(Response.Create().WithStatusCode(503));
        await using var provider = DeezerTestHost.Build(_server);

        var act = () => provider.GetRequiredService<IDeezerClient>().GetTrackByIsrcAsync(Isrc, ct);

        (await act.Should().ThrowAsync<DeezerException>()).Which.IsTransient.Should().BeTrue();
        _server.LogEntries.Should().HaveCount(3, "one attempt and the two retries Deezer:MaxRetries allows");
    }

    [Fact]
    public async Task NFR_RATE_01_every_attempt_waits_for_a_slot_in_deezers_own_gate()
    {
        var ct = TestContext.Current.CancellationToken;
        _server.Given(Request.Create().WithPath($"/track/isrc:{Isrc}").UsingGet())
            .RespondWith(Response.Create().WithStatusCode(503));
        var gate = new DeezerTestHost.CountingGate();
        await using var provider = DeezerTestHost.Build(_server, gate);

        var act = () => provider.GetRequiredService<IDeezerClient>().GetTrackByIsrcAsync(Isrc, ct);
        await act.Should().ThrowAsync<DeezerException>();

        gate.Acquired.Should().Be(_server.LogEntries.Count, "a retry is a new request and takes a new slot");
    }

    private void Serve(string path, string fixture) =>
        _server.Given(Request.Create().WithPath(path).UsingGet())
            .RespondWith(Response.Create().WithStatusCode(200)
                .WithHeader("Content-Type", "application/json; charset=utf-8")
                .WithBody(DeezerTestHost.FixtureText(fixture)));
}
