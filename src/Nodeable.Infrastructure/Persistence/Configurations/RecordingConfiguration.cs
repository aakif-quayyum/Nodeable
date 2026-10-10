using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Nodeable.Domain.Entities;
using Nodeable.Domain.Enums;
using Nodeable.Infrastructure.Persistence.Conversions;

namespace Nodeable.Infrastructure.Persistence.Configurations;

internal sealed class RecordingConfiguration : IEntityTypeConfiguration<Recording>
{
    public void Configure(EntityTypeBuilder<Recording> builder)
    {
        builder.HasKey(r => r.Mbid);

        // The key comes from MusicBrainz; EF must never invent a Guid for it.
        builder.Property(r => r.Mbid).ValueGeneratedNever();

        builder.Property(r => r.Title).IsRequired();
        builder.Property(r => r.ArtistCredit).IsRequired();

        builder.Property(r => r.CreditsStatus).HasConversion<LowerCaseEnumConverter<CreditsStatus>>();
        builder.Property(r => r.FetchedAt).HasDefaultValueSql("now()");

        builder.HasIndex(r => r.Title).HasMethod("gin").HasOperators("gin_trgm_ops");

        builder.ToTable(t => t.HasCheckConstraint("ck_recordings_credits_status", EnumColumn.CheckSql<CreditsStatus>("credits_status")));
    }
}
