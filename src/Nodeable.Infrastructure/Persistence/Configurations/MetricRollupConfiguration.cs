using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Nodeable.Domain.Entities;

namespace Nodeable.Infrastructure.Persistence.Configurations;

internal sealed class MetricRollupConfiguration : IEntityTypeConfiguration<MetricRollup>
{
    public void Configure(EntityTypeBuilder<MetricRollup> builder)
    {
        // The key is the identity of one number: the same writer adding to it again finds the same row (ON CONFLICT).
        builder.HasKey(r => new { r.Resolution, r.BucketStart, r.Metric, r.Dimension });

        builder.Property(r => r.Resolution).HasMaxLength(2);
        builder.Property(r => r.Metric).HasMaxLength(64);
        builder.Property(r => r.Dimension).HasMaxLength(256);

        // A chart reads one metric over a time range: this index serves it and the retention delete.
        builder.HasIndex(r => new { r.Resolution, r.Metric, r.BucketStart });

        builder.ToTable(t => t.HasCheckConstraint("ck_metric_rollups_resolution", "resolution IN ('1m', '5m')"));
    }
}
