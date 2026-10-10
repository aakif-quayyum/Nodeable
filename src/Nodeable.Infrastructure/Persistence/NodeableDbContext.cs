using Microsoft.EntityFrameworkCore;
using Nodeable.Domain.Entities;

namespace Nodeable.Infrastructure.Persistence;

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

        modelBuilder.ApplyConfigurationsFromAssembly(typeof(NodeableDbContext).Assembly);
    }
}
