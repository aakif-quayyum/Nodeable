import Box from '@mui/material/Box'
import { useMemo, useState } from 'react'
import { useReducedMotion } from '../../motion/useReducedMotion.ts'
import { artSources, type ArtInput, type ArtSource } from './artSources.ts'
import { Sleeve } from './Sleeve.tsx'

export interface AlbumArtProps extends ArtInput {
  /** The recording's MBID: it seeds the generated sleeve, so a song always has the same one. */
  seed: string
  /** The size in CSS pixels. Fixed, so a cover that arrives late never moves the page (no layout shift). */
  size: number
  /** What the image shows, for a screen reader: "Cover of Awaken, My Love!". Used only when a real cover is shown. */
  alt: string
}

/**
 * A song's cover (FR-ART-01). It tries each place in `artSources` in turn, with a plain `<img>` straight from the
 * Cover Art Archive or Deezer (never through the Api or the MusicBrainz gate), and falls back to a generated sleeve.
 * The sleeve is drawn underneath from the start, so there is something there while the image loads, and a failed
 * image is silent.
 */
export function AlbumArt({ seed, size, alt, releaseMbid, releaseGroupMbid, deezerCoverUrl }: AlbumArtProps) {
  const sources = useMemo(
    () => artSources({ releaseMbid, releaseGroupMbid, deezerCoverUrl }, size),
    [releaseMbid, releaseGroupMbid, deezerCoverUrl, size],
  )
  // Different ids start the chain again: the inner component's state is keyed by what it will try.
  const key = sources.map((source) => source.url).join('|')

  return (
    <Box sx={{ position: 'relative', width: size, height: size, flex: 'none', borderRadius: '4px', overflow: 'hidden' }}>
      <Sleeve seed={seed} size={size} />
      <ArtImage key={key} sources={sources} size={size} alt={alt} />
    </Box>
  )
}

function ArtImage({ sources, size, alt }: { sources: readonly ArtSource[]; size: number; alt: string }) {
  // LEARN: LG-03R image-fallback-chain | The chain is state: which source is being tried and whether it has loaded. An <img> that fails fires `error`, which moves to the next source, and when the list runs out nothing is rendered, so the sleeve underneath shows; the app makes no request itself, the browser loads and caches the image
  const [index, setIndex] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const reduced = useReducedMotion()
  const source = sources[index]

  if (source === undefined) {
    return null
  }

  return (
    <img
      // A new source is a new element, so the browser does not show the previous one's pixels while it loads.
      key={source.url}
      src={source.url}
      srcSet={source.srcSet}
      sizes={source.srcSet ? `${size}px` : undefined}
      // The alt text is for the image that is shown; before it has loaded there is nothing to describe.
      alt={loaded ? alt : ''}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      // No referrer: the image host learns that an address was asked for, not which page of ours asked (NFR-PRIV-01).
      referrerPolicy="no-referrer"
      onLoad={() => setLoaded(true)}
      onError={() => {
        setLoaded(false)
        setIndex((current) => current + 1)
      }}
      style={{
        position: 'absolute',
        inset: 0,
        display: 'block',
        width: size,
        height: size,
        objectFit: 'cover',
        opacity: loaded ? 1 : 0,
        // Opacity only (NFR-MOTION-01), and no fade at all when the person asked for less motion.
        transition: reduced ? 'none' : 'opacity 250ms cubic-bezier(0.2, 0.8, 0.2, 1)',
      }}
    />
  )
}
