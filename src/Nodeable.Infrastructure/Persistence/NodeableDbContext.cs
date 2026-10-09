using Microsoft.EntityFrameworkCore;
using Nodeable.Domain.Entities;

namespace Nodeable.Infrastructure.Persistence;

// LEARN: LG-01 dbcontext | A DbContext is one unit of work over the database: DbSet<T> properties are the tables, and SaveChanges writes every tracked change in one transaction. It is registered per request, so each HTTP call gets its own
public class NodeableDbContext(DbContextOptions<NodeableDbContext> options) : DbContext(options)
{
    public DbSet<Recording> Recordings => Set<Recording>();

    public DbSet<Work> Works => Set<Work>();

    public DbSet<Release> Releases => Set<Release>();

    public DbSet<RecordingWork> RecordingWorks => Set<RecordingWork>();

    public DbSet<RecordingRelease> RecordingReleases => Set<RecordingRelease>();

    public DbSet<Person> People => Set<Person>();

    public DbSet<Credit> Credits => Set<Credit>();

    public DbSet<Preview> Previews => Set<Preview>();

    public DbSet<Graph> Graphs => Set<Graph>();

    public DbSet<GraphSong> GraphSongs => Set<GraphSong>();

    public DbSet<CrawlJob> CrawlJobs => Set<CrawlJob>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        // pg_trgm powers the trigram index on recordings.title (spec section 8).
        modelBuilder.HasPostgresExtension("pg_trgm");

        // LEARN: LG-01 fluent-config | Mapping lives in one IEntityTypeConfiguration class per entity (keys, indexes, constraints) rather than attributes on the Domain classes, which keeps the Domain free of EF; this call finds them all by reflection
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(NodeableDbContext).Assembly);
    }
}
