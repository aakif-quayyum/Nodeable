using System.Collections.Frozen;
using Nodeable.Domain.Enums;

namespace Nodeable.Domain.Mapping;

/// <summary>The app's role for one MusicBrainz relationship, and the detail stored beside it.</summary>
/// <param name="Role">The mapped role.</param>
/// <param name="Detail">For example "bass guitar"; the raw MusicBrainz type for <see cref="CreditRole.Other"/>; never null.</param>
public readonly record struct MappedRole(CreditRole Role, string Detail);

/// <summary>Turns MusicBrainz relationship types into the app's credit roles (spec section 10, "Role mapping").</summary>
public static class RoleMapper
{
    // LEARN: LG-02 frozen-dictionary | A FrozenDictionary is built once and never changes, so the runtime can optimise its lookups for reads; a good fit for a lookup table that is fixed for the life of the process
    private static readonly FrozenDictionary<string, CreditRole> _roleByRelationshipType = new Dictionary<string, CreditRole>
    {
        ["producer"] = CreditRole.Producer,
        ["co-producer"] = CreditRole.Producer,
        ["executive producer"] = CreditRole.Producer,
        ["composer"] = CreditRole.Songwriter,
        ["lyricist"] = CreditRole.Songwriter,
        ["writer"] = CreditRole.Songwriter,
        ["mix"] = CreditRole.Mixing,
        ["mix-DJ"] = CreditRole.Mixing,
        ["engineer"] = CreditRole.Engineering,
        ["recording"] = CreditRole.Engineering,
        ["mastering"] = CreditRole.Engineering,
        ["sound"] = CreditRole.Engineering,
        ["instrument"] = CreditRole.Instrument,
        ["vocal"] = CreditRole.Vocal,
    }.ToFrozenDictionary(StringComparer.OrdinalIgnoreCase);

    /// <summary>
    /// Maps one relationship. An unknown type is not an error: it becomes <see cref="CreditRole.Other"/> with the raw
    /// type as detail, so no credit is lost (spec section 10).
    /// </summary>
    /// <param name="relationshipType">The MusicBrainz relationship type, for example "producer".</param>
    /// <param name="attributes">The relationship's attributes, for example "bass guitar"; used only for instruments and vocals.</param>
    public static MappedRole Map(string? relationshipType, IEnumerable<string>? attributes = null)
    {
        var type = relationshipType?.Trim() ?? string.Empty;
        if (!_roleByRelationshipType.TryGetValue(type, out var role))
        {
            return new MappedRole(CreditRole.Other, type);
        }

        // LEARN: LG-02 or-pattern | An "is A or B" pattern tests a value against several constants in one readable expression, where JavaScript would chain === comparisons
        var detail = role is CreditRole.Instrument or CreditRole.Vocal ? JoinAttributes(attributes) : string.Empty;
        return new MappedRole(role, detail);
    }

    // The attributes are sorted and de-duplicated because Detail is part of the credits unique index: the same
    // relationship read twice must produce the same text, or a re-crawl would insert a duplicate.
    private static string JoinAttributes(IEnumerable<string>? attributes) =>
        attributes is null
            ? string.Empty
            : string.Join(", ", attributes
                .Select(a => a.Trim())
                .Where(a => a.Length > 0)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .Order(StringComparer.OrdinalIgnoreCase));
}
