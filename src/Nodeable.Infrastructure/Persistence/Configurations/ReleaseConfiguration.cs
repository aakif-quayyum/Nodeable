using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Nodeable.Domain.Entities;

namespace Nodeable.Infrastructure.Persistence.Configurations;

internal sealed class ReleaseConfiguration : IEntityTypeConfiguration<Release>
{
    public void Configure(EntityTypeBuilder<Release> builder)
    {
        builder.HasKey(r => r.Mbid);
        builder.Property(r => r.Mbid).ValueGeneratedNever();
        builder.Property(r => r.Title).IsRequired();
        builder.Property(r => r.FetchedAt).HasDefaultValueSql("now()");
    }
}
