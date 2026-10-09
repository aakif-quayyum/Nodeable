using Nodeable.Domain.Enums;

namespace Nodeable.Domain.Entities;

/// <summary>One person, one role, on one subject (spec section 8, <c>credits</c>).</summary>
public class Credit
{
    /// <summary>Database-generated surrogate key.</summary>
    public long Id { get; init; }

    public required Guid PersonMbid { get; init; }

    public required CreditSubjectType SubjectType { get; init; }

    public required Guid SubjectMbid { get; init; }

    public required CreditRole Role { get; init; }

    /// <summary>
    /// Extra detail such as "bass guitar", or the raw MusicBrainz type for <see cref="CreditRole.Other"/>.
    /// Never null: the spec's unique index includes this column and PostgreSQL treats NULLs as distinct,
    /// so a NULL here would let re-crawls insert duplicates.
    /// </summary>
    public string Detail { get; init; } = string.Empty;

    public CreditSource Source { get; init; } = CreditSource.MusicBrainz;
}
