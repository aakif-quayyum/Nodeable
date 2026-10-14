namespace Nodeable.Infrastructure.Persistence.Conversions;

internal static class EnumColumn
{
    /// <summary>
    /// Builds a SQL CHECK expression listing every value of the enum, so the database rejects text
    /// that no enum member maps to (spec principle 5: honest data). <paramref name="snakeCase"/> says the column holds
    /// <see cref="EnumText"/> text ("title_artist") and not lower-case text ("titleartist").
    /// </summary>
    public static string CheckSql<TEnum>(string column, bool snakeCase = false)
        where TEnum : struct, Enum
    {
        var names = snakeCase ? EnumText.AllSnakeCase<TEnum>() : Enum.GetNames<TEnum>().Select(n => n.ToLowerInvariant());
        return $"{column} IN ({string.Join(", ", names.Select(n => $"'{n}'"))})";
    }
}
