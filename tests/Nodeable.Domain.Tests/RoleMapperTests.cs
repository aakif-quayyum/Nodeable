using Nodeable.Domain.Enums;
using Nodeable.Domain.Mapping;

namespace Nodeable.Domain.Tests;

public class RoleMapperTests
{
    // One row per relationship type in the spec's role table (section 10).
    [Theory]
    [InlineData("producer", CreditRole.Producer)]
    [InlineData("co-producer", CreditRole.Producer)]
    [InlineData("executive producer", CreditRole.Producer)]
    [InlineData("composer", CreditRole.Songwriter)]
    [InlineData("lyricist", CreditRole.Songwriter)]
    [InlineData("writer", CreditRole.Songwriter)]
    [InlineData("mix", CreditRole.Mixing)]
    [InlineData("mix-DJ", CreditRole.Mixing)]
    [InlineData("engineer", CreditRole.Engineering)]
    [InlineData("recording", CreditRole.Engineering)]
    [InlineData("mastering", CreditRole.Engineering)]
    [InlineData("sound", CreditRole.Engineering)]
    [InlineData("instrument", CreditRole.Instrument)]
    [InlineData("vocal", CreditRole.Vocal)]
    public void FR_GRAPH_03_every_relationship_type_in_the_spec_table_maps_to_its_role(string relationshipType, CreditRole expected)
    {
        var mapped = RoleMapper.Map(relationshipType);

        mapped.Role.Should().Be(expected);
    }

    [Theory]
    [InlineData("PRODUCER")]
    [InlineData("Producer")]
    [InlineData("  producer  ")]
    public void FR_GRAPH_03_matching_ignores_case_and_surrounding_spaces(string relationshipType)
    {
        RoleMapper.Map(relationshipType).Role.Should().Be(CreditRole.Producer);
    }

    [Fact]
    public void FR_GRAPH_03_an_unmapped_type_becomes_other_and_keeps_the_raw_type_as_detail()
    {
        var mapped = RoleMapper.Map("arranger");

        mapped.Should().Be(new MappedRole(CreditRole.Other, "arranger"));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void FR_GRAPH_03_a_missing_type_becomes_other_with_empty_detail_never_null(string? relationshipType)
    {
        var mapped = RoleMapper.Map(relationshipType);

        mapped.Should().Be(new MappedRole(CreditRole.Other, string.Empty));
    }

    [Fact]
    public void FR_GRAPH_03_instrument_detail_comes_from_the_attributes()
    {
        var mapped = RoleMapper.Map("instrument", ["bass guitar"]);

        mapped.Should().Be(new MappedRole(CreditRole.Instrument, "bass guitar"));
    }

    [Fact]
    public void FR_GRAPH_03_vocal_detail_comes_from_the_attributes()
    {
        var mapped = RoleMapper.Map("vocal", ["background vocals"]);

        mapped.Should().Be(new MappedRole(CreditRole.Vocal, "background vocals"));
    }

    [Fact]
    public void FR_GRAPH_03_attribute_order_does_not_change_the_detail_so_a_re_crawl_stays_idempotent()
    {
        var first = RoleMapper.Map("instrument", ["guitar", "additional", "guest"]);
        var second = RoleMapper.Map("instrument", ["guest", "guitar", "additional"]);

        first.Detail.Should().Be("additional, guest, guitar");
        second.Should().Be(first);
    }

    [Fact]
    public void FR_GRAPH_03_duplicate_and_blank_attributes_are_dropped()
    {
        var mapped = RoleMapper.Map("instrument", ["piano", "Piano", " ", ""]);

        mapped.Detail.Should().Be("piano");
    }

    [Theory]
    [InlineData("instrument")]
    [InlineData("vocal")]
    public void FR_GRAPH_03_no_attributes_gives_empty_detail_never_null(string relationshipType)
    {
        RoleMapper.Map(relationshipType).Detail.Should().BeEmpty();
        RoleMapper.Map(relationshipType, []).Detail.Should().BeEmpty();
    }

    [Fact]
    public void FR_GRAPH_03_attributes_are_ignored_for_roles_that_do_not_use_them()
    {
        var mapped = RoleMapper.Map("producer", ["additional"]);

        mapped.Should().Be(new MappedRole(CreditRole.Producer, string.Empty));
    }
}
