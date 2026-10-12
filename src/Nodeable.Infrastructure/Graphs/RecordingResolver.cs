using Nodeable.Infrastructure.MusicBrainz;

namespace Nodeable.Infrastructure.Graphs;

/// <summary>What MusicBrainz says a recording is called.</summary>
public sealed record ResolvedRecording(string Title, string ArtistCredit);

/// <summary>
/// Confirms with MusicBrainz that an MBID is a recording, and learns its title and artist, before the recording is
/// stored for a graph. The Api could take the title from the client, but the recordings table is a cache shared by
/// everyone's searches: a made-up MBID with a made-up title would sit in it as a result for every later search.
/// </summary>
public interface IRecordingResolver
{
    /// <returns>The recording's title and artist, or null when MusicBrainz has no such recording.</returns>
    /// <exception cref="MusicBrainzUnavailableException">MusicBrainz could not be asked in time, or did not answer.</exception>
    Task<ResolvedRecording?> ResolveAsync(Guid recordingMbid, CancellationToken cancellationToken);
}

public sealed class RecordingResolver(IMusicBrainzClient musicBrainz) : IRecordingResolver
{
    public async Task<ResolvedRecording?> ResolveAsync(Guid recordingMbid, CancellationToken cancellationToken)
    {
        var recording = await MusicBrainzUnavailableException.TranslateAsync(
            () => musicBrainz.GetRecordingSummaryAsync(recordingMbid, cancellationToken));

        if (recording is null)
        {
            return null;
        }

        var artist = string.Concat((recording.ArtistCredit ?? []).Select(c => c.Name + c.JoinPhrase));
        return new ResolvedRecording(recording.Title, string.IsNullOrWhiteSpace(artist) ? "Unknown artist" : artist);
    }
}
