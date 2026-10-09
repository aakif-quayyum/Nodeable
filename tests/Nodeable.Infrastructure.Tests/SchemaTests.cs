using Microsoft.EntityFrameworkCore;
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

        Assert.Equal(
            ["crawl_jobs", "credits", "graph_songs", "graphs", "people", "previews", "recording_releases", "recording_works", "recordings", "releases", "works"],
            tables);
        Assert.Equal(["recording_people"], views);
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

        Assert.Equal(["recording:producer", "release:mixing", "work:songwriter"], rows);
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
        var exception = await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync(ct));

        var postgresError = Assert.IsType<PostgresException>(exception.InnerException);
        Assert.Equal(PostgresErrorCodes.UniqueViolation, postgresError.SqlState);
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

        Assert.Equal("songwriter", stored);
        Assert.Equal(CreditRole.Songwriter, credit.Role);
        Assert.Equal(string.Empty, credit.Detail);
    }

    [Fact]
    public async Task FR_GRAPH_03_unknown_enum_text_is_rejected_by_the_check_constraint()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var db = await CreateMigratedContextAsync();
        db.Recordings.Add(new Recording { Mbid = _recordingMbid, Title = "Redbone", ArtistCredit = "Childish Gambino" });
        await db.SaveChangesAsync(ct);

        var exception = await Assert.ThrowsAsync<PostgresException>(
            () => db.Database.ExecuteSqlAsync($"UPDATE recordings SET credits_status = 'bogus'", ct));

        Assert.Equal(PostgresErrorCodes.CheckViolation, exception.SqlState);
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
            var exception = await Assert.ThrowsAsync<DbUpdateException>(() => duplicate.SaveChangesAsync(ct));
            Assert.Equal(PostgresErrorCodes.UniqueViolation, Assert.IsType<PostgresException>(exception.InnerException).SqlState);
        }

        // Once the first job is done it is history, so the same target may be fetched again (for example a stale-cache refresh).
        await using (var later = CreateContext(connectionString))
        {
            await later.CrawlJobs.ExecuteUpdateAsync(s => s.SetProperty(j => j.Status, CrawlJobStatus.Done), ct);
            later.CrawlJobs.Add(new CrawlJob { Kind = CrawlJobKind.Recording, TargetMbid = _recordingMbid });
            await later.SaveChangesAsync(ct);

            Assert.Equal(2, await later.CrawlJobs.CountAsync(ct));
        }
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
