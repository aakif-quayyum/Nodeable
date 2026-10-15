using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Nodeable.Domain.Crawling;
using Nodeable.Domain.Entities;
using Nodeable.Domain.Enums;
using Nodeable.Domain.Graphs;
using Nodeable.Infrastructure.Graphs;
using Nodeable.Infrastructure.MusicBrainz;
using Nodeable.Tests.Containers;
using static Nodeable.Infrastructure.Tests.Crawling.CrawlTestSupport;

namespace Nodeable.Infrastructure.Tests.Graphs;

// The graph operations run against a real PostgreSQL. MusicBrainz's recording lookup and the hub are stand-ins.
public class GraphServiceTests(PostgresFixture postgres)
{
    private static readonly Guid _redbone = Guid.Parse("7408f11c-6c4e-41e5-b81b-6a15bf6cb268");
    private static readonly Guid _stay = Guid.Parse("ac5977af-d4dc-4636-b867-b02e15d2f6d8");
    private static readonly Guid _donald = Guid.Parse("0e9a2dd2-4d9b-4a3b-8b3f-1d5d0b5d2a01");
    private static readonly Guid _ludwig = Guid.Parse("0e9a2dd2-4d9b-4a3b-8b3f-1d5d0b5d2a02");

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task FR_GRAPH_01_a_new_graph_returns_its_token_once_and_stores_only_the_hash()
    {
        await using var host = await GraphTestHost.CreateAsync(postgres);

        var created = await host.InScopeAsync(s => s.GetRequiredService<GraphService>().CreateAsync("Late night", Ct));

        await using var db = Context(host.ConnectionString);
        var stored = await db.Graphs.AsNoTracking().SingleAsync(Ct);
        stored.Id.Should().Be(created.Id);
        stored.Name.Should().Be("Late night");
        stored.AnonTokenHash.Should().Be(GraphToken.Hash(created.AnonToken));
        stored.AnonTokenHash.Should().NotContain(created.AnonToken);
        created.AnonToken.Should().HaveLength(43);
    }

    [Theory]
    [InlineData(null, "Untitled graph")]
    [InlineData("", "Untitled graph")]
    [InlineData("   ", "Untitled graph")]
    [InlineData("  Road trip  ", "Road trip")]
    public async Task FR_GRAPH_01_a_missing_or_blank_name_gets_the_default(string? name, string expected)
    {
        await using var host = await GraphTestHost.CreateAsync(postgres);

        var created = await host.InScopeAsync(s => s.GetRequiredService<GraphService>().CreateAsync(name, Ct));

        created.Name.Should().Be(expected);
    }

    [Fact]
    public async Task FR_GRAPH_01_a_very_long_name_is_cut_to_the_limit()
    {
        await using var host = await GraphTestHost.CreateAsync(postgres, new() { ["Graphs:MaxNameLength"] = "10" });

        var created = await host.InScopeAsync(s => s.GetRequiredService<GraphService>().CreateAsync(new string('x', 50), Ct));

        created.Name.Should().HaveLength(10);
    }

    [Fact]
    public async Task FR_ART_01_the_snapshot_names_the_release_and_release_group_each_cover_is_loaded_for()
    {
        await using var host = await GraphTestHost.CreateAsync(postgres);
        var graph = await host.SeedGraphAsync();
        var release = Guid.NewGuid();
        var group = Guid.NewGuid();
        await host.SeedRecordingAsync(_redbone, "Redbone", "Childish Gambino", CreditsStatus.Complete);
        await host.SeedAsync(db =>
        {
            db.Releases.Add(new Release { Mbid = release, Title = "Awaken, My Love!", Status = "Official", ReleaseGroupMbid = group, ReleaseGroupType = "Album" });
            db.RecordingReleases.Add(new RecordingRelease { RecordingMbid = _redbone, ReleaseMbid = release });
            return Task.CompletedTask;
        });
        await host.AddToGraphAsync(graph, _redbone);

        var snapshot = await host.InScopeAsync(s => s.GetRequiredService<GraphService>().GetSnapshotAsync(graph, Ct));

        var song = snapshot!.Songs.Should().ContainSingle().Subject;
        song.ArtReleaseMbid.Should().Be(release);
        song.ArtReleaseGroupMbid.Should().Be(group);
    }

    [Fact]
    public async Task FR_PREVIEW_01_the_snapshot_says_which_songs_have_a_preview_and_carries_the_deezer_cover_id()
    {
        await using var host = await GraphTestHost.CreateAsync(postgres);
        var graph = await host.SeedGraphAsync();
        await host.SeedRecordingAsync(_redbone, "Redbone", "Childish Gambino", CreditsStatus.Complete);
        await host.SeedRecordingAsync(_stay, "Stay", "The Kid LAROI", CreditsStatus.None);
        await host.AddToGraphAsync(graph, _redbone);
        await host.AddToGraphAsync(graph, _stay);
        await host.SeedAsync(db =>
        {
            db.Previews.Add(new Preview
            {
                RecordingMbid = _redbone,
                Provider = PreviewProvider.Deezer,
                ProviderTrackId = "350320101",
                CoverMd5 = "52a01335022b31b52b96106583ead686",
            });
            return Task.CompletedTask;
        });

        var snapshot = await host.InScopeAsync(s => s.GetRequiredService<GraphService>().GetSnapshotAsync(graph, Ct));

        var songs = snapshot!.Songs.ToDictionary(s => s.Mbid);
        songs[_redbone].HasPreview.Should().BeTrue();
        songs[_redbone].DeezerCoverMd5.Should().Be("52a01335022b31b52b96106583ead686");
        songs[_stay].HasPreview.Should().BeFalse();
        songs[_stay].DeezerCoverMd5.Should().BeNull();
    }

    [Fact]
    public async Task FR_ART_01_a_song_with_no_releases_yet_has_no_cover_ids()
    {
        await using var host = await GraphTestHost.CreateAsync(postgres);
        var graph = await host.SeedGraphAsync();
        await host.SeedRecordingAsync(_redbone, "Redbone", "Childish Gambino", CreditsStatus.None);
        await host.AddToGraphAsync(graph, _redbone);

        var snapshot = await host.InScopeAsync(s => s.GetRequiredService<GraphService>().GetSnapshotAsync(graph, Ct));

        var song = snapshot!.Songs.Should().ContainSingle().Subject;
        song.ArtReleaseMbid.Should().BeNull();
        song.ArtReleaseGroupMbid.Should().BeNull();
    }

    [Fact]
    public async Task FR_GRAPH_01_an_empty_graph_has_an_empty_snapshot_with_sequence_zero()
    {
        await using var host = await GraphTestHost.CreateAsync(postgres);
        var graph = await host.SeedGraphAsync();

        var snapshot = await host.InScopeAsync(s => s.GetRequiredService<GraphService>().GetSnapshotAsync(graph, Ct));

        snapshot.Should().NotBeNull();
        snapshot!.Seq.Should().Be(0);
        snapshot.Songs.Should().BeEmpty();
        snapshot.Credits.Should().BeEmpty();
        snapshot.Hubs.Should().BeEmpty();
        snapshot.Crawl.Should().Be(new CrawlProgressItem(0, 0, 0, 0));
    }

    [Fact]
    public async Task FR_GRAPH_01_an_unknown_graph_has_no_snapshot()
    {
        await using var host = await GraphTestHost.CreateAsync(postgres);

        var snapshot = await host.InScopeAsync(s => s.GetRequiredService<GraphService>().GetSnapshotAsync(Guid.NewGuid(), Ct));

        snapshot.Should().BeNull();
    }

    [Fact]
    public async Task FR_GRAPH_02_adding_a_song_not_yet_cached_confirms_it_with_musicbrainz_and_queues_one_fetch()
    {
        await using var host = await GraphTestHost.CreateAsync(postgres);
        var graph = await host.SeedGraphAsync();
        host.Resolver.Knows(_redbone, "Redbone", "Childish Gambino");

        var result = await host.InScopeAsync(s => s.GetRequiredService<GraphService>().AddSongAsync(graph, _redbone, Ct));

        result.Status.Should().Be(AddSongStatus.Added);
        result.Song.Should().NotBeNull();
        result.Song!.Title.Should().Be("Redbone");
        result.Song.Artist.Should().Be("Childish Gambino");
        result.Song.CreditsStatus.Should().Be(SongStatus.Loading);
        result.PendingJobs.Should().Be(1);
        host.Resolver.Calls.Should().Be(1);

        // One recording fetch, at the priority a person's click has; the Worker queues the rest (decision 0009).
        var job = (await host.JobsAsync()).Should().ContainSingle().Subject;
        (job.Kind, job.TargetMbid, job.Priority).Should().Be((CrawlJobKind.Recording, _redbone, CrawlPriority.Interactive));

        await using var db = Context(host.ConnectionString);
        (await db.GraphSongs.AsNoTracking().Select(g => new { g.GraphId, g.RecordingMbid }).ToListAsync(Ct))
            .Should().ContainSingle().Which.Should().Be(new { GraphId = graph, RecordingMbid = _redbone });
        host.Events.Remembered[(graph, _redbone)].Should().Be(SongStatus.Loading);
    }

    [Fact]
    public async Task FR_GRAPH_02_a_recording_musicbrainz_does_not_know_is_refused_and_leaves_nothing_in_the_shared_cache()
    {
        await using var host = await GraphTestHost.CreateAsync(postgres);
        var graph = await host.SeedGraphAsync();

        var result = await host.InScopeAsync(s => s.GetRequiredService<GraphService>().AddSongAsync(graph, Guid.NewGuid(), Ct));

        result.Status.Should().Be(AddSongStatus.RecordingNotFound);
        await using var db = Context(host.ConnectionString);

        // A made-up MBID must not become a row in recordings, where every later search could find it.
        (await db.Recordings.CountAsync(Ct)).Should().Be(0);
        (await db.GraphSongs.CountAsync(Ct)).Should().Be(0);
        (await host.JobsAsync()).Should().BeEmpty();
    }

    [Fact]
    public async Task FR_GRAPH_02_a_musicbrainz_that_cannot_be_asked_leaves_the_graph_unchanged()
    {
        await using var host = await GraphTestHost.CreateAsync(postgres);
        var graph = await host.SeedGraphAsync();
        host.Resolver.Throws = new MusicBrainzUnavailableException(MusicBrainzFailure.RateLimited, TimeSpan.FromSeconds(2), new InvalidOperationException());

        var act = () => host.InScopeAsync(s => s.GetRequiredService<GraphService>().AddSongAsync(graph, _redbone, Ct));

        await act.Should().ThrowAsync<MusicBrainzUnavailableException>();
        await using var db = Context(host.ConnectionString);
        (await db.GraphSongs.CountAsync(Ct)).Should().Be(0);
        (await host.JobsAsync()).Should().BeEmpty();
    }

    [Fact]
    public async Task FR_GRAPH_02_a_song_already_in_the_cache_is_not_asked_of_musicbrainz_again()
    {
        await using var host = await GraphTestHost.CreateAsync(postgres);
        var graph = await host.SeedGraphAsync();
        await host.SeedRecordingAsync(_redbone, "Redbone", "Childish Gambino", CreditsStatus.None);

        var result = await host.InScopeAsync(s => s.GetRequiredService<GraphService>().AddSongAsync(graph, _redbone, Ct));

        result.Status.Should().Be(AddSongStatus.Added);
        host.Resolver.Calls.Should().Be(0);
    }

    [Fact]
    public async Task FR_GRAPH_02_a_song_with_cached_credits_is_added_with_no_fetch_and_the_graph_is_told_at_once()
    {
        await using var host = await GraphTestHost.CreateAsync(postgres);
        var graph = await host.SeedGraphAsync();
        await host.SeedRecordingAsync(_redbone, "Redbone", "Childish Gambino", CreditsStatus.Complete);
        await host.SeedPersonAsync(_donald, "Donald Glover");
        await host.SeedCreditAsync(_donald, CreditSubjectType.Recording, _redbone, CreditRole.Producer);

        var result = await host.InScopeAsync(s => s.GetRequiredService<GraphService>().AddSongAsync(graph, _redbone, Ct));

        result.Status.Should().Be(AddSongStatus.Added);
        result.PendingJobs.Should().Be(0);
        result.Song!.CreditsStatus.Should().Be(SongStatus.Complete);
        (await host.JobsAsync()).Should().BeEmpty();

        // No job will run for this song, so nothing else would ever tell the browsers: the Api does, to this graph.
        var resolved = host.Events.Named("CreditsResolved").Should().ContainSingle().Subject;
        resolved.GraphId.Should().Be(graph);
        var payload = (CreditsResolvedMessage)resolved.Payload!;
        payload.SongMbid.Should().Be(_redbone);
        payload.People.Should().ContainSingle().Which.Name.Should().Be("Donald Glover");
        payload.Credits.Should().ContainSingle().Which.Role.Should().Be(CreditRole.Producer);
        host.Events.Named("SongStatusChanged").Should().ContainSingle().Which.Payload.Should().Be(SongStatus.Complete);
    }

    [Fact]
    public async Task FR_GRAPH_02_adding_the_same_song_twice_changes_nothing_the_second_time()
    {
        await using var host = await GraphTestHost.CreateAsync(postgres);
        var graph = await host.SeedGraphAsync();
        host.Resolver.Knows(_redbone, "Redbone", "Childish Gambino");

        var first = await host.InScopeAsync(s => s.GetRequiredService<GraphService>().AddSongAsync(graph, _redbone, Ct));
        var second = await host.InScopeAsync(s => s.GetRequiredService<GraphService>().AddSongAsync(graph, _redbone, Ct));

        first.Status.Should().Be(AddSongStatus.Added);
        second.Status.Should().Be(AddSongStatus.AlreadyInGraph);
        second.Song!.Mbid.Should().Be(_redbone);
        (await host.JobsAsync()).Should().HaveCount(1);
        await using var db = Context(host.ConnectionString);
        (await db.GraphSongs.CountAsync(Ct)).Should().Be(1);
    }

    [Fact]
    public async Task FR_GRAPH_01_a_graph_holds_at_most_the_configured_number_of_songs()
    {
        await using var host = await GraphTestHost.CreateAsync(postgres, new() { ["Graphs:MaxSongs"] = "2" });
        var graph = await host.SeedGraphAsync();
        host.Resolver.Knows(_redbone, "Redbone", "Childish Gambino");
        host.Resolver.Knows(_stay, "Stay", "Rihanna");
        var third = Guid.NewGuid();
        host.Resolver.Knows(third, "Third", "Someone");

        await host.InScopeAsync(s => s.GetRequiredService<GraphService>().AddSongAsync(graph, _redbone, Ct));
        await host.InScopeAsync(s => s.GetRequiredService<GraphService>().AddSongAsync(graph, _stay, Ct));
        var full = await host.InScopeAsync(s => s.GetRequiredService<GraphService>().AddSongAsync(graph, third, Ct));

        full.Status.Should().Be(AddSongStatus.GraphFull);
        await using var db = Context(host.ConnectionString);
        (await db.GraphSongs.CountAsync(Ct)).Should().Be(2);
    }

    [Fact]
    public async Task FR_GRAPH_01_the_default_limit_is_fifty_songs()
    {
        await using var host = await GraphTestHost.CreateAsync(postgres);

        host.Provider.GetRequiredService<Microsoft.Extensions.Options.IOptions<GraphOptions>>().Value.MaxSongs.Should().Be(50);
    }

    [Fact]
    public async Task FR_GRAPH_03_the_snapshot_lists_each_credit_once_per_person_role_and_detail()
    {
        await using var host = await GraphTestHost.CreateAsync(postgres);
        var graph = await host.SeedGraphAsync();
        var work = Guid.NewGuid();
        await host.SeedRecordingAsync(_redbone, "Redbone", "Childish Gambino", CreditsStatus.Complete);
        await host.SeedPersonAsync(_donald, "Donald Glover");
        await host.SeedWorkAsync(work, _redbone);
        await host.AddToGraphAsync(graph, _redbone);

        // The same person is credited as songwriter on the work and, again, on the recording: one credit, kept at the
        // recording level. A different detail ("lyricist") is a different credit.
        await host.SeedCreditAsync(_donald, CreditSubjectType.Recording, _redbone, CreditRole.Songwriter);
        await host.SeedCreditAsync(_donald, CreditSubjectType.Work, work, CreditRole.Songwriter);
        await host.SeedCreditAsync(_donald, CreditSubjectType.Work, work, CreditRole.Songwriter, "lyricist");
        await host.SeedCreditAsync(_donald, CreditSubjectType.Work, work, CreditRole.Producer);

        var snapshot = await host.InScopeAsync(s => s.GetRequiredService<GraphService>().GetSnapshotAsync(graph, Ct));

        snapshot!.Credits.Select(c => (c.Role, c.Detail, c.Level)).Should().BeEquivalentTo(
        [
            (CreditRole.Songwriter, string.Empty, CreditLevel.Recording),
            (CreditRole.Songwriter, "lyricist", CreditLevel.Work),
            (CreditRole.Producer, string.Empty, CreditLevel.Work),
        ]);
        snapshot.People.Should().ContainSingle().Which.Name.Should().Be("Donald Glover");
    }

    [Fact]
    public async Task FR_HUB_02_a_person_on_two_songs_is_a_hub_and_a_person_on_one_is_not()
    {
        await using var host = await GraphTestHost.CreateAsync(postgres);
        var graph = await host.SeedGraphAsync();
        await host.SeedRecordingAsync(_redbone, "Redbone", "Childish Gambino", CreditsStatus.Complete);
        await host.SeedRecordingAsync(_stay, "Stay", "Rihanna", CreditsStatus.Complete);
        await host.SeedPersonAsync(_donald, "Donald Glover");
        await host.SeedPersonAsync(_ludwig, "Ludwig Goransson");
        await host.AddToGraphAsync(graph, _redbone);
        await host.AddToGraphAsync(graph, _stay);

        await host.SeedCreditAsync(_donald, CreditSubjectType.Recording, _redbone, CreditRole.Producer);
        await host.SeedCreditAsync(_donald, CreditSubjectType.Recording, _stay, CreditRole.Songwriter);
        await host.SeedCreditAsync(_ludwig, CreditSubjectType.Recording, _redbone, CreditRole.Producer);

        var snapshot = await host.InScopeAsync(s => s.GetRequiredService<GraphService>().GetSnapshotAsync(graph, Ct));

        var hub = snapshot!.Hubs.Should().ContainSingle().Subject;
        hub.PersonMbid.Should().Be(_donald);
        hub.Songs.Should().Be(2);
        hub.Roles.Should().BeEquivalentTo([CreditRole.Producer, CreditRole.Songwriter]);
    }

    [Fact]
    public async Task FR_HUB_02_a_person_credited_twice_on_one_song_still_counts_that_song_once()
    {
        await using var host = await GraphTestHost.CreateAsync(postgres);
        var graph = await host.SeedGraphAsync();
        await host.SeedRecordingAsync(_redbone, "Redbone", "Childish Gambino", CreditsStatus.Complete);
        await host.SeedRecordingAsync(_stay, "Stay", "Rihanna", CreditsStatus.Complete);
        await host.SeedPersonAsync(_donald, "Donald Glover");
        await host.AddToGraphAsync(graph, _redbone);
        await host.AddToGraphAsync(graph, _stay);

        await host.SeedCreditAsync(_donald, CreditSubjectType.Recording, _redbone, CreditRole.Producer);
        await host.SeedCreditAsync(_donald, CreditSubjectType.Recording, _redbone, CreditRole.Songwriter);

        var snapshot = await host.InScopeAsync(s => s.GetRequiredService<GraphService>().GetSnapshotAsync(graph, Ct));

        snapshot!.Hubs.Should().BeEmpty("two roles on one song are one song, not two");
    }

    [Fact]
    public async Task FR_GRAPH_04_a_song_shows_loading_while_a_fetch_for_it_is_outstanding_then_its_stored_status()
    {
        await using var host = await GraphTestHost.CreateAsync(postgres);
        var graph = await host.SeedGraphAsync();
        var work = Guid.NewGuid();
        await host.SeedRecordingAsync(_redbone, "Redbone", "Childish Gambino", CreditsStatus.Partial);
        await host.SeedWorkAsync(work, _redbone);
        await host.AddToGraphAsync(graph, _redbone);

        // The recording is stored and partial, but the work's fetch is still queued: more credits are coming.
        await host.EnqueueAsync(CrawlJobKind.Work, work);
        var loading = await host.InScopeAsync(s => s.GetRequiredService<GraphService>().GetSnapshotAsync(graph, Ct));

        await host.SetJobStatusAsync(CrawlJobKind.Work, work, CrawlJobStatus.Done);
        var settled = await host.InScopeAsync(s => s.GetRequiredService<GraphService>().GetSnapshotAsync(graph, Ct));

        loading!.Songs.Single().CreditsStatus.Should().Be(SongStatus.Loading);
        loading.Crawl.Should().Be(new CrawlProgressItem(Queued: 1, Done: 0, Failed: 0, EtaSeconds: 1));
        settled!.Songs.Single().CreditsStatus.Should().Be(SongStatus.Partial);
        settled.Crawl.Should().Be(new CrawlProgressItem(Queued: 0, Done: 1, Failed: 0, EtaSeconds: 0));
    }

    [Fact]
    public async Task FR_GRAPH_02_progress_counts_jobs_by_state_and_estimates_the_time_from_the_gate_interval()
    {
        await using var host = await GraphTestHost.CreateAsync(postgres);
        var graph = await host.SeedGraphAsync();
        var works = Enumerable.Range(0, 3).Select(_ => Guid.NewGuid()).ToList();
        await host.SeedRecordingAsync(_redbone, "Redbone", "Childish Gambino", CreditsStatus.Partial);
        foreach (var work in works)
        {
            await host.SeedWorkAsync(work, _redbone);
            await host.EnqueueAsync(CrawlJobKind.Work, work);
        }

        await host.AddToGraphAsync(graph, _redbone);
        await host.SetJobStatusAsync(CrawlJobKind.Work, works[0], CrawlJobStatus.Done);
        await host.SetJobStatusAsync(CrawlJobKind.Work, works[1], CrawlJobStatus.Failed);

        var snapshot = await host.InScopeAsync(s => s.GetRequiredService<GraphService>().GetSnapshotAsync(graph, Ct));

        snapshot!.Crawl.Should().Be(new CrawlProgressItem(Queued: 1, Done: 1, Failed: 1, EtaSeconds: 1));
    }

    [Fact]
    public async Task FR_GRAPH_01_removing_a_song_takes_it_out_of_the_graph_but_keeps_the_cache()
    {
        await using var host = await GraphTestHost.CreateAsync(postgres);
        var graph = await host.SeedGraphAsync();
        await host.SeedRecordingAsync(_redbone, "Redbone", "Childish Gambino", CreditsStatus.Complete);
        await host.AddToGraphAsync(graph, _redbone);

        var removed = await host.InScopeAsync(s => s.GetRequiredService<GraphService>().RemoveSongAsync(graph, _redbone, Ct));
        var again = await host.InScopeAsync(s => s.GetRequiredService<GraphService>().RemoveSongAsync(graph, _redbone, Ct));

        removed.Should().BeTrue();
        again.Should().BeFalse();
        await using var db = Context(host.ConnectionString);
        (await db.GraphSongs.CountAsync(Ct)).Should().Be(0);
        (await db.Recordings.CountAsync(Ct)).Should().Be(1);
    }

    [Fact]
    public async Task FR_GRAPH_01_a_song_in_another_graph_is_not_removed_by_removing_it_from_this_one()
    {
        await using var host = await GraphTestHost.CreateAsync(postgres);
        var mine = await host.SeedGraphAsync("Mine");
        var theirs = await host.SeedGraphAsync("Theirs");
        await host.SeedRecordingAsync(_redbone, "Redbone", "Childish Gambino", CreditsStatus.Complete);
        await host.AddToGraphAsync(mine, _redbone);
        await host.AddToGraphAsync(theirs, _redbone);

        await host.InScopeAsync(s => s.GetRequiredService<GraphService>().RemoveSongAsync(mine, _redbone, Ct));

        var snapshot = await host.InScopeAsync(s => s.GetRequiredService<GraphService>().GetSnapshotAsync(theirs, Ct));
        snapshot!.Songs.Should().ContainSingle();
    }

    [Fact]
    public async Task FR_GRAPH_01_only_the_graphs_own_token_opens_it()
    {
        await using var host = await GraphTestHost.CreateAsync(postgres);
        var mine = await host.InScopeAsync(s => s.GetRequiredService<GraphService>().CreateAsync("Mine", Ct));
        var theirs = await host.InScopeAsync(s => s.GetRequiredService<GraphService>().CreateAsync("Theirs", Ct));

        var access = host.Provider.CreateScope().ServiceProvider.GetRequiredService<IGraphAccess>();

        (await access.CheckAsync(mine.Id, mine.AnonToken, Ct)).Should().Be(GraphAccessResult.Allowed);
        (await access.CheckAsync(mine.Id, theirs.AnonToken, Ct)).Should().Be(GraphAccessResult.InvalidToken);
        (await access.CheckAsync(mine.Id, null, Ct)).Should().Be(GraphAccessResult.InvalidToken);
        (await access.CheckAsync(mine.Id, string.Empty, Ct)).Should().Be(GraphAccessResult.InvalidToken);
        (await access.CheckAsync(Guid.NewGuid(), mine.AnonToken, Ct)).Should().Be(GraphAccessResult.NotFound);
    }
}
