using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Nodeable.Domain.Entities;
using Nodeable.Domain.Enums;
using Nodeable.Infrastructure.Persistence.Conversions;

namespace Nodeable.Infrastructure.Persistence.Configurations;

internal sealed class CrawlJobConfiguration : IEntityTypeConfiguration<CrawlJob>
{
    public void Configure(EntityTypeBuilder<CrawlJob> builder)
    {
        builder.HasKey(j => j.Id);

        builder.Property(j => j.Kind).HasConversion<LowerCaseEnumConverter<CrawlJobKind>>();
        builder.Property(j => j.Status).HasConversion<LowerCaseEnumConverter<CrawlJobStatus>>();
        builder.Property(j => j.RunAfter).HasDefaultValueSql("now()");

        // LEARN: LG-01 partial-unique-index | The unique index only covers pending and running rows, so the same fetch can never be queued twice while it is outstanding, yet finished jobs stay as history and the same target can be fetched again later (NFR-REL-01)
        builder.HasIndex(j => new { j.Kind, j.TargetMbid })
            .IsUnique()
            .HasFilter("status IN ('pending', 'running')");

        // The Worker's claim query reads pending rows highest priority first, then oldest run_after.
        builder.HasIndex(j => new { j.Priority, j.RunAfter })
            .IsDescending(true, false)
            .HasFilter("status = 'pending'");

        builder.ToTable(t =>
        {
            t.HasCheckConstraint("ck_crawl_jobs_kind", EnumColumn.CheckSql<CrawlJobKind>("kind"));
            t.HasCheckConstraint("ck_crawl_jobs_status", EnumColumn.CheckSql<CrawlJobStatus>("status"));
        });
    }
}
