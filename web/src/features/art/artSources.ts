export type ArtOrigin = 'release' | 'release-group' | 'deezer'

export interface ArtSource {
  origin: ArtOrigin
  url: string
  /** Width descriptors for a larger display size; undefined when one image is enough. */
  srcSet?: string
}

export interface ArtInput {
  releaseMbid?: string | null
  releaseGroupMbid?: string | null
  /** The Deezer album cover (the 250 px one), from `deezerCoverUrl`; null when the song has no stored preview. */
  deezerCoverUrl?: string | null
}

const archive = 'https://coverartarchive.org'

// The only host a Deezer cover may come from (verified 2026-10-13). A URL that is not on it is ignored rather than
// rendered, so a bad value in the data cannot make the page load an image from anywhere.
const deezerHost = 'cdn-images.dzcdn.net'

/**
 * The Deezer cover address for a stored album image ID (`previews.cover_md5`, FR-PREVIEW-01), or null when there is no
 * ID or it is not a 32-digit hex ID. Only the ID is stored (decision 0025); the address is built here, on the one
 * host a cover may come from, so a bad value in the data cannot name another.
 */
export function deezerCoverUrl(md5: string | null | undefined): string | null {
  return md5 != null && /^[0-9a-f]{32}$/.test(md5) ? `https://${deezerHost}/images/cover/${md5}/250x250-000000-80-0-0.jpg` : null
}

/** Above this many CSS pixels the 500 px image is offered as well, for dense screens and large placements. */
const LARGE_ABOVE = 125

function archiveSource(origin: ArtOrigin, kind: 'release' | 'release-group', mbid: string, size: number): ArtSource {
  const base = `${archive}/${kind}/${mbid}`
  const small = `${base}/front-250`

  return size > LARGE_ABOVE
    ? { origin, url: small, srcSet: `${small} 250w, ${base}/front-500 500w` }
    : { origin, url: small }
}

function deezerSource(url: string, size: number): ArtSource | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:' || parsed.hostname !== deezerHost) return null

  const large = url.replace('/250x250-', '/500x500-')
  return size > LARGE_ABOVE && large !== url
    ? { origin: 'deezer', url, srcSet: `${url} 250w, ${large} 500w` }
    : { origin: 'deezer', url }
}

/**
 * The places a song's cover is tried, in order (FR-ART-01): the Cover Art Archive by release, then by release group,
 * then the Deezer album cover. When none can load, the caller draws the generated sleeve.
 */
export function artSources(input: ArtInput, size: number): ArtSource[] {
  const sources: ArtSource[] = []

  if (input.releaseMbid) sources.push(archiveSource('release', 'release', input.releaseMbid, size))
  if (input.releaseGroupMbid) sources.push(archiveSource('release-group', 'release-group', input.releaseGroupMbid, size))
  if (input.deezerCoverUrl) {
    const deezer = deezerSource(input.deezerCoverUrl, size)
    if (deezer) sources.push(deezer)
  }

  return sources
}
