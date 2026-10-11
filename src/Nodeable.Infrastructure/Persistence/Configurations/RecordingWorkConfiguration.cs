using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Nodeable.Domain.Entities;

namespace Nodeable.Infrastructure.Persistence.Configurations;

internal sealed class RecordingWorkConfiguration : IEntityTypeConfiguration<RecordingWork>
{
    public void Configure(EntityTypeBuilder<RecordingWork> builder)
    {
        builder.HasKey(rw => new { rw.RecordingMbid, rw.WorkMbid });

        builder.HasOne<Recording>().WithMany().HasForeignKey(rw => rw.RecordingMbid).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne<Work>().WithMany().HasForeignKey(rw => rw.WorkMbid).OnDelete(DeleteBehavior.Cascade);
    }
}
