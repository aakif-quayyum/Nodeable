namespace Nodeable.Domain.Enums;

/// <summary>How complete a recording's credits are (spec section 8, <c>recordings.credits_status</c>).</summary>
public enum CreditsStatus
{
    None,
    Partial,
    Complete,
}
