using System.Net;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Nodeable.Domain.Dates;
using Nodeable.Domain.Entities;
using Nodeable.Domain.Enums;
using Nodeable.Domain.Search;
using Nodeable.Infrastructure.MusicBrainz;
using Nodeable.Infrastructure.Persistence;
using Nodeable.Infrastructure.RateLimiting;
using Nodeable.Infrastructure.Search;
using Nodeable.Infrastructure.Tests.Crawling;
using Nodeable.Infrastructure.Tests.MusicBrainz;
using Nodeable.Tests.Containers;
using WireMock.RequestBuilders;
using WireMock.ResponseBuilders;
using WireMock.Server;
using static Nodeable.Infrastructure.Tests.Crawling.CrawlTestSupport;

namespace Nodeable.Infrastructure.Tests.Search;

// Search runs against a real PostgreSQL (the trigram index) and real MusicBrainz responses served by WireMock.
// A span listener is global to the process: while one is registered, every Nodeable span in every test is recorded and
// its trace context stored. Classes that register a listener, or assert that none exists, run one after the other.
[Collection(CrawlTestSupport.SpanListenerCollection)]
public sealed class RecordingSearchServiceTests(PostgresFixture postgres) : IDisposable
{
    // The recordings in Fixtures/musicbrainz/search-recordings-duplicates.json: a real search for Redbone by Childish Gambino.
    private static readonly Guid _studio = Guid.Parse("7408f11c-6c4e-41e5-b81b-6a15bf6cb268");
    private static readonly Guid _promo = Guid.Parse("ac5977af-d4dc-4636-b867-b02e15d2f6d8");
    private static readonly Guid _djMix2017 = Guid.Parse("e493730c-06d8-40b6-9c9e-c86dcc85ca4b");
    private static readonly Guid _liveCoachella = Guid.Parse("b728e7b1-ab7d-437c-b807-6eb4f3ad8f01");
    private static readonly Guid _liveForum = Guid.Parse("90401b17-f5f3-4357-8d08-e7676c950b0d");
    private static readonly Guid _liveCampFlogGnaw = Guid.Parse("422dce40-a0fd-4c16-9b14-d8ce147073c7");
    private static readonly Guid _djMix2026 = Guid.Parse("7a0816a7-a8b4-4f2e-b5dd-81f1d0aff437");

    private readonly WireMockServer _server = WireMockServer.Start();

    public void Dispose() => _server.Dispose();

    [Fact]
    public async Task FR_SEARCH_02_a_search_folds_live_compilation_and_promo_copies_behind_the_original()
    {
        var ct = TestContext.Current.CancellationToken;
        ServeSearch("search-recordings-duplicates.json");
        await using var db = Context(await NewDatabaseAsync(postgres));
        using var provider = MusicBrainzTestHost.Build(_server);
        var service = Service(db, provider);

        var outcome = await service.SearchAsync("Redbone", "Childish Gambino", ct);

        outcome.Source.Should().Be(SearchSource.MusicBrainz);

        // Eleven recordings come back; seven are the same song, so five rows are left: the song, a radio edit and three remixes.
        outcome.Groups.Select(g => g.Primary.Title).Should().Equal(
            "Redbone",
            "Redbone (radio edit)",
            "Redbone (WBBL remix)",
            "Redbone (Tsunxmi remix)",
            "Redbone (Nick Bike edit)");

        var song = outcome.Groups[0];
        song.Primary.Mbid.Should().Be(_studio);
        song.Primary.FirstReleaseTitle.Should().Be("Awaken, My Love!");
        song.Primary.FirstReleaseDate!.Value.Date.Year.Should().Be(2016);

        // Earliest first; each says why it was folded.
        song.Versions.Select(v => (v.Candidate.Mbid, v.Kind)).Should().Equal(
            (_promo, VersionKind.Compilation),
            (_djMix2017, VersionKind.Compilation),
            (_liveCoachella, VersionKind.Live),
            (_liveForum, VersionKind.Live),
            (_liveCampFlogGnaw, VersionKind.Live),
            (_djMix2026, VersionKind.Compilation));
        song.Versions.Single(v => v.Candidate.Mbid == _djMix2017).Candidate.Disambiguation
            .Should().Contain("Annie Mac Presents 2017");
    }

    [Fact]
    public async Task FR_SEARCH_02_a_song_with_dozens_of_recordings_is_one_row_that_shows_its_1992_original()
    {
        var ct = TestContext.Current.CancellationToken;

        // Found by running the real stack: 30 recordings of "Creep" by Radiohead, bootlegs, live albums and
        // compilations among them. The row must be the 1992 single, not whichever copy came first.
        ServeSearch("search-recordings-creep.json");
        await using var db = Context(await NewDatabaseAsync(postgres));
        using var provider = MusicBrainzTestHost.Build(_server);

        var outcome = await Service(db, provider).SearchAsync("Creep", "Radiohead", ct);

        var group = outcome.Groups.Should().ContainSingle().Subject;
        group.Primary.Mbid.Should().Be(Guid.Parse("70595637-9310-45f2-a266-58f8de4874a7"));
        group.Primary.FirstReleaseDate!.Value.Date.Should().Be(new DateOnly(1992, 9, 21));
        group.Primary.FirstReleaseTitle.Should().Be("Creep");
        group.Versions.Should().HaveCount(29);
        group.Versions.Should().OnlyContain(v => v.Candidate.Title == "Creep");
    }

    [Fact]
    public async Task FR_SEARCH_01_search_asks_musicbrainz_for_enough_recordings_to_still_fill_a_page_after_collapsing()
    {
        var ct = TestContext.Current.CancellationToken;
        ServeSearch("search-recordings-duplicates.json");
        await using var db = Context(await NewDatabaseAsync(postgres));
        using var provider = MusicBrainzTestHost.Build(_server);

        await Service(db, provider).SearchAsync("Redbone", "Childish Gambino", ct);

        var query = _server.LogEntries.Single().RequestMessage!.Query!;
        query["limit"].Single().Should().Be("30");
        query["query"].Single().Should().Be("+recording:\"Redbone\" +artist:\"Childish Gambino\" status:official^10");
    }

    [Fact]
    public async Task FR_SEARCH_01_results_say_what_the_cache_already_holds_for_each_recording()
    {
        var ct = TestContext.Current.CancellationToken;
        ServeSearch("search-recordings-duplicates.json");
        var connectionString = await NewDatabaseAsync(postgres);
        await using (var seed = Context(connectionString))
        {
            seed.Recordings.AddRange(
                NewRecording(_studio, "Redbone", "Childish Gambino", CreditsStatus.Complete),
                NewRecording(_liveForum, "Redbone", "Childish Gambino", CreditsStatus.None));
            await seed.SaveChangesAsync(ct);
        }

        await using var db = Context(connectionString);
        using var provider = MusicBrainzTestHost.Build(_server);

        var outcome = await Service(db, provider).SearchAsync("Redbone", "Childish Gambino", ct);

        outcome.Source.Should().Be(SearchSource.MusicBrainz);
        outcome.CachedStatuses.Should().Contain(new KeyValuePair<Guid, CreditsStatus>(_studio, CreditsStatus.Complete));
        outcome.CachedStatuses.Should().Contain(new KeyValuePair<Guid, CreditsStatus>(_liveForum, CreditsStatus.None));
        outcome.CachedStatuses.Should().NotContainKey(_promo);
    }

    [Fact]
    public async Task FR_SEARCH_01_the_cache_answers_alone_when_it_fills_the_page_and_musicbrainz_is_not_asked()
    {
        var ct = TestContext.Current.CancellationToken;
        var connectionString = await NewDatabaseAsync(postgres);
        string[] suffixes = ["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Golf", "Hotel", "India", "Juliet"];
        await using (var seed = Context(connectionString))
        {
            seed.Recordings.AddRange(suffixes.Select((s, i) => NewRecording(Mbid(i + 1), $"Love Song {s}", $"Artist {s}", CreditsStatus.Partial)));
            await seed.SaveChangesAsync(ct);
        }

        await using var db = Context(connectionString);
        using var provider = MusicBrainzTestHost.Build(_server);

        var outcome = await Service(db, provider).SearchAsync("Love Song", null, ct);

        outcome.Source.Should().Be(SearchSource.Cache);
        outcome.Groups.Should().HaveCount(10);
        outcome.Groups.Should().OnlyContain(g => g.Primary.Score > 0 && g.Primary.Score <= 100);
        _server.LogEntries.Should().BeEmpty();
    }

    [Fact]
    public async Task FR_SEARCH_01_a_cache_with_too_few_matches_is_not_trusted_to_be_the_whole_catalogue()
    {
        var ct = TestContext.Current.CancellationToken;
        ServeSearch("search-recordings-duplicates.json");
        var connectionString = await NewDatabaseAsync(postgres);
        await using (var seed = Context(connectionString))
        {
            seed.Recordings.Add(NewRecording(_studio, "Redbone", "Childish Gambino", CreditsStatus.Complete));
            await seed.SaveChangesAsync(ct);
        }

        await using var db = Context(connectionString);
        using var provider = MusicBrainzTestHost.Build(_server);

        var outcome = await Service(db, provider).SearchAsync("Redbone", null, ct);

        outcome.Source.Should().Be(SearchSource.MusicBrainz);
        _server.LogEntries.Should().ContainSingle();
    }

    [Fact]
    public async Task FR_SEARCH_01_the_artist_narrows_cached_matches_and_percent_signs_are_literal()
    {
        var ct = TestContext.Current.CancellationToken;
        ServeSearch("search-recordings-duplicates.json");
        var connectionString = await NewDatabaseAsync(postgres);
        await using (var seed = Context(connectionString))
        {
            seed.Recordings.AddRange(
                NewRecording(Mbid(1), "Redbone", "Childish Gambino", CreditsStatus.Complete),
                NewRecording(Mbid(2), "Redbone", "100% Cover Band", CreditsStatus.None),
                NewRecording(Mbid(3), "Redbone", "Another Band", CreditsStatus.None));
            await seed.SaveChangesAsync(ct);
        }

        await using var db = Context(connectionString);
        using var provider = MusicBrainzTestHost.Build(_server);

        // MaxResults 1: the cache fills the page, so MusicBrainz is not involved and only the cached filter is under test.
        var byArtist = await Service(db, provider, maxResults: 1).SearchAsync("Redbone", "gambino", ct);
        var byPercent = await Service(db, provider, maxResults: 1).SearchAsync("Redbone", "100%", ct);
        var byWildcard = await Service(db, provider, maxResults: 3).SearchAsync("Redbone", "%", ct);

        byArtist.Groups.Should().ContainSingle().Which.Primary.Mbid.Should().Be(Mbid(1));
        byPercent.Groups.Should().ContainSingle().Which.Primary.Mbid.Should().Be(Mbid(2));

        // A lone "%" is a literal: only one cached artist contains it, which is too few to trust, so MusicBrainz is asked.
        // Unescaped it would match all three artists and the cache would fill the page alone.
        byWildcard.Source.Should().Be(SearchSource.MusicBrainz);
        _server.LogEntries.Should().HaveCount(1);
    }

    [Fact]
    public async Task FR_SEARCH_01_cached_releases_give_the_first_release_title_and_year_even_without_a_status()
    {
        var ct = TestContext.Current.CancellationToken;
        var connectionString = await NewDatabaseAsync(postgres);
        await using (var seed = Context(connectionString))
        {
            var recording = NewRecording(Mbid(1), "Redbone", "Childish Gambino", CreditsStatus.Complete);
            recording.SetFirstReleaseDate(new PartialDate(new DateOnly(2016, 11, 17), DatePrecision.Day));
            var late = new Release { Mbid = Mbid(11), Title = "Greatest Hits", FetchedAt = DateTimeOffset.UtcNow };
            late.SetDate(new PartialDate(new DateOnly(2020, 1, 1), DatePrecision.Year));
            var early = new Release { Mbid = Mbid(12), Title = "Awaken, My Love!", FetchedAt = DateTimeOffset.UtcNow };
            early.SetDate(new PartialDate(new DateOnly(2016, 12, 2), DatePrecision.Day));

            seed.Recordings.Add(recording);
            seed.Releases.AddRange(late, early);
            await seed.SaveChangesAsync(ct);
            seed.RecordingReleases.AddRange(
                new RecordingRelease { RecordingMbid = Mbid(1), ReleaseMbid = Mbid(11) },
                new RecordingRelease { RecordingMbid = Mbid(1), ReleaseMbid = Mbid(12) });
            await seed.SaveChangesAsync(ct);
        }

        await using var db = Context(connectionString);
        using var provider = MusicBrainzTestHost.Build(_server);

        var outcome = await Service(db, provider, maxResults: 1).SearchAsync("Redbone", null, ct);

        var primary = outcome.Groups.Should().ContainSingle().Subject.Primary;
        primary.FirstReleaseTitle.Should().Be("Awaken, My Love!");
        primary.FirstReleaseDate!.Value.Date.Year.Should().Be(2016);
    }

    [Fact]
    public async Task NFR_RATE_01_a_gate_with_no_slot_inside_the_wait_cap_refuses_the_search_instead_of_waiting()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var db = Context(await NewDatabaseAsync(postgres));
        using var provider = MusicBrainzTestHost.Build(_server, gate: new SaturatedGate(TimeSpan.FromSeconds(2)));

        var act = () => Service(db, provider).SearchAsync("Redbone", null, ct);

        var thrown = (await act.Should().ThrowAsync<MusicBrainzUnavailableException>()).Which;
        thrown.Failure.Should().Be(MusicBrainzFailure.RateLimited);
        thrown.RetryAfter.Should().Be(TimeSpan.FromSeconds(2));
        _server.LogEntries.Should().BeEmpty();
    }

    [Fact]
    public async Task NFR_RATE_03_a_search_that_keeps_getting_503_gives_up_as_upstream_unavailable()
    {
        var ct = TestContext.Current.CancellationToken;
        _server.Given(Request.Create().WithPath("/ws/2/recording").UsingGet())
            .RespondWith(Response.Create().WithStatusCode(503).WithBody(MusicBrainzTestHost.FixtureText("error-503.json")));
        await using var db = Context(await NewDatabaseAsync(postgres));
        using var provider = MusicBrainzTestHost.Build(_server, settings: new() { ["MusicBrainz:MaxRetries"] = "1" });

        var act = () => Service(db, provider).SearchAsync("Redbone", null, ct);

        var thrown = (await act.Should().ThrowAsync<MusicBrainzUnavailableException>()).Which;
        thrown.Failure.Should().Be(MusicBrainzFailure.UpstreamUnavailable);

        // One attempt and one retry: the interactive profile keeps a search from waiting through five backoffs.
        _server.LogEntries.Should().HaveCount(2);
    }

    [Fact]
    public async Task FR_SEARCH_01_a_search_musicbrainz_rejects_is_an_upstream_error_not_an_outage()
    {
        var ct = TestContext.Current.CancellationToken;
        _server.Given(Request.Create().WithPath("/ws/2/recording").UsingGet())
            .RespondWith(Response.Create().WithStatusCode(400).WithBody("{\"error\":\"Invalid query\"}"));
        await using var db = Context(await NewDatabaseAsync(postgres));
        using var provider = MusicBrainzTestHost.Build(_server);

        var act = () => Service(db, provider).SearchAsync("Redbone", null, ct);

        (await act.Should().ThrowAsync<MusicBrainzUnavailableException>()).Which.Failure.Should().Be(MusicBrainzFailure.UpstreamError);
    }

    [Fact]
    public async Task NFR_OBS_01_a_search_is_one_span_that_says_where_the_answer_came_from()
    {
        var ct = TestContext.Current.CancellationToken;
        ServeSearch("search-recordings-duplicates.json");
        await using var db = Context(await NewDatabaseAsync(postgres));
        using var provider = MusicBrainzTestHost.Build(_server);
        using var spans = new SpanCollector();

        await Service(db, provider).SearchAsync("Redbone", "Childish Gambino", ct);

        var span = spans.Stopped.Single(a => a.OperationName == "search.recordings");
        span.GetTagItem("search.source").Should().Be("musicbrainz");
        span.GetTagItem("search.candidates").Should().Be(11);
        span.GetTagItem("search.results").Should().Be(5);
        span.GetTagItem("search.collapsed").Should().Be(6);
        span.GetTagItem("search.cache_matches").Should().Be(0);
    }

    private static RecordingSearchService Service(NodeableDbContext db, ServiceProvider provider, int maxResults = 10) =>
        new(db, provider.GetRequiredService<IMusicBrainzClient>(), Options.Create(new SearchOptions { MaxResults = maxResults }));

    private static Recording NewRecording(Guid mbid, string title, string artist, CreditsStatus status) => new()
    {
        Mbid = mbid,
        Title = title,
        ArtistCredit = artist,
        CreditsStatus = status,
        FetchedAt = DateTimeOffset.UtcNow,
    };

    private void ServeSearch(string fixture) =>
        _server.Given(Request.Create().WithPath("/ws/2/recording").UsingGet())
            .RespondWith(Response.Create()
                .WithStatusCode(HttpStatusCode.OK)
                .WithHeader("Content-Type", "application/json")
                .WithBody(MusicBrainzTestHost.FixtureText(fixture)));

    private sealed class SaturatedGate(TimeSpan maxWait) : IRateGate
    {
        public string Resource => "musicbrainz";

        public Task<TimeSpan> AcquireAsync(CancellationToken cancellationToken = default) =>
            throw new RateGateSaturatedException(Resource, maxWait);
    }
}
