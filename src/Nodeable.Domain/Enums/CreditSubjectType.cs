namespace Nodeable.Domain.Enums;

/// <summary>The level a credit was found on. Every credit lives in one table whichever level it came from (spec section 8).</summary>
public enum CreditSubjectType
{
    Recording,
    Work,
    Release,
}
