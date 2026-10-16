using Microsoft.Extensions.DependencyInjection;
using Nodeable.Domain.Enums;
using Nodeable.Infrastructure.Persistence;
using Nodeable.Infrastructure.Recommendations;
using Nodeable.Tests.Containers;

namespace Nodeable.Infrastructure.Tests.Graphs;

// FR-REC-01 and FR-REC-02: the recommendation ranking, over a real PostgreSQL and the real recording_people view.
public class RecommendationReadModelTests(PostgresFixture postgres)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static Guid Id(int n) => Guid.Parse($"00000000-0000-4000-8000-{n:D12}");

    // People: A is on all three graph songs, B on two, C on one (so C is not a hub).
    private static readonly Guid _a = Id(1);
    private static readonly Guid _b = Id(2);
    private static readonly Guid _c = Id(3);
    private static readonly Guid _s1 = Id(11);
    private static readonly Guid _s2 = Id(12);
    private static readonly Guid _s3 = Id(13);

    private static async Task<IReadOnlyList<RecommendationItem>> Read(GraphTestHost host, Guid graph, int limit = 20) =>
        await host.InScopeAsync(services =>
            new RecommendationReadModel(services.GetRequiredService<NodeableDbContext>()).GetAsync(graph, limit, Ct));

    private async Task<(GraphTestHost Host, Guid Graph)> GraphWithHubsAsync()
    {
        var host = await GraphTestHost.CreateAsync(postgres);
        await host.SeedPersonAsync(_a, "Ann Arranger");
        await host.SeedPersonAsync(_b, "Bo Beats");
        await host.SeedPersonAsync(_c, "Cy Cameo");
        foreach (var (mbid, title) in new[] { (_s1, "Song One"), (_s2, "Song Two"), (_s3, "Song Three") })
        {
            await host.SeedRecordingAsync(mbid, title, "The Band", CreditsStatus.Complete);
        }

        var graph = await host.SeedGraphAsync();
        foreach (var song in new[] { _s1, _s2, _s3 })
        {
            await host.AddToGraphAsync(graph, song);
        }

        await host.SeedCreditAsync(_a, CreditSubjectType.Recording, _s1, CreditRole.Producer);
        await host.SeedCreditAsync(_a, CreditSubjectType.Recording, _s2, CreditRole.Producer);
        await host.SeedCreditAsync(_a, CreditSubjectType.Recording, _s3, CreditRole.Songwriter);
        await host.SeedCreditAsync(_b, CreditSubjectType.Recording, _s1, CreditRole.Mixing);
        await host.SeedCreditAsync(_b, CreditSubjectType.Recording, _s2, CreditRole.Mixing);
        await host.SeedCreditAsync(_c, CreditSubjectType.Recording, _s1, CreditRole.Vocal);
        return (host, graph);
    }

    private static async Task Candidate(GraphTestHost host, int n, string title, params (Guid Person, CreditRole Role)[] credits)
    {
        await host.SeedRecordingAsync(Id(100 + n), title, "Someone Else", CreditsStatus.Complete);
        foreach (var (person, role) in credits)
        {
            await host.SeedCreditAsync(person, CreditSubjectType.Recording, Id(100 + n), role);
        }
    }

    [Fact]
    public async Task FR_REC_01_more_hubs_rank_first_then_more_shared_songs_then_title()
    {
        var (host, graph) = await GraphWithHubsAsync();
        await using var _ = host;
        await Candidate(host, 1, "Zulu", (_a, CreditRole.Producer));                                  // 1 hub, shares 3 songs
        await Candidate(host, 2, "Alpha", (_a, CreditRole.Producer));                                 // 1 hub, shares 3 songs: title decides
        await Candidate(host, 3, "Aardvark", (_b, CreditRole.Mixing));                                // 1 hub, shares 2 songs: after both
        await Candidate(host, 4, "Zebra", (_a, CreditRole.Producer), (_b, CreditRole.Mixing));        // 2 hubs: first of all

        var items = await Read(host, graph);

        items.Select(i => i.Title).Should().Equal("Zebra", "Alpha", "Zulu", "Aardvark");
        items.Select(i => (i.HubCount, i.SharedSongs)).Should().Equal((2, 3), (1, 3), (1, 3), (1, 2));
    }

    [Fact]
    public async Task FR_REC_01_songs_already_in_the_graph_are_never_recommended()
    {
        var (host, graph) = await GraphWithHubsAsync();
        await using var _ = host;
        await Candidate(host, 1, "Outside", (_a, CreditRole.Producer));

        var items = await Read(host, graph);

        items.Select(i => i.Mbid).Should().Equal(Id(101));
        items.Select(i => i.Mbid).Should().NotContain([_s1, _s2, _s3]);
    }

    [Fact]
    public async Task FR_REC_01_a_person_on_only_one_graph_song_is_not_a_hub_so_their_other_songs_are_not_recommended()
    {
        var (host, graph) = await GraphWithHubsAsync();
        await using var _ = host;
        await Candidate(host, 1, "Only Cy", (_c, CreditRole.Vocal));

        (await Read(host, graph)).Should().BeEmpty();
    }

    [Fact]
    public async Task FR_REC_01_the_limit_keeps_the_best_and_a_graph_without_hubs_has_none()
    {
        var (host, graph) = await GraphWithHubsAsync();
        await using var _ = host;
        await Candidate(host, 1, "Best", (_a, CreditRole.Producer), (_b, CreditRole.Mixing));
        await Candidate(host, 2, "Next", (_a, CreditRole.Producer));
        var empty = await host.SeedGraphAsync("Empty");

        (await Read(host, graph, limit: 1)).Select(i => i.Title).Should().Equal("Best");
        (await Read(host, empty)).Should().BeEmpty();
    }

    [Fact]
    public async Task FR_REC_02_the_reason_names_the_hubs_their_roles_and_how_many_of_your_songs_they_are_on()
    {
        var (host, graph) = await GraphWithHubsAsync();
        await using var _ = host;
        await Candidate(host, 1, "Both", (_a, CreditRole.Producer), (_b, CreditRole.Mixing));

        var item = (await Read(host, graph)).Should().ContainSingle().Subject;

        item.Reason.Should().Be("Credited with Ann Arranger (producer, on 3 of your songs) and Bo Beats (mixing, on 2 of your songs)");
        item.Hubs.Select(h => h.Name).Should().Equal("Ann Arranger", "Bo Beats");
    }

    [Fact]
    public void FR_REC_02_a_hub_with_many_roles_is_described_by_two_and_a_count()
    {
        var hub = new RecommendationHub(Id(1), "Ann Arranger", 3, [CreditRole.Instrument, CreditRole.Mixing, CreditRole.Producer, CreditRole.Vocal]);

        RecommendationReadModel.ReasonFor([hub]).Should().Be("Credited with Ann Arranger (instrument, mixing +2, on 3 of your songs)");
    }

    [Fact]
    public void FR_REC_02_a_reason_names_three_hubs_and_counts_the_rest()
    {
        var hubs = Enumerable.Range(1, 5)
            .Select(n => new RecommendationHub(Id(n), $"Hub {n}", 10 - n, [CreditRole.Producer]))
            .ToList();

        RecommendationReadModel.ReasonFor(hubs).Should().Be(
            "Credited with Hub 1 (producer, on 9 of your songs), Hub 2 (producer, on 8 of your songs) and Hub 3 (producer, on 7 of your songs), and 2 more of your hubs");
    }
}
