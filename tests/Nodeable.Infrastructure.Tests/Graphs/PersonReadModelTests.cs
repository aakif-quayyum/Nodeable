using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Nodeable.Domain.Dates;
using Nodeable.Domain.Enums;
using Nodeable.Infrastructure.People;
using Nodeable.Infrastructure.Persistence;
using Nodeable.Tests.Containers;

namespace Nodeable.Infrastructure.Tests.Graphs;

// FR-PERSON-01: the person drawer's reads, over a real PostgreSQL and the real recording_people view.
public class PersonReadModelTests(PostgresFixture postgres)
{
    private static readonly Guid _donald = Guid.Parse("1ba01bce-7f32-4d72-a5d9-34930b191656");
    private static readonly Guid _ludwig = Guid.Parse("78471616-3cb4-4139-a148-aeac3c7d0f79");
    private static readonly Guid _redbone = Guid.Parse("7408f11c-6c4e-41e5-b81b-6a15bf6cb268");
    private static readonly Guid _stay = Guid.Parse("ac5977af-d4dc-4636-b867-b02e15d2f6d8");
    private static readonly Guid _undated = Guid.Parse("f0a1c3d2-0000-4000-8000-000000000001");
    private static readonly Guid _work = Guid.Parse("c44370d6-70af-454f-8381-021d1f7b6fac");

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static async Task<T> Read<T>(GraphTestHost host, Func<PersonReadModel, Task<T>> read) =>
        await host.InScopeAsync(services => read(new PersonReadModel(services.GetRequiredService<NodeableDbContext>())));

    private async Task<GraphTestHost> HostWithDonaldAsync()
    {
        var host = await GraphTestHost.CreateAsync(postgres);
        await host.SeedPersonAsync(_donald, "Donald Glover");
        await host.SeedPersonAsync(_ludwig, "Ludwig Göransson");
        await host.SeedRecordingAsync(_redbone, "Redbone", "Childish Gambino", CreditsStatus.Complete);
        await host.SeedRecordingAsync(_stay, "Stay", "Childish Gambino", CreditsStatus.Complete);
        await host.SeedRecordingAsync(_undated, "Untitled", "Childish Gambino", CreditsStatus.Partial);
        await host.SeedAsync(async db =>
        {
            (await db.Recordings.SingleAsync(r => r.Mbid == _redbone, Ct)).SetFirstReleaseDate(PartialDate.TryParse("2016-11-17", out var a) ? a : null);
            (await db.Recordings.SingleAsync(r => r.Mbid == _stay, Ct)).SetFirstReleaseDate(PartialDate.TryParse("2013", out var b) ? b : null);
        });
        return host;
    }

    [Fact]
    public async Task FR_PERSON_01_the_profile_counts_each_role_over_distinct_recordings_and_gives_the_years_of_what_is_stored()
    {
        await using var host = await HostWithDonaldAsync();
        await host.SeedCreditAsync(_donald, CreditSubjectType.Recording, _redbone, CreditRole.Producer);
        await host.SeedCreditAsync(_donald, CreditSubjectType.Recording, _redbone, CreditRole.Songwriter);
        await host.SeedCreditAsync(_donald, CreditSubjectType.Recording, _redbone, CreditRole.Instrument, "drums");
        await host.SeedCreditAsync(_donald, CreditSubjectType.Recording, _stay, CreditRole.Songwriter);
        await host.SeedCreditAsync(_donald, CreditSubjectType.Recording, _undated, CreditRole.Songwriter);

        var profile = await Read(host, m => m.GetProfileAsync(_donald, Ct));

        profile.Should().NotBeNull();
        profile!.Name.Should().Be("Donald Glover");
        profile.RecordingCount.Should().Be(3);
        profile.CreditCount.Should().Be(5);
        profile.Roles.Select(r => (r.Role, r.Recordings)).Should().Equal(
            (CreditRole.Songwriter, 3), (CreditRole.Instrument, 1), (CreditRole.Producer, 1));
        profile.FirstYear.Should().Be(2013, "the earliest first-release year of the stored recordings, ignoring one with no date");
        profile.LastYear.Should().Be(2016);
    }

    [Fact]
    public async Task FR_PERSON_01_a_credit_on_a_work_counts_for_each_recording_of_it()
    {
        await using var host = await HostWithDonaldAsync();
        await host.SeedWorkAsync(_work, _redbone);
        await host.SeedCreditAsync(_donald, CreditSubjectType.Work, _work, CreditRole.Songwriter);

        var profile = await Read(host, m => m.GetProfileAsync(_donald, Ct));
        var page = await Read(host, m => m.GetRecordingsAsync(_donald, 1, 20, Ct));

        profile!.RecordingCount.Should().Be(1);
        page!.Items.Should().ContainSingle().Which.Mbid.Should().Be(_redbone);
    }

    [Fact]
    public async Task FR_PERSON_01_a_person_with_no_credits_stored_has_an_empty_summary_and_no_years()
    {
        await using var host = await HostWithDonaldAsync();

        var profile = await Read(host, m => m.GetProfileAsync(_ludwig, Ct));

        profile!.Roles.Should().BeEmpty();
        profile.RecordingCount.Should().Be(0);
        profile.FirstYear.Should().BeNull();
        profile.LastYear.Should().BeNull();
    }

    [Fact]
    public async Task FR_PERSON_01_a_person_that_is_not_stored_is_null_in_both_reads()
    {
        await using var host = await HostWithDonaldAsync();
        var unknown = Guid.NewGuid();

        (await Read(host, m => m.GetProfileAsync(unknown, Ct))).Should().BeNull();
        (await Read(host, m => m.GetRecordingsAsync(unknown, 1, 20, Ct))).Should().BeNull();
    }

    [Fact]
    public async Task FR_PERSON_01_recordings_are_newest_first_with_undated_last_each_with_all_the_roles_on_it()
    {
        await using var host = await HostWithDonaldAsync();
        await host.SeedCreditAsync(_donald, CreditSubjectType.Recording, _redbone, CreditRole.Producer);
        await host.SeedCreditAsync(_donald, CreditSubjectType.Recording, _redbone, CreditRole.Instrument, "drums");
        await host.SeedCreditAsync(_donald, CreditSubjectType.Recording, _stay, CreditRole.Songwriter);
        await host.SeedCreditAsync(_donald, CreditSubjectType.Recording, _undated, CreditRole.Vocal);
        await host.SeedCreditAsync(_ludwig, CreditSubjectType.Recording, _redbone, CreditRole.Producer);

        var page = await Read(host, m => m.GetRecordingsAsync(_donald, 1, 20, Ct));

        page!.Total.Should().Be(3);
        page.Items.Select(i => i.Mbid).Should().Equal(_redbone, _stay, _undated);
        page.Items[0].Year.Should().Be(2016);
        page.Items[0].Roles.Select(r => (r.Role, r.Detail)).Should().BeEquivalentTo(
            [(CreditRole.Producer, ""), (CreditRole.Instrument, "drums")]);
        page.Items[2].Year.Should().BeNull();
    }

    [Fact]
    public async Task FR_PERSON_01_pages_are_slices_of_one_order_and_say_how_many_there_are_in_all()
    {
        await using var host = await HostWithDonaldAsync();
        await host.SeedCreditAsync(_donald, CreditSubjectType.Recording, _redbone, CreditRole.Producer);
        await host.SeedCreditAsync(_donald, CreditSubjectType.Recording, _stay, CreditRole.Producer);
        await host.SeedCreditAsync(_donald, CreditSubjectType.Recording, _undated, CreditRole.Producer);

        var first = await Read(host, m => m.GetRecordingsAsync(_donald, 1, 2, Ct));
        var second = await Read(host, m => m.GetRecordingsAsync(_donald, 2, 2, Ct));
        var beyond = await Read(host, m => m.GetRecordingsAsync(_donald, 3, 2, Ct));

        first!.Items.Select(i => i.Mbid).Should().Equal(_redbone, _stay);
        second!.Items.Select(i => i.Mbid).Should().Equal(_undated);
        first.Total.Should().Be(3);
        second.Total.Should().Be(3);
        beyond!.Items.Should().BeEmpty();
    }
}
