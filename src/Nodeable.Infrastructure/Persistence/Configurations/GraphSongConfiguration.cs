using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Nodeable.Domain.Entities;

namespace Nodeable.Infrastructure.Persistence.Configurations;

internal sealed class GraphSongConfiguration : IEntityTypeConfiguration<GraphSong>
{
    public void Configure(EntityTypeBuilder<GraphSong> builder)
    {
        builder.HasKey(gs => new { gs.GraphId, gs.RecordingMbid });

        builder.Property(gs => gs.AddedAt).HasDefaultValueSql("now()");

        // Deleting a graph removes its song links; a recording that is still in some graph cannot be deleted.
        builder.HasOne<Graph>().WithMany().HasForeignKey(gs => gs.GraphId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne<Recording>().WithMany().HasForeignKey(gs => gs.RecordingMbid).OnDelete(DeleteBehavior.Restrict);
    }
}
