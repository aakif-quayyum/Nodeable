using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Nodeable.Domain.Entities;

namespace Nodeable.Infrastructure.Persistence.Configurations;

internal sealed class RecordingWorkConfiguration : IEntityTypeConfiguration<RecordingWork>
{
    public void Configure(EntityTypeBuilder<RecordingWork> builder)
    {
        // LEARN: LG-01 composite-key | A link table's primary key is the pair of IDs, written as an anonymous object; the same pair can only be linked once
        builder.HasKey(rw => new { rw.RecordingMbid, rw.WorkMbid });

        // LEARN: LG-01 foreign-key-no-navigation | HasOne<T>() with no property name configures a foreign key without a navigation property on the class, so the Domain types stay plain data and queries join explicitly
        builder.HasOne<Recording>().WithMany().HasForeignKey(rw => rw.RecordingMbid).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne<Work>().WithMany().HasForeignKey(rw => rw.WorkMbid).OnDelete(DeleteBehavior.Cascade);
    }
}
