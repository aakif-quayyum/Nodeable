using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Nodeable.Domain.Entities;
using Nodeable.Domain.Enums;
using Nodeable.Infrastructure.Persistence.Conversions;

namespace Nodeable.Infrastructure.Persistence.Configurations;

internal sealed class PreviewConfiguration : IEntityTypeConfiguration<Preview>
{
    public void Configure(EntityTypeBuilder<Preview> builder)
    {
        builder.HasKey(p => new { p.RecordingMbid, p.Provider });

        builder.Property(p => p.Provider).HasConversion<LowerCaseEnumConverter<PreviewProvider>>();
        builder.Property(p => p.ProviderTrackId).IsRequired();
        builder.Property(p => p.FetchedAt).HasDefaultValueSql("now()");

        builder.HasOne<Recording>().WithMany().HasForeignKey(p => p.RecordingMbid).OnDelete(DeleteBehavior.Cascade);

        builder.ToTable(t => t.HasCheckConstraint("ck_previews_provider", EnumColumn.CheckSql<PreviewProvider>("provider")));
    }
}
