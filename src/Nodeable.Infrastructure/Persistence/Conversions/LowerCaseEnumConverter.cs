using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace Nodeable.Infrastructure.Persistence.Conversions;

/// <summary>
/// Stores an enum as lower-case text ("complete", "musicbrainz") instead of an integer.
/// The spec's SQL (for example the recording_people view) compares against lower-case literals such as 'recording'.
/// </summary>
// LEARN: LG-01 value-converter | A ValueConverter translates between a C# type and a database column type in both directions; here enum <-> text, so rows stay readable in psql and not tied to enum declaration order
public sealed class LowerCaseEnumConverter<TEnum>() : ValueConverter<TEnum, string>(
    value => value.ToString().ToLowerInvariant(),
    text => Enum.Parse<TEnum>(text, true))
    where TEnum : struct, Enum;
