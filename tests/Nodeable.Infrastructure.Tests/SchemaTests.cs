using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Nodeable.Domain.Dates;
using Nodeable.Domain.Entities;
using Nodeable.Domain.Enums;
using Nodeable.Infrastructure.Persistence;
using Nodeable.Tests.Containers;
using Npgsql;

namespace Nodeable.Infrastructure.Tests;

// These tests run the real migration against a real PostgreSQL container: the schema, constraints and view are
// the contract (spec section 8), and an in-memory fake would not enforce any of them.
public class SchemaTests(PostgresFixture postgres)
{
    private static readonly Guid _recordingMbid = Guid.Parse("00000000-0000-0000-0000-000000000001");
    private static readonly Guid _workMbid = Guid.Parse("00000000-0000-0000-0000-0000000000a1");
    private static readonly Guid _releaseMbid = Guid.Parse("00000000-0000-0000-0000-0000000000b1");
    private static readonly Guid _personMbid = Guid.Parse("00000000-0000-0000-0000-00000000aaa1");

    [Fact]
    public async Task FR_GRAPH_01_migration_creates_all_mvp_tables_and_the_recording_people_view()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var db = await CreateMigratedContextAsync();

        var tables = await db.Database
            .SqlQuery<string>($"""SELECT table_name AS "Value" FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '__EFMigrationsHistory' ORDER BY 1""")
            .ToListAsync(ct);
        var views = await db.Database
            .SqlQuery<string>($"""SELECT table_name AS "Value" FROM information_schema.views WHERE table_schema = 'public'""")
            .ToListAsync(ct);

        tables.Should().Equal(
            "crawl_jobs", "credits", "graph_songs", "graphs", "metric_rollups", "people", "previews", "recording_releases", "recording_works", "recordings", "releases", "slo_checks", "works");
        views.Should().Equal("recording_people");
    }

    [Fact]
    public async Task FR_HUB_02_recording_people_view_flattens_credits_from_recording_work_and_release()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var db = await CreateMigratedContextAsync();

        db.Recordings.Add(new Recording { Mbid = _recordingMbid, Title = "Redbone", ArtistCredit = "Childish Gambino" });
        db.Works.Add(new Work { Mbid = _workMbid, Title = "Redbone" });
        db.Releases.Add(new Release { Mbid = _releaseMbid, Title = "Awaken, My Love!" });
        db.People.Add(new Person { Mbid = _personMbid, Name = "Ludwig Goransson" });
        db.RecordingWorks.Add(new RecordingWork { RecordingMbid = _recordingMbid, WorkMbid = _workMbid });
        db.RecordingReleases.Add(new RecordingRelease { RecordingMbid = _recordingMbid, ReleaseMbid = _releaseMbid });
        db.Credits.Add(NewCredit(CreditSubjectType.Recording, _recordingMbid, CreditRole.Producer));
        db.Credits.Add(NewCredit(CreditSubjectType.Work, _workMbid, CreditRole.Songwriter));
        db.Credits.Add(NewCredit(CreditSubjectType.Release, _releaseMbid, CreditRole.Mixing));
        await db.SaveChangesAsync(ct);

        var rows = await db.Database
            .SqlQuery<string>($"""SELECT level || ':' || role AS "Value" FROM recording_people WHERE recording_mbid = {_recordingMbid} ORDER BY 1""")
            .ToListAsync(ct);

        rows.Should().Equal("recording:producer", "release:mixing", "work:songwriter");
    }

    [Fact]
    public async Task FR_GRAPH_03_duplicate_credit_is_rejected_even_when_detail_is_empty()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var db = await CreateMigratedContextAsync();
        db.People.Add(new Person { Mbid = _personMbid, Name = "Ludwig Goransson" });
        db.Credits.Add(NewCredit(CreditSubjectType.Recording, _recordingMbid, CreditRole.Producer));
        await db.SaveChangesAsync(ct);

        db.Credits.Add(NewCredit(CreditSubjectType.Recording, _recordingMbid, CreditRole.Producer));
        Func<Task> saveDuplicate = () => db.SaveChangesAsync(ct);

        var thrown = await saveDuplicate.Should().ThrowAsync<DbUpdateException>();
        thrown.Which.InnerException.Should().BeOfType<PostgresException>()
            .Which.SqlState.Should().Be(PostgresErrorCodes.UniqueViolation);
    }

    [Fact]
    public async Task FR_GRAPH_03_roles_are_stored_as_lower_case_text_and_read_back_as_enums()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var db = await CreateMigratedContextAsync();
        db.People.Add(new Person { Mbid = _personMbid, Name = "Ludwig Goransson" });
        db.Credits.Add(NewCredit(CreditSubjectType.Recording, _recordingMbid, CreditRole.Songwriter));
        await db.SaveChangesAsync(ct);
        db.ChangeTracker.Clear();

        var stored = await db.Database.SqlQuery<string>($"""SELECT role AS "Value" FROM credits""").SingleAsync(ct);
        var credit = await db.Credits.SingleAsync(ct);

        stored.Should().Be("songwriter");
        credit.Role.Should().Be(CreditRole.Songwriter);
        credit.Detail.Should().BeEmpty();
    }

    [Fact]
    public async Task FR_GRAPH_03_unknown_enum_text_is_rejected_by_the_check_constraint()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var db = await CreateMigratedContextAsync();
        db.Recordings.Add(new Recording { Mbid = _recordingMbid, Title = "Redbone", ArtistCredit = "Childish Gambino" });
        await db.SaveChangesAsync(ct);

        Func<Task> setBogusStatus = () => db.Database.ExecuteSqlAsync($"UPDATE recordings SET credits_status = 'bogus'", ct);

        var thrown = await setBogusStatus.Should().ThrowAsync<PostgresException>();
        thrown.Which.SqlState.Should().Be(PostgresErrorCodes.CheckViolation);
    }

    [Fact]
    public async Task NFR_REL_01_crawl_job_cannot_be_queued_twice_while_pending_but_can_be_again_once_done()
    {
        var ct = TestContext.Current.CancellationToken;
        var connectionString = await postgres.CreateDatabaseAsync();
        await using (var setup = CreateContext(connectionString))
        {
            await setup.Database.MigrateAsync(ct);
            setup.CrawlJobs.Add(new CrawlJob { Kind = CrawlJobKind.Recording, TargetMbid = _recordingMbid });
            await setup.SaveChangesAsync(ct);
        }

        // A second pending job for the same target is a duplicate fetch.
        await using (var duplicate = CreateContext(connectionString))
        {
            duplicate.CrawlJobs.Add(new CrawlJob { Kind = CrawlJobKind.Recording, TargetMbid = _recordingMbid });
            Func<Task> saveDuplicate = () => duplicate.SaveChangesAsync(ct);

            var thrown = await saveDuplicate.Should().ThrowAsync<DbUpdateException>();
            thrown.Which.InnerException.Should().BeOfType<PostgresException>()
                .Which.SqlState.Should().Be(PostgresErrorCodes.UniqueViolation);
        }

        // Once the first job is done it is history, so the same target may be fetched again (for example a stale-cache refresh).
        await using (var later = CreateContext(connectionString))
        {
            await later.CrawlJobs.ExecuteUpdateAsync(s => s.SetProperty(j => j.Status, CrawlJobStatus.Done), ct);
            later.CrawlJobs.Add(new CrawlJob { Kind = CrawlJobKind.Recording, TargetMbid = _recordingMbid });
            await later.SaveChangesAsync(ct);

            (await later.CrawlJobs.CountAsync(ct)).Should().Be(2);
        }
    }

    [Fact]
    public async Task FR_SEARCH_01_partial_date_is_stored_as_the_earliest_day_with_a_lower_case_precision()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var db = await CreateMigratedContextAsync();
        var recording = new Recording { Mbid = _recordingMbid, Title = "Redbone", ArtistCredit = "Childish Gambino" };
        PartialDate.TryParse("2016-11", out var date).Should().BeTrue();
        recording.SetFirstReleaseDate(date);
        db.Recordings.Add(recording);
        await db.SaveChangesAsync(ct);
        db.ChangeTracker.Clear();

        var stored = await db.Database
            .SqlQuery<string>($"""SELECT first_release_date::text || ' ' || first_release_date_precision AS "Value" FROM recordings""")
            .SingleAsync(ct);
        var read = await db.Recordings.SingleAsync(ct);

        stored.Should().Be("2016-11-01 month");
        read.FirstReleaseDate.Should().Be(new DateOnly(2016, 11, 1));
        read.FirstReleaseDatePrecision.Should().Be(DatePrecision.Month);
    }

    [Fact]
    public async Task FR_SEARCH_01_a_date_without_a_precision_is_rejected_by_the_database()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var db = await CreateMigratedContextAsync();
        db.Releases.Add(new Release { Mbid = _releaseMbid, Title = "Awaken, My Love!" });
        await db.SaveChangesAsync(ct);

        // The entity's setter makes this impossible from C#; the CHECK constraint is the backstop for any other writer.
        Func<Task> dateOnly = () => db.Database.ExecuteSqlAsync($"UPDATE releases SET date = DATE '2016-12-02'", ct);

        var thrown = await dateOnly.Should().ThrowAsync<PostgresException>();
        thrown.Which.SqlState.Should().Be(PostgresErrorCodes.CheckViolation);
    }

    // Decision 0008. The migration's hand-written backfill runs against a database that is still on the first
    // migration and already holds a dated row, which is the case the constraints would otherwise fail on.
    [Fact]
    public async Task FR_SEARCH_01_migration_gives_dates_stored_before_it_the_day_precision()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var db = CreateContext(await postgres.CreateDatabaseAsync());
        await db.Database.GetService<IMigrator>().MigrateAsync("20261009113647_InitialCreate", ct);
        await db.Database.ExecuteSqlAsync(
            $"""
            INSERT INTO recordings (mbid, title, artist_credit, first_release_date, credits_status)
            VALUES ({_recordingMbid}, 'Redbone', 'Childish Gambino', DATE '2016-11-18', 'none')
            """,
            ct);

        await db.Database.MigrateAsync(ct);
        var recording = await db.Recordings.SingleAsync(ct);

        recording.FirstReleaseDate.Should().Be(new DateOnly(2016, 11, 18));
        recording.FirstReleaseDatePrecision.Should().Be(DatePrecision.Day);
    }

    private static Credit NewCredit(CreditSubjectType subjectType, Guid subjectMbid, CreditRole role) => new()
    {
        PersonMbid = _personMbid,
        SubjectType = subjectType,
        SubjectMbid = subjectMbid,
        Role = role,
    };

    private async Task<NodeableDbContext> CreateMigratedContextAsync()
    {
        var db = CreateContext(await postgres.CreateDatabaseAsync());
        await db.Database.MigrateAsync(TestContext.Current.CancellationToken);
        return db;
    }

    private static NodeableDbContext CreateContext(string connectionString)
    {
        var builder = new DbContextOptionsBuilder<NodeableDbContext>();
        builder.UseNpgsql(connectionString);
        builder.UseNodeableConventions();
        return new NodeableDbContext(builder.Options);
    }
}
