using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Nodeable.Domain.Entities;
using Nodeable.Domain.Enums;
using Nodeable.Infrastructure.Persistence.Conversions;

namespace Nodeable.Infrastructure.Persistence.Configurations;

internal sealed class CreditConfiguration : IEntityTypeConfiguration<Credit>
{
    public void Configure(EntityTypeBuilder<Credit> builder)
    {
        builder.HasKey(c => c.Id);

        builder.Property(c => c.SubjectType).HasConversion<LowerCaseEnumConverter<CreditSubjectType>>();
        builder.Property(c => c.Role).HasConversion<LowerCaseEnumConverter<CreditRole>>();
        builder.Property(c => c.Source).HasConversion<LowerCaseEnumConverter<CreditSource>>();

        // Never NULL, so the unique index below really does stop duplicate credits (see Credit.Detail).
        builder.Property(c => c.Detail).IsRequired().HasDefaultValue(string.Empty);

        // The subject is polymorphic (recording, work or release), so it cannot have a foreign key; the person can.
        builder.HasOne<Person>().WithMany().HasForeignKey(c => c.PersonMbid).OnDelete(DeleteBehavior.Cascade);

        // LEARN: LG-01 idempotent-upsert | This unique index makes a re-crawl safe: inserting the same credit twice conflicts instead of duplicating, so the Worker can use INSERT ... ON CONFLICT DO NOTHING
        builder.HasIndex(c => new { c.PersonMbid, c.SubjectType, c.SubjectMbid, c.Role, c.Detail }).IsUnique();
        builder.HasIndex(c => new { c.SubjectType, c.SubjectMbid });

        // Spec section 8 also lists an index on person_mbid alone. The unique index above starts with person_mbid,
        // so it already serves "credits for this person" lookups; a second index would only slow writes.

        builder.ToTable(t =>
        {
            t.HasCheckConstraint("ck_credits_subject_type", EnumColumn.CheckSql<CreditSubjectType>("subject_type"));
            t.HasCheckConstraint("ck_credits_role", EnumColumn.CheckSql<CreditRole>("role"));
            t.HasCheckConstraint("ck_credits_source", EnumColumn.CheckSql<CreditSource>("source"));
        });
    }
}
