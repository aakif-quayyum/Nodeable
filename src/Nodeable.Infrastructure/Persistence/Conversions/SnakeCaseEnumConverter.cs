using System.Text;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace Nodeable.Infrastructure.Persistence.Conversions;

/// <summary>
/// Stores an enum as snake_case text ("title_artist") for members whose name is more than one word, where the
/// lower-case converter would write "titleartist".
/// </summary>
public sealed class SnakeCaseEnumConverter<TEnum>() : ValueConverter<TEnum, string>(
    value => EnumText.ToSnakeCase(value),
    text => EnumText.ParseSnakeCase<TEnum>(text))
    where TEnum : struct, Enum;

/// <summary>The snake_case mapping the converter uses, for the raw SQL that bypasses EF Core's conversions and for CHECK constraints.</summary>
public static class EnumText
{
    public static string ToSnakeCase<TEnum>(TEnum value)
        where TEnum : struct, Enum => ToSnake(value.ToString());

    /// <summary>Every member's column text, for a CHECK constraint.</summary>
    public static IEnumerable<string> AllSnakeCase<TEnum>()
        where TEnum : struct, Enum => Enum.GetNames<TEnum>().Select(ToSnake);

    public static TEnum ParseSnakeCase<TEnum>(string text)
        where TEnum : struct, Enum => Enum.GetValues<TEnum>().First(v => ToSnake(v.ToString()) == text);

    private static string ToSnake(string name)
    {
        var builder = new StringBuilder(name.Length + 4);
        foreach (var c in name)
        {
            if (char.IsUpper(c) && builder.Length > 0)
            {
                builder.Append('_');
            }

            builder.Append(char.ToLowerInvariant(c));
        }

        return builder.ToString();
    }
}
