using System.Reflection;

namespace Nodeable.Infrastructure.MusicBrainz;

/// <summary>
/// MusicBrainz requires every client to identify itself with an application name, a version and a way to get in
/// touch, in the form <c>Nodeable/{version} ( {contact} )</c>, or it may block the caller
/// (<see href="https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting">rate limiting</see>).
/// </summary>
public static class MusicBrainzUserAgent
{
    public static string Create(string version, string contactUrl) => $"Nodeable/{version} ( {contactUrl} )";

    /// <summary>The version set in Directory.Build.props, without the source revision suffix the SDK adds.</summary>
    public static string CurrentVersion()
    {
        var informational = typeof(MusicBrainzUserAgent).Assembly
            .GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion;

        return informational?.Split('+')[0] ?? "0.0.0";
    }
}
