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

        // Rows from before the fallback existed were all found by ISRC, which is what the default says.
        builder.Property(p => p.MatchedBy)
            .HasConversion<SnakeCaseEnumConverter<PreviewMatch>>()
            .HasDefaultValueSql("'isrc'");

        builder.Property(p => p.PickedAt);

        builder.ToTable(t =>
        {
            t.HasCheckConstraint("ck_previews_provider", EnumColumn.CheckSql<PreviewProvider>("provider"));
            t.HasCheckConstraint("ck_previews_matched_by", EnumColumn.CheckSql<PreviewMatch>("matched_by", snakeCase: true));
        });
    }
}
