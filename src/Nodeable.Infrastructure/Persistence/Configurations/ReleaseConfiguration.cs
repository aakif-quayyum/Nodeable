using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Nodeable.Domain.Entities;
using Nodeable.Domain.Enums;
using Nodeable.Infrastructure.Persistence.Conversions;

namespace Nodeable.Infrastructure.Persistence.Configurations;

internal sealed class ReleaseConfiguration : IEntityTypeConfiguration<Release>
{
    public void Configure(EntityTypeBuilder<Release> builder)
    {
        builder.HasKey(r => r.Mbid);
        builder.Property(r => r.Mbid).ValueGeneratedNever();
        builder.Property(r => r.Title).IsRequired();
        builder.Property(r => r.DatePrecision).HasConversion<LowerCaseEnumConverter<DatePrecision>>();
        builder.Property(r => r.FetchedAt).HasDefaultValueSql("now()");

        builder.ToTable(t =>
        {
            t.HasCheckConstraint("ck_releases_date_precision", EnumColumn.CheckSql<DatePrecision>("date_precision"));

            // Decision 0008: the precision is null exactly when the date is. A date without a precision would be
            // shown as exact, which is the lie the precision column exists to prevent.
            t.HasCheckConstraint("ck_releases_date_has_precision", "(date IS NULL) = (date_precision IS NULL)");
        });
    }
}
