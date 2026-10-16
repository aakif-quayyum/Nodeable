using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Nodeable.Domain.Entities;

namespace Nodeable.Infrastructure.Persistence.Configurations;

internal sealed class SloCheckConfiguration : IEntityTypeConfiguration<SloCheck>
{
    public void Configure(EntityTypeBuilder<SloCheck> builder)
    {
        builder.HasKey(c => new { c.CheckedAt, c.Slo });
        builder.Property(c => c.Slo).HasMaxLength(64);
    }
}
