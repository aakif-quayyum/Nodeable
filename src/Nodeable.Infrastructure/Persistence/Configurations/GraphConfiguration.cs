using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Nodeable.Domain.Entities;

namespace Nodeable.Infrastructure.Persistence.Configurations;

internal sealed class GraphConfiguration : IEntityTypeConfiguration<Graph>
{
    public void Configure(EntityTypeBuilder<Graph> builder)
    {
        builder.HasKey(g => g.Id);

        // The API creates the Guid, so it can be returned and used in URLs before any insert.
        builder.Property(g => g.Id).ValueGeneratedNever();

        builder.Property(g => g.Name).IsRequired();
    }
}
