using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Nodeable.Domain.Entities;

namespace Nodeable.Infrastructure.Persistence.Configurations;

internal sealed class RecordingReleaseConfiguration : IEntityTypeConfiguration<RecordingRelease>
{
    public void Configure(EntityTypeBuilder<RecordingRelease> builder)
    {
        builder.HasKey(rr => new { rr.RecordingMbid, rr.ReleaseMbid });
        builder.HasOne<Recording>().WithMany().HasForeignKey(rr => rr.RecordingMbid).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne<Release>().WithMany().HasForeignKey(rr => rr.ReleaseMbid).OnDelete(DeleteBehavior.Cascade);
    }
}
