using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Nodeable.Domain.Entities;

namespace Nodeable.Infrastructure.Persistence.Configurations;

internal sealed class PersonConfiguration : IEntityTypeConfiguration<Person>
{
    public void Configure(EntityTypeBuilder<Person> builder)
    {
        builder.HasKey(p => p.Mbid);
        builder.Property(p => p.Mbid).ValueGeneratedNever();
        builder.Property(p => p.Name).IsRequired();
        builder.Property(p => p.FetchedAt).HasDefaultValueSql("now()");
    }
}
