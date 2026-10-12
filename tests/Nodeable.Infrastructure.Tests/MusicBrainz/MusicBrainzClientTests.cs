using System.Diagnostics;
using System.Net;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Nodeable.Domain.Dates;
using Nodeable.Domain.Enums;
using Nodeable.Domain.Mapping;
using Nodeable.Infrastructure.MusicBrainz;
using WireMock.RequestBuilders;
using WireMock.ResponseBuilders;
using WireMock.Server;

namespace Nodeable.Infrastructure.Tests.MusicBrainz;

// The client runs against real MusicBrainz responses (see Fixtures/musicbrainz/README.md) served by WireMock.
public sealed class MusicBrainzClientTests : IDisposable
{
    private static readonly Guid _recordingMbid = Guid.Parse("7408f11c-6c4e-41e5-b81b-6a15bf6cb268");
    private static readonly Guid _workMbid = Guid.Parse("c44370d6-70af-454f-8381-021d1f7b6fac");
    private static readonly Guid _releaseMbid = Guid.Parse("e84b58bb-e852-402a-8f01-cb5a9f5229b5");

    private readonly WireMockServer _server = WireMockServer.Start();

    public void Dispose() => _server.Dispose();

    [Fact]
    public async Task FR_SEARCH_01_search_returns_typed_matches_with_artist_score_and_a_partial_date()
    {
        var ct = TestContext.Current.CancellationToken;
        Serve("/ws/2/recording", "search-recordings.json");
        await using var provider = MusicBrainzTestHost.Build(_server);
        var client = provider.GetRequiredService<IMusicBrainzClient>();

        var response = await client.SearchRecordingsAsync("Redbone", "Childish Gambino", cancellationToken: ct);

        response.Count.Should().Be(11);
        response.Recordings.Should().HaveCount(3);
        var first = response.Recordings[0];
        first.Id.Should().Be(Guid.Parse("ac5977af-d4dc-4636-b867-b02e15d2f6d8"));
        first.Score.Should().Be(100);
        first.Title.Should().Be("Redbone");
        first.ArtistCredit.Should().ContainSingle().Which.Name.Should().Be("Childish Gambino");
        first.Releases.Should().ContainSingle();

        // MusicBrainz sent "2016" for this recording: the domain turns it into a year-precision date.
        first.FirstReleaseDate.Should().Be("2016");
        PartialDate.TryParse(first.FirstReleaseDate, out var date).Should().BeTrue();
        date.Precision.Should().Be(DatePrecision.Year);
    }

    [Fact]
    public async Task FR_SEARCH_01_search_sends_the_quoted_title_and_artist_and_asks_for_json()
    {
        var ct = TestContext.Current.CancellationToken;
        Serve("/ws/2/recording", "search-recordings.json");
        await using var provider = MusicBrainzTestHost.Build(_server);
        var client = provider.GetRequiredService<IMusicBrainzClient>();

        await client.SearchRecordingsAsync("Say \"Hello\"", "Childish Gambino", 10, ct);

        var query = _server.LogEntries.Single().RequestMessage!.Query!;
        query["query"].Single().Should().Be("+recording:\"Say \\\"Hello\\\"\" +artist:\"Childish Gambino\" status:official^10");
        query["fmt"].Single().Should().Be("json");
        query["limit"].Single().Should().Be("10");
    }

    [Fact]
    public async Task FR_SEARCH_01_every_request_carries_the_user_agent_with_the_configured_contact()
    {
        var ct = TestContext.Current.CancellationToken;
        Serve("/ws/2/work/*", "work-lookup.json");
        await using var provider = MusicBrainzTestHost.Build(_server);
        var client = provider.GetRequiredService<IMusicBrainzClient>();

        await client.GetWorkAsync(_workMbid, ct);

        var userAgent = _server.LogEntries.Single().RequestMessage!.Headers!["User-Agent"].Single();
        userAgent.Should().Be($"Nodeable/{MusicBrainzUserAgent.CurrentVersion()} ( {MusicBrainzTestHost.ContactUrl} )");
        userAgent.Should().MatchRegex(@"^Nodeable/\d+\.\d+\.\d+ \( https://");
    }

    [Fact]
    public async Task FR_GRAPH_03_recording_lookup_returns_credits_the_work_link_the_isrc_and_the_releases()
    {
        var ct = TestContext.Current.CancellationToken;
        Serve("/ws/2/recording/*", "recording-lookup.json");
        await using var provider = MusicBrainzTestHost.Build(_server);
        var client = provider.GetRequiredService<IMusicBrainzClient>();

        var recording = await client.GetRecordingAsync(_recordingMbid, ct);

        recording.Should().NotBeNull();
        recording!.Title.Should().Be("Redbone");
        recording.LengthMs.Should().Be(326933);
        recording.FirstReleaseDate.Should().Be("2016-11-17");
        recording.Isrcs.Should().Equal("USYAH1600107");
        recording.Releases.Should().HaveCount(15);
        recording.Relations.Should().HaveCount(17);

        var producer = recording.Relations!.Single(r => r.Type == "producer");
        producer.Artist!.Name.Should().Be("Ludwig Göransson");
        producer.Artist.Id.Should().Be(Guid.Parse(producer.Artist.Id.ToString()));
        producer.Artist.Type.Should().Be("Person");

        var work = recording.Relations!.Single(r => r.TargetType == "work");
        work.Work!.Id.Should().Be(_workMbid);

        var request = _server.LogEntries.Single().RequestMessage!;
        request.Path.Should().Be($"/ws/2/recording/{_recordingMbid:D}");
        request.Query!["fmt"].Single().Should().Be("json");
    }

    [Fact]
    public async Task FR_GRAPH_03_relationships_from_the_recording_map_to_the_roles_in_the_spec()
    {
        var ct = TestContext.Current.CancellationToken;
        Serve("/ws/2/recording/*", "recording-lookup.json");
        await using var provider = MusicBrainzTestHost.Build(_server);
        var client = provider.GetRequiredService<IMusicBrainzClient>();

        var recording = await client.GetRecordingAsync(_recordingMbid, ct);

        // The typed relation feeds RoleMapper directly: type for the role, attributes for the detail.
        var mapped = recording!.Relations!
            .Where(r => r.Artist is not null)
            .Select(r => (Person: r.Artist!.Name, Credit: RoleMapper.Map(r.Type, r.Attributes)))
            .ToList();

        mapped.Should().Contain(("Ludwig Göransson", new MappedRole(CreditRole.Producer, string.Empty)));
        mapped.Should().Contain(("Ludwig Göransson", new MappedRole(CreditRole.Instrument, "bass guitar")));
        mapped.Should().Contain(("Riley Mackin", new MappedRole(CreditRole.Engineering, string.Empty)));
        mapped.Should().Contain(("Donald Glover", new MappedRole(CreditRole.Vocal, string.Empty)));

        // "mix" with the attribute "additional" is a Mixing credit; attributes only matter for instruments and vocals.
        mapped.Where(m => m.Credit.Role == CreditRole.Mixing).Select(m => m.Credit.Detail).Should().OnlyContain(d => d == string.Empty);
    }

    [Fact]
    public async Task FR_GRAPH_03_a_recording_with_no_relationships_comes_back_with_none()
    {
        var ct = TestContext.Current.CancellationToken;
        Serve("/ws/2/recording/*", "recording-lookup-no-credits.json");
        await using var provider = MusicBrainzTestHost.Build(_server);
        var client = provider.GetRequiredService<IMusicBrainzClient>();

        var recording = await client.GetRecordingAsync(Guid.Parse("ac5977af-d4dc-4636-b867-b02e15d2f6d8"), ct);

        recording.Should().NotBeNull();
        recording!.Relations.Should().BeNullOrEmpty();
        recording.Isrcs.Should().BeNullOrEmpty();
    }

    [Fact]
    public async Task FR_GRAPH_03_work_lookup_returns_composer_and_lyricist_relationships()
    {
        var ct = TestContext.Current.CancellationToken;
        Serve("/ws/2/work/*", "work-lookup.json");
        await using var provider = MusicBrainzTestHost.Build(_server);
        var client = provider.GetRequiredService<IMusicBrainzClient>();

        var work = await client.GetWorkAsync(_workMbid, ct);

        work!.Title.Should().Be("Redbone");
        work.Relations!.Select(r => r.Type).Should().BeEquivalentTo("composer", "composer", "lyricist", "lyricist", "lyricist");
        work.Relations!.Select(r => RoleMapper.Map(r.Type).Role).Should().OnlyContain(role => role == CreditRole.Songwriter);
    }

    [Fact]
    public async Task FR_GRAPH_03_release_lookup_returns_the_title_and_a_full_date()
    {
        var ct = TestContext.Current.CancellationToken;
        Serve("/ws/2/release/*", "release-lookup.json");
        await using var provider = MusicBrainzTestHost.Build(_server);
        var client = provider.GetRequiredService<IMusicBrainzClient>();

        var release = await client.GetReleaseAsync(_releaseMbid, ct);

        release!.Title.Should().Be("“Awaken, My Love!”");
        PartialDate.TryParse(release.Date, out var date).Should().BeTrue();
        date.Date.Should().Be(new DateOnly(2016, 12, 2));
        date.Precision.Should().Be(DatePrecision.Day);
    }

    [Fact]
    public async Task FR_GRAPH_03_an_mbid_musicbrainz_does_not_know_returns_null()
    {
        var ct = TestContext.Current.CancellationToken;
        _server.Given(Request.Create().WithPath("/ws/2/recording/*").UsingGet())
            .RespondWith(Response.Create().WithStatusCode(404).WithBody("""{"error":"Not Found"}"""));
        await using var provider = MusicBrainzTestHost.Build(_server);
        var client = provider.GetRequiredService<IMusicBrainzClient>();

        var recording = await client.GetRecordingAsync(Guid.NewGuid(), ct);

        recording.Should().BeNull();
        _server.LogEntries.Should().ContainSingle("a 404 is an answer, not a failure to retry");
    }

    [Fact]
    public async Task FR_GRAPH_03_a_response_missing_a_required_field_fails_instead_of_leaving_nulls()
    {
        var ct = TestContext.Current.CancellationToken;
        _server.Given(Request.Create().WithPath("/ws/2/work/*").UsingGet())
            .RespondWith(Response.Create().WithStatusCode(200).WithHeader("Content-Type", "application/json")
                .WithBody("""{"id":"c44370d6-70af-454f-8381-021d1f7b6fac"}"""));
        await using var provider = MusicBrainzTestHost.Build(_server);
        var client = provider.GetRequiredService<IMusicBrainzClient>();

        Func<Task> lookup = () => client.GetWorkAsync(_workMbid, ct);

        await lookup.Should().ThrowAsync<System.Text.Json.JsonException>();
    }

    [Fact]
    public async Task NFR_RATE_03_a_503_is_retried_until_the_request_succeeds()
    {
        var ct = TestContext.Current.CancellationToken;
        ServeSequence("/ws/2/work/*", Busy(), Busy(), Ok("work-lookup.json"));
        await using var provider = MusicBrainzTestHost.Build(_server);
        var client = provider.GetRequiredService<IMusicBrainzClient>();

        var work = await client.GetWorkAsync(_workMbid, ct);

        work!.Title.Should().Be("Redbone");
        _server.LogEntries.Should().HaveCount(3);
    }

    [Fact]
    public async Task NFR_RATE_03_a_429_waits_for_the_retry_after_header_the_server_sent()
    {
        var ct = TestContext.Current.CancellationToken;
        ServeSequence(
            "/ws/2/work/*",
            Response.Create().WithStatusCode(429).WithHeader("Retry-After", "1").WithBody("""{"error":"slow down"}"""),
            Ok("work-lookup.json"));
        await using var provider = MusicBrainzTestHost.Build(_server);
        var client = provider.GetRequiredService<IMusicBrainzClient>();

        var stopwatch = Stopwatch.StartNew();
        var work = await client.GetWorkAsync(_workMbid, ct);
        stopwatch.Stop();

        work.Should().NotBeNull();
        _server.LogEntries.Should().HaveCount(2);

        // The configured backoff is 10 ms, so a wait near a second can only come from the header.
        stopwatch.Elapsed.Should().BeGreaterThan(TimeSpan.FromMilliseconds(900));
    }

    [Fact]
    public async Task NFR_RATE_03_gives_up_after_five_retries_and_reports_what_musicbrainz_said()
    {
        var ct = TestContext.Current.CancellationToken;
        _server.Given(Request.Create().WithPath("/ws/2/work/*").UsingGet()).RespondWith(Busy());
        await using var provider = MusicBrainzTestHost.Build(_server);
        var client = provider.GetRequiredService<IMusicBrainzClient>();

        Func<Task> lookup = () => client.GetWorkAsync(_workMbid, ct);

        var thrown = await lookup.Should().ThrowAsync<MusicBrainzException>();
        thrown.Which.StatusCode.Should().Be(HttpStatusCode.ServiceUnavailable);
        thrown.Which.Message.Should().Contain("currently busy");

        // One attempt and five retries. If the standard handler from ServiceDefaults were still in the pipeline the
        // retry layers would multiply and this number would be larger.
        _server.LogEntries.Should().HaveCount(6);
    }

    [Fact]
    public async Task NFR_RATE_03_an_error_that_would_fail_again_is_not_retried()
    {
        var ct = TestContext.Current.CancellationToken;
        _server.Given(Request.Create().WithPath("/ws/2/work/*").UsingGet())
            .RespondWith(Response.Create().WithStatusCode(400).WithBody("""{"error":"Invalid mbid."}"""));
        await using var provider = MusicBrainzTestHost.Build(_server);
        var client = provider.GetRequiredService<IMusicBrainzClient>();

        Func<Task> lookup = () => client.GetWorkAsync(_workMbid, ct);

        var thrown = await lookup.Should().ThrowAsync<MusicBrainzException>();
        thrown.Which.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        _server.LogEntries.Should().ContainSingle();
    }

    [Fact]
    public async Task FR_SEARCH_01_the_app_will_not_start_without_a_contact_url()
    {
        await using var provider = MusicBrainzTestHost.Build(_server, settings: new() { ["MusicBrainz:ContactUrl"] = "" });

        Action read = () => _ = provider.GetRequiredService<IOptions<MusicBrainzOptions>>().Value;

        read.Should().Throw<OptionsValidationException>().WithMessage("*ContactUrl*");
    }

    [Theory]
    [InlineData("Redbone", "\"Redbone\"")]
    [InlineData("Say \"Hello\"", "\"Say \\\"Hello\\\"\"")]
    [InlineData("Back\\slash", "\"Back\\\\slash\"")]
    public void FR_SEARCH_01_search_phrases_are_quoted_and_escaped(string phrase, string expected)
    {
        MusicBrainzClient.Quote(phrase).Should().Be(expected);
    }

    // The response WireMock sends for a request path: a recorded MusicBrainz body with a JSON content type.
    private static IResponseBuilder Ok(string fixture) => Response.Create()
        .WithStatusCode(200)
        .WithHeader("Content-Type", "application/json; charset=utf-8")
        .WithBody(MusicBrainzTestHost.FixtureText(fixture));

    private static IResponseBuilder Busy() => Response.Create()
        .WithStatusCode(503)
        .WithHeader("Content-Type", "application/json; charset=utf-8")
        .WithBody(MusicBrainzTestHost.FixtureText("error-503.json"));

    private void Serve(string path, string fixture) =>
        _server.Given(Request.Create().WithPath(path).UsingGet()).RespondWith(Ok(fixture));

    // WireMock scenarios move through states: each request gets the next response in the list, and the last one repeats.
    private void ServeSequence(string path, params IResponseBuilder[] responses)
    {
        const string scenario = "sequence";
        for (var i = 0; i < responses.Length; i++)
        {
            var state = i == 0 ? null : $"step-{i}";
            var mapping = _server.Given(Request.Create().WithPath(path).UsingGet()).InScenario(scenario);
            if (state is not null)
            {
                mapping = mapping.WhenStateIs(state);
            }

            if (i < responses.Length - 1)
            {
                mapping = mapping.WillSetStateTo($"step-{i + 1}");
            }

            mapping.RespondWith(responses[i]);
        }
    }
}
