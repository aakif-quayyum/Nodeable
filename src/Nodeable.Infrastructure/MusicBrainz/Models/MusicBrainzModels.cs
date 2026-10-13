using System.Text.Json.Serialization;

namespace Nodeable.Infrastructure.MusicBrainz.Models;

// The shapes of the MusicBrainz web service JSON (https://musicbrainz.org/doc/MusicBrainz_API), reduced to the fields
// Nodeable uses. MusicBrainz names its properties in kebab-case ("artist-credit"), so each one is mapped with
// [JsonPropertyName]. Fields MusicBrainz leaves out are nullable here: a missing field is a normal case, not an error.

/// <summary>One artist as named on a credit, relationship or release.</summary>
public sealed record ArtistRef(
    [property: JsonPropertyName("id")] Guid Id,
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("sort-name")] string? SortName = null,
    [property: JsonPropertyName("type")] string? Type = null,
    [property: JsonPropertyName("disambiguation")] string? Disambiguation = null);

/// <summary>One name in an "artist credit", for example "Beyoncé feat. Jay-Z" is two of these.</summary>
public sealed record ArtistCreditName(
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("artist")] ArtistRef Artist,
    [property: JsonPropertyName("joinphrase")] string? JoinPhrase = null);

/// <summary>A work (composition) linked from a recording.</summary>
public sealed record WorkRef(
    [property: JsonPropertyName("id")] Guid Id,
    [property: JsonPropertyName("title")] string Title);

/// <summary>
/// A release (album or single) a recording appears on. <see cref="Status"/> (Official, Promotion, Bootleg) and the
/// release group's secondary types (Live, Compilation, DJ-mix) are what search uses to pick the original of several
/// duplicate recordings (FR-SEARCH-02).
/// </summary>
public sealed record ReleaseRef(
    [property: JsonPropertyName("id")] Guid Id,
    [property: JsonPropertyName("title")] string Title,
    [property: JsonPropertyName("date")] string? Date = null,
    [property: JsonPropertyName("status")] string? Status = null,
    [property: JsonPropertyName("release-group")] ReleaseGroupRef? ReleaseGroup = null);

/// <summary>
/// The release group a release belongs to; its secondary types say whether it is a live album or a compilation, and
/// its ID is the second place a cover is looked up (FR-ART-01).
/// </summary>
public sealed record ReleaseGroupRef(
    [property: JsonPropertyName("primary-type")] string? PrimaryType = null,
    [property: JsonPropertyName("secondary-types")] IReadOnlyList<string>? SecondaryTypes = null,
    [property: JsonPropertyName("id")] Guid? Id = null);

/// <summary>
/// A link from the entity being looked up to an artist (a credit such as producer) or to a work. <see cref="Type"/> is
/// the MusicBrainz relationship type that <c>RoleMapper</c> maps to a role; <see cref="Attributes"/> carry detail such as an instrument.
/// </summary>
public sealed record Relation(
    [property: JsonPropertyName("type")] string Type,
    [property: JsonPropertyName("target-type")] string TargetType,
    [property: JsonPropertyName("attributes")] IReadOnlyList<string>? Attributes = null,
    [property: JsonPropertyName("artist")] ArtistRef? Artist = null,
    [property: JsonPropertyName("work")] WorkRef? Work = null);

/// <summary>One hit of a recording search (FR-SEARCH-01).</summary>
public sealed record RecordingSearchResult(
    [property: JsonPropertyName("id")] Guid Id,
    [property: JsonPropertyName("score")] int Score,
    [property: JsonPropertyName("title")] string Title,
    [property: JsonPropertyName("artist-credit")] IReadOnlyList<ArtistCreditName>? ArtistCredit = null,
    [property: JsonPropertyName("first-release-date")] string? FirstReleaseDate = null,
    [property: JsonPropertyName("length")] int? LengthMs = null,
    [property: JsonPropertyName("releases")] IReadOnlyList<ReleaseRef>? Releases = null,
    [property: JsonPropertyName("disambiguation")] string? Disambiguation = null);

public sealed record RecordingSearchResponse(
    [property: JsonPropertyName("count")] int Count,
    [property: JsonPropertyName("offset")] int Offset,
    [property: JsonPropertyName("recordings")] IReadOnlyList<RecordingSearchResult> Recordings);

/// <summary>A recording looked up by MBID with its credits, linked work, releases and ISRCs.</summary>
public sealed record RecordingLookup(
    [property: JsonPropertyName("id")] Guid Id,
    [property: JsonPropertyName("title")] string Title,
    [property: JsonPropertyName("artist-credit")] IReadOnlyList<ArtistCreditName>? ArtistCredit = null,
    [property: JsonPropertyName("first-release-date")] string? FirstReleaseDate = null,
    [property: JsonPropertyName("length")] int? LengthMs = null,
    [property: JsonPropertyName("isrcs")] IReadOnlyList<string>? Isrcs = null,
    [property: JsonPropertyName("relations")] IReadOnlyList<Relation>? Relations = null,
    [property: JsonPropertyName("releases")] IReadOnlyList<ReleaseRef>? Releases = null);

/// <summary>A work looked up by MBID with its composer, lyricist and writer relationships.</summary>
public sealed record WorkLookup(
    [property: JsonPropertyName("id")] Guid Id,
    [property: JsonPropertyName("title")] string Title,
    [property: JsonPropertyName("relations")] IReadOnlyList<Relation>? Relations = null);

/// <summary>A release looked up by MBID with its artist relationships (used when no producer was found earlier).</summary>
public sealed record ReleaseLookup(
    [property: JsonPropertyName("id")] Guid Id,
    [property: JsonPropertyName("title")] string Title,
    [property: JsonPropertyName("date")] string? Date = null,
    [property: JsonPropertyName("relations")] IReadOnlyList<Relation>? Relations = null);
