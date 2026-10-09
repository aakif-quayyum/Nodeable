namespace Nodeable.Infrastructure.Persistence.Conversions;

internal static class EnumColumn
{
    /// <summary>
    /// Builds a SQL CHECK expression listing every value of the enum, so the database rejects text
    /// that no enum member maps to (spec principle 5: honest data).
    /// </summary>
    public static string CheckSql<TEnum>(string column)
        where TEnum : struct, Enum
    {
        var values = Enum.GetNames<TEnum>().Select(name => $"'{name.ToLowerInvariant()}'");
        return $"{column} IN ({string.Join(", ", values)})";
    }
}
