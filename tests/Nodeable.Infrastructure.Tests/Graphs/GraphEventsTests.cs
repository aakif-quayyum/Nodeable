using Microsoft.Extensions.DependencyInjection;
using Nodeable.Domain.Entities;
using Nodeable.Domain.Enums;
using Nodeable.Infrastructure.Crawling;
using Nodeable.Infrastructure.Graphs;
using Nodeable.Tests.Containers;

namespace Nodeable.Infrastructure.Tests.Graphs;

// What a finished job tells the browsers (spec section 7, step 6, and section 9), against a real PostgreSQL.
public class GraphEventsTests(PostgresFixture postgres)
{
    private static readonly Guid _redbone = Guid.Parse("7408f11c-6c4e-41e5-b81b-6a15bf6cb268");
    private static readonly Guid _stay = Guid.Parse("ac5977af-d4dc-4636-b867-b02e15d2f6d8");
    private static readonly Guid _donald = Guid.Parse("0e9a2dd2-4d9b-4a3b-8b3f-1d5d0b5d2a01");

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static CrawlJob Job(CrawlJobKind kind, Guid target) => new() { Kind = kind, TargetMbid = target };

    private static async Task Done(GraphTestHost host, CrawlJob job)
    {
        await using var scope = host.Provider.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<ICrawlJobObserver>().OnJobDoneAsync(job, Ct);
    }

    private static async Task Failed(GraphTestHost host, CrawlJob job)
    {
        await using var scope = host.Provider.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<ICrawlJobObserver>().OnJobFailedAsync(job, Ct);
    }

    [Fact]
    public async Task FR_GRAPH_02_a_finished_recording_job_sends_credits_status_and_progress_to_the_graph_that_holds_it()
    {
        await using var host = await GraphTestHost.CreateAsync(postgres);
        var graph = await host.SeedGraphAsync();
        var other = await host.SeedGraphAsync("Another graph");
        await host.SeedRecordingAsync(_redbone, "Redbone", "Childish Gambino", CreditsStatus.Complete);
        await host.SeedPersonAsync(_donald, "Donald Glover");
        await host.SeedCreditAsync(_donald, CreditSubjectType.Recording, _redbone, CreditRole.Producer);
        await host.AddToGraphAsync(graph, _redbone);

        await Done(host, Job(CrawlJobKind.Recording, _redbone));

        host.Events.Sent.Should().OnlyContain(e => e.GraphId == graph, "the other graph does not hold the song");
        host.Events.Sent.Select(e => e.Name).Should().Contain(["CreditsResolved", "SongStatusChanged", "CrawlProgress"]);

        var message = (CreditsResolvedMessage)host.Events.Named("CreditsResolved").Single().Payload!;
        message.SongMbid.Should().Be(_redbone);
        message.People.Should().ContainSingle().Which.Should().Be(new PersonItem(_donald, "Donald Glover"));
        message.Credits.Should().ContainSingle().Which.Should().Be(new CreditItem(_donald, CreditRole.Producer, string.Empty, CreditLevel.Recording));
        host.Events.Named("SongStatusChanged").Single().Payload.Should().Be(SongStatus.Complete);
        other.Should().NotBe(graph);
    }

    [Fact]
    public async Task FR_ART_01_credits_resolved_carries_the_cover_so_a_page_that_added_the_song_early_learns_it()
    {
        await using var host = await GraphTestHost.CreateAsync(postgres);
        var graph = await host.SeedGraphAsync();
        var release = Guid.NewGuid();
        var group = Guid.NewGuid();
        await host.SeedRecordingAsync(_redbone, "Redbone", "Childish Gambino", CreditsStatus.Partial);
        await host.SeedAsync(db =>
        {
            db.Releases.Add(new Release { Mbid = release, Title = "Redbone", Status = "Official", ReleaseGroupMbid = group });
            db.RecordingReleases.Add(new RecordingRelease { RecordingMbid = _redbone, ReleaseMbid = release });
            return Task.CompletedTask;
        });
        await host.AddToGraphAsync(graph, _redbone);

        await Done(host, Job(CrawlJobKind.Recording, _redbone));

        var message = (CreditsResolvedMessage)host.Events.Named("CreditsResolved").Single().Payload!;
        message.ArtReleaseMbid.Should().Be(release);
        message.ArtReleaseGroupMbid.Should().Be(group);
    }

    [Fact]
    public async Task FR_GRAPH_02_a_finished_work_job_reaches_every_recording_linked_to_the_work()
    {
        await using var host = await GraphTestHost.CreateAsync(postgres);
        var graphA = await host.SeedGraphAsync("A");
        var graphB = await host.SeedGraphAsync("B");
        var work = Guid.NewGuid();
        await host.SeedRecordingAsync(_redbone, "Redbone", "Childish Gambino", CreditsStatus.Partial);
        await host.SeedRecordingAsync(_stay, "Redbone (live)", "Childish Gambino", CreditsStatus.Partial);
        await host.SeedWorkAsync(work, _redbone);
        await host.SeedAsync(db => { db.RecordingWorks.Add(new RecordingWork { RecordingMbid = _stay, WorkMbid = work }); return Task.CompletedTask; });
        await host.AddToGraphAsync(graphA, _redbone);
        await host.AddToGraphAsync(graphB, _stay);

        await Done(host, Job(CrawlJobKind.Work, work));

        host.Events.Named("CreditsResolved").Select(e => (e.GraphId, e.Song)).Should().BeEquivalentTo(
            [(graphA, (Guid?)_redbone), (graphB, (Guid?)_stay)]);
    }

    [Fact]
    public async Task FR_GRAPH_02_a_job_for_a_song_in_no_graph_sends_nothing()
    {
        await using var host = await GraphTestHost.CreateAsync(postgres);
        await host.SeedRecordingAsync(_redbone, "Redbone", "Childish Gambino", CreditsStatus.Complete);

        await Done(host, Job(CrawlJobKind.Recording, _redbone));

        host.Events.Sent.Should().BeEmpty();
    }

    [Fact]
    public async Task FR_GRAPH_02_a_preview_job_adds_no_credits_so_it_sends_nothing()
    {
        await using var host = await GraphTestHost.CreateAsync(postgres);
        var graph = await host.SeedGraphAsync();
        await host.SeedRecordingAsync(_redbone, "Redbone", "Childish Gambino", CreditsStatus.Complete);
        await host.AddToGraphAsync(graph, _redbone);

        await Done(host, Job(CrawlJobKind.Preview, _redbone));

        host.Events.Sent.Should().BeEmpty();
    }

    [Fact]
    public async Task FR_GRAPH_02_a_failed_job_says_which_song_could_not_be_fetched_and_what_it_now_shows()
    {
        await using var host = await GraphTestHost.CreateAsync(postgres);
        var graph = await host.SeedGraphAsync();
        await host.SeedRecordingAsync(_redbone, "Redbone", "Childish Gambino", CreditsStatus.None);
        await host.AddToGraphAsync(graph, _redbone);

        // The job was the only fetch outstanding for the song; it is failed now, so the song is no longer loading.
        await host.EnqueueAsync(CrawlJobKind.Recording, _redbone);
        await host.SetJobStatusAsync(CrawlJobKind.Recording, _redbone, CrawlJobStatus.Failed);
        await Failed(host, Job(CrawlJobKind.Recording, _redbone));

        var failed = host.Events.Named("CrawlFailed").Should().ContainSingle().Subject;
        (failed.GraphId, failed.Song).Should().Be((graph, (Guid?)_redbone));
        failed.Payload.Should().Be("The recording details for this song could not be fetched from MusicBrainz.");
        host.Events.Named("SongStatusChanged").Should().ContainSingle().Which.Payload.Should().Be(SongStatus.None);
        var progress = (CrawlProgressItem)host.Events.Named("CrawlProgress").Single().Payload!;
        progress.Failed.Should().Be(1);
    }

    [Fact]
    public async Task FR_GRAPH_02_the_failure_reason_does_not_expose_the_exception_text()
    {
        await using var host = await GraphTestHost.CreateAsync(postgres);
        var graph = await host.SeedGraphAsync();
        await host.SeedRecordingAsync(_redbone, "Redbone", "Childish Gambino", CreditsStatus.None);
        await host.AddToGraphAsync(graph, _redbone);
        var job = new CrawlJob { Kind = CrawlJobKind.Recording, TargetMbid = _redbone, LastError = "Npgsql: password=hunter2 host=10.0.0.5" };

        await Failed(host, job);

        host.Events.Named("CrawlFailed").Single().Payload!.ToString().Should().NotContain("hunter2").And.NotContain("10.0.0.5");
    }

    [Fact]
    public async Task FR_HUB_02_asks_for_hubs_to_be_sent_after_a_job_and_after_a_removal_through_the_debouncer()
    {
        await using var host = await GraphTestHost.CreateAsync(postgres);
        var graph = await host.SeedGraphAsync();
        await host.SeedRecordingAsync(_redbone, "Redbone", "Childish Gambino", CreditsStatus.Complete);
        await host.SeedRecordingAsync(_stay, "Stay", "Rihanna", CreditsStatus.Complete);
        await host.SeedPersonAsync(_donald, "Donald Glover");
        await host.AddToGraphAsync(graph, _redbone);
        await host.AddToGraphAsync(graph, _stay);
        await host.SeedCreditAsync(_donald, CreditSubjectType.Recording, _redbone, CreditRole.Producer);
        await host.SeedCreditAsync(_donald, CreditSubjectType.Recording, _stay, CreditRole.Producer);

        await Done(host, Job(CrawlJobKind.Recording, _redbone));
        await host.Provider.GetRequiredService<HubsUpdatedDebouncer>().WhenIdleAsync();

        var hubs = (IReadOnlyList<HubItem>)host.Events.Named("HubsUpdated").Should().ContainSingle().Subject.Payload!;
        hubs.Should().ContainSingle().Which.Should().Match<HubItem>(h => h.PersonMbid == _donald && h.Songs == 2);
    }

    [Fact]
    public async Task FR_HUB_02_hubs_updated_is_sent_at_once_the_first_time_then_at_most_once_a_second()
    {
        await using var host = await GraphTestHost.CreateAsync(postgres);
        var graph = await host.SeedGraphAsync();
        var debouncer = host.Provider.GetRequiredService<HubsUpdatedDebouncer>();

        debouncer.Request(graph);
        await debouncer.WhenIdleAsync();
        host.Events.Named("HubsUpdated").Should().HaveCount(1);

        // A burst inside the same second: nothing more goes out until the second is over, and then exactly one.
        for (var i = 0; i < 5; i++)
        {
            debouncer.Request(graph);
        }

        await Task.Delay(100, Ct);
        host.Events.Named("HubsUpdated").Should().HaveCount(1, "the second is not over");

        host.Time.Advance(TimeSpan.FromMilliseconds(999));
        await Task.Delay(100, Ct);
        host.Events.Named("HubsUpdated").Should().HaveCount(1, "one millisecond to go");

        host.Time.Advance(TimeSpan.FromMilliseconds(1));
        await debouncer.WhenIdleAsync();
        host.Events.Named("HubsUpdated").Should().HaveCount(2, "five requests became one trailing send");
    }

    [Fact]
    public async Task FR_HUB_02_the_trailing_send_carries_the_state_at_the_moment_it_is_sent()
    {
        await using var host = await GraphTestHost.CreateAsync(postgres);
        var graph = await host.SeedGraphAsync();
        await host.SeedRecordingAsync(_redbone, "Redbone", "Childish Gambino", CreditsStatus.Complete);
        await host.SeedRecordingAsync(_stay, "Stay", "Rihanna", CreditsStatus.Complete);
        await host.SeedPersonAsync(_donald, "Donald Glover");
        await host.SeedCreditAsync(_donald, CreditSubjectType.Recording, _redbone, CreditRole.Producer);
        await host.SeedCreditAsync(_donald, CreditSubjectType.Recording, _stay, CreditRole.Producer);
        await host.AddToGraphAsync(graph, _redbone);
        var debouncer = host.Provider.GetRequiredService<HubsUpdatedDebouncer>();

        debouncer.Request(graph);
        await debouncer.WhenIdleAsync();
        debouncer.Request(graph);

        // The change that makes Donald a hub happens after the request, before the trailing send.
        await host.AddToGraphAsync(graph, _stay);
        host.Time.Advance(HubsUpdatedDebouncer.Interval);
        await debouncer.WhenIdleAsync();

        var last = (IReadOnlyList<HubItem>)host.Events.Named("HubsUpdated").Last().Payload!;
        last.Should().ContainSingle().Which.PersonMbid.Should().Be(_donald);
    }

    [Fact]
    public async Task FR_HUB_02_two_graphs_are_debounced_independently()
    {
        await using var host = await GraphTestHost.CreateAsync(postgres);
        var graphA = await host.SeedGraphAsync("A");
        var graphB = await host.SeedGraphAsync("B");
        var debouncer = host.Provider.GetRequiredService<HubsUpdatedDebouncer>();

        debouncer.Request(graphA);
        debouncer.Request(graphB);
        await debouncer.WhenIdleAsync();

        host.Events.Named("HubsUpdated").Select(e => e.GraphId).Should().BeEquivalentTo([graphA, graphB]);
    }
    [Fact]
    public async Task FR_PREVIEW_01_a_finished_preview_job_tells_only_the_graphs_that_hold_the_song_that_it_has_a_preview()
    {
        await using var host = await GraphTestHost.CreateAsync(postgres);
        var graph = await host.SeedGraphAsync();
        await host.SeedGraphAsync("Another graph");
        await host.SeedRecordingAsync(_redbone, "Redbone", "Childish Gambino", CreditsStatus.Complete);
        await host.AddToGraphAsync(graph, _redbone);
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

        await Done(host, Job(CrawlJobKind.Preview, _redbone));

        var sent = host.Events.Sent.Should().ContainSingle().Which;
        sent.Name.Should().Be("PreviewFound");
        sent.GraphId.Should().Be(graph);
        sent.Song.Should().Be(_redbone);
        sent.Payload.Should().Be("52a01335022b31b52b96106583ead686");
    }

    [Fact]
    public async Task FR_PREVIEW_01_a_preview_job_that_found_nothing_sends_nothing()
    {
        await using var host = await GraphTestHost.CreateAsync(postgres);
        var graph = await host.SeedGraphAsync();
        await host.SeedRecordingAsync(_redbone, "Redbone", "Childish Gambino", CreditsStatus.Complete);
        await host.AddToGraphAsync(graph, _redbone);

        await Done(host, Job(CrawlJobKind.Preview, _redbone));

        host.Events.Sent.Should().BeEmpty("a preview job adds no credits and found no preview");
    }
}
