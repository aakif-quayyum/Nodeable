using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Nodeable.Domain.Entities;

namespace Nodeable.Infrastructure.Persistence.Configurations;

internal sealed class WorkConfiguration : IEntityTypeConfiguration<Work>
{
    public void Configure(EntityTypeBuilder<Work> builder)
    {
        builder.HasKey(w => w.Mbid);
        builder.Property(w => w.Mbid).ValueGeneratedNever();
        builder.Property(w => w.Title).IsRequired();
        builder.Property(w => w.FetchedAt).HasDefaultValueSql("now()");
    }
}
