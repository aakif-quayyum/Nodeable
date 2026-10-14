using System.Globalization;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Nodeable.Domain.Enums;
using Nodeable.Infrastructure.Persistence;

namespace Nodeable.Infrastructure.Deezer;

/// <summary>A preview address that is good for a few minutes, and when it stops being good.</summary>
/// <param name="Url">The signed URL of the 30-second preview. Never stored, and never cached beyond <paramref name="ExpiresAt"/>.</param>
/// <param name="ExpiresAt">When the signature runs out, read from the URL; null when the URL does not say.</param>
public sealed record PreviewLink(string Url, DateTimeOffset? ExpiresAt);

/// <summary>
/// Answers "where can this recording's preview be played from, right now" (FR-PREVIEW-01). The stored row holds only
/// Deezer's track ID, because the preview URL is signed and expires about 15 minutes after it is issued (decision 0022),
/// so each request asks Deezer for a fresh one through the shared gate.
/// </summary>
public sealed partial class PreviewLinkService(NodeableDbContext db, IDeezerClient deezer)
{
    // The URL carries "hdnea=exp=<unix seconds>~hmac=...": the expiry is part of what Deezer signed.
    // LEARN: LG-04 generated-regex | [GeneratedRegex] on a partial method makes the compiler write the matcher at build time, so there is no Regex object to construct or cache at run time
    [GeneratedRegex(@"[?&]hdnea=exp=(?<exp>\d{9,11})(?:~|&|$)", RegexOptions.CultureInvariant)]
    private static partial Regex ExpiryPattern();

    /// <summary>The link, or null when the recording has no preview row or Deezer no longer has a preview for it.</summary>
    /// <exception cref="DeezerException">Deezer could not answer.</exception>
    public async Task<PreviewLink?> GetAsync(Guid recordingMbid, CancellationToken cancellationToken)
    {
        var trackId = await db.Previews
            .AsNoTracking()
            .Where(p => p.RecordingMbid == recordingMbid && p.Provider == PreviewProvider.Deezer)
            .Select(p => p.ProviderTrackId)
            .SingleOrDefaultAsync(cancellationToken);

        if (trackId is null)
        {
            return null;
        }

        var track = await deezer.GetTrackAsync(trackId, cancellationToken);
        return track?.PreviewUrl is { } url ? new PreviewLink(url, ExpiryOf(url)) : null;
    }

    /// <summary>The time a signed preview URL says it expires, or null when it has no readable expiry.</summary>
    public static DateTimeOffset? ExpiryOf(string previewUrl)
    {
        var match = ExpiryPattern().Match(previewUrl);
        return match.Success && long.TryParse(match.Groups["exp"].Value, NumberStyles.None, CultureInfo.InvariantCulture, out var seconds)
            ? DateTimeOffset.FromUnixTimeSeconds(seconds)
            : null;
    }
}
