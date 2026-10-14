import Pause from '@mui/icons-material/Pause'
import PlayArrow from '@mui/icons-material/PlayArrow'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import IconButton from '@mui/material/IconButton'
import LinearProgress from '@mui/material/LinearProgress'
import Link from '@mui/material/Link'
import Typography from '@mui/material/Typography'
import { useEffect } from 'react'
import { clock, deezerSearchUrl } from './previewFormat.ts'
import { stopPreview, togglePreview, usePreviewPlayback } from './previewPlayback.ts'

const visuallyHidden = {
  position: 'absolute',
  // Pixels, as strings: in sx a bare 1 means 100%.
  width: '1px',
  height: '1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
} as const

/** The parts of a song the control needs; a workspace song has all of them. */
export interface PreviewSong {
  mbid: string
  title: string
  artist: string
  hasPreview: boolean
  /** 'loading' means credits are still being fetched; no 'find it elsewhere' link is offered until that is over. */
  creditsStatus: 'none' | 'loading' | 'partial' | 'complete'
}

/**
 * The 30-second preview of one song (FR-PREVIEW-01): a play button, the time and a bar. The audio itself is one shared
 * element (`previewPlayback.ts`), so starting this song stops any other. Without a preview the control says so and offers
 * a link to look for the song at Deezer, which the person opens themselves; the page makes no request to Deezer for it.
 */
export function PreviewControl({ song, label = 'Preview' }: { song: PreviewSong; label?: string }) {
  const playback = usePreviewPlayback()
  const mine = playback.songMbid === song.mbid
  const phase = mine ? playback.phase : 'idle'

  // A card that leaves the page (the song was removed) must not leave its audio playing.
  useEffect(() => () => stopPreview(song.mbid), [song.mbid])

  if (!song.hasPreview) {
    if (song.creditsStatus === 'loading') return null
    return (
      <Typography variant='caption' color='text.secondary' component='p' sx={{ m: 0 }}>
        No preview here.{' '}
        <Link href={deezerSearchUrl(song)} target='_blank' rel='noopener noreferrer' underline='always' color='inherit'>
          Find it on Deezer<Box component='span' sx={visuallyHidden}> (opens in a new tab)</Box>
        </Link>
      </Typography>
    )
  }

  const playing = phase === 'playing'
  const loading = phase === 'loading'
  const duration = mine ? playback.duration : 0
  const position = mine ? playback.position : 0
  const status =
    phase === 'busy'
      ? 'The preview could not be loaded just now. Press play to try again.'
      : phase === 'unavailable'
        ? 'This song no longer has a preview.'
        : ''

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto', alignItems: 'center', columnGap: 1.25, rowGap: 0.5 }}>
      <IconButton
        onClick={() => void togglePreview(song.mbid)}
        aria-label={`${playing ? 'Pause' : 'Play'} the preview of ${song.title}`}
        disabled={phase === 'unavailable'}
        sx={(theme) => ({
          width: 40,
          height: 40,
          border: `1px solid ${theme.vars.palette.divider}`,
          '&:hover': { backgroundColor: theme.vars.palette.action.hover },
        })}
      >
        {loading ? <CircularProgress size={20} aria-label='Loading the preview' /> : playing ? <Pause /> : <PlayArrow />}
      </IconButton>

      <Box sx={{ minWidth: 0 }}>
        <Typography variant='caption' color='text.secondary' component='div' sx={{ lineHeight: 1.2 }}>
          {label} · 30 seconds
        </Typography>
        <LinearProgress
          variant='determinate'
          value={duration > 0 ? Math.min(100, (position / duration) * 100) : 0}
          aria-label={`Preview position of ${song.title}`}
          aria-valuetext={duration > 0 ? `${clock(position)} of ${clock(duration)}` : 'Not started'}
          sx={{
            mt: 0.75,
            height: 4,
            borderRadius: 2,
            '@media (prefers-reduced-motion: reduce)': { '& .MuiLinearProgress-bar': { transition: 'none' } },
          }}
        />
      </Box>

      <Typography variant='caption' color='text.secondary' sx={{ fontVariantNumeric: 'tabular-nums' }}>
        {clock(position)} / {clock(duration > 0 ? duration : 30)}
      </Typography>

      {/* Said out loud as it changes; the visible text below is the same words for people who can see it. */}
      <Box role='status' aria-live='polite' sx={visuallyHidden}>
        {playing ? `Playing the preview of ${song.title}` : phase === 'paused' ? 'Paused' : status}
      </Box>
      {status !== '' && (
        <Typography variant='caption' color='warning.main' sx={{ gridColumn: '1 / -1' }}>
          {status}
        </Typography>
      )}
    </Box>
  )
}
