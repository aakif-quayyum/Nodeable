using Nodeable.Domain.Enums;

namespace Nodeable.Infrastructure.People;

// The shapes the Api returns for a person (spec section 9, FR-PERSON-01). They are plain records so the same type is the
// JSON contract, the OpenAPI schema and the generated TypeScript type.

/// <summary>How many of the person's stored recordings carry a role: the "role summary" of the drawer.</summary>
public sealed record RoleSummaryItem(CreditRole Role, int Recordings);

/// <summary>
/// A person, summarised from the credits Nodeable has stored (the drawer reads the cache and asks MusicBrainz nothing).
/// <c>FirstYear</c> and <c>LastYear</c> are the earliest and latest first-release year among the stored recordings, so
/// they are a lower bound on a career, not the career: the drawer says so.
/// </summary>
public sealed record PersonProfile(
    Guid Mbid,
    string Name,
    string? Type,
    string? Disambiguation,
    IReadOnlyList<RoleSummaryItem> Roles,
    int RecordingCount,
    int CreditCount,
    int? FirstYear,
    int? LastYear);

public sealed record PersonRecordingRole(CreditRole Role, string Detail);

/// <summary>A stored recording the person is credited on, with every role they have on it.</summary>
public sealed record PersonRecordingItem(
    Guid Mbid,
    string Title,
    string Artist,
    int? Year,
    IReadOnlyList<PersonRecordingRole> Roles);

public sealed record PersonRecordingsPage(int Page, int PageSize, int Total, IReadOnlyList<PersonRecordingItem> Items);
