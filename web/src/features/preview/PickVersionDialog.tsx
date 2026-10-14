import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Link from '@mui/material/Link'
import Typography from '@mui/material/Typography'
import { useMutation, useQuery } from '@tanstack/react-query'
import { AlbumArt } from '../art/AlbumArt.tsx'
import { deezerCoverUrl } from '../art/artSources.ts'
import { fetchPreviewCandidates, pickPreviewCandidate, PreviewRequestError, type PreviewCandidate } from './previewApi.ts'
import { clock, deezerSearchUrl } from './previewFormat.ts'

interface PickVersionDialogProps {
  open: boolean
  onClose: () => void
  song: { mbid: string; title: string; artist: string }
}

function describeFailure(error: unknown): string {
  const status = error instanceof PreviewRequestError ? error.status : 0
  if (status === 429) return 'Too many tries in a minute. Wait a little and try again.'
  if (status === 409) return 'This song has a preview now. Close this and it will appear.'
  if (status === 422) return 'That version is not on the list any more. Close this and open it again.'
  return 'Deezer could not be reached just now. Try again in a few seconds.'
}

/**
 * "Pick the right version" (FR-PREVIEW-01, decision 0026): when no Deezer match is confident enough, the first five results
 * are listed with their cover, title, artist, album and length, and choosing one stores it for everyone. The page sends only
 * the track's id; the Api checks it against the results it would have offered. The link to look for the song at Deezer is
 * the last resort, for when none of the five is right.
 */
export function PickVersionDialog({ open, onClose, song }: PickVersionDialogProps) {
  const candidates = useQuery({
    queryKey: ['preview-candidates', song.mbid],
    queryFn: ({ signal }) => fetchPreviewCandidates(song.mbid, signal),
    enabled: open,
    // A list is a moment's answer from Deezer: asked again each time the dialog opens, never reused. (Not gcTime: 0: a query
    // that is dropped the moment it has no observer is created again by the next render, which asked Deezer in a loop.)
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    retry: false,
  })

  const pick = useMutation({
    mutationFn: (trackId: string) => pickPreviewCandidate(song.mbid, trackId),
    // The graph learns of the pick through PreviewFound; the dialog only has to get out of the way.
    onSuccess: onClose,
  })

  const titleId = `pick-${song.mbid}-title`

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" aria-labelledby={titleId}>
      <DialogTitle id={titleId}>Pick the right version</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          No version of <b>{song.title}</b> by {song.artist} matched with confidence. These are Deezer&apos;s first results; the one you
          choose gets a preview for everyone.
        </Typography>

        {candidates.isPending && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 2 }} role="status">
            <CircularProgress size={20} aria-hidden />
            <Typography variant="body2">Asking Deezer…</Typography>
          </Box>
        )}

        {candidates.isError && (
          <Typography role="alert" variant="body2" color="warning.main">
            {describeFailure(candidates.error)}
          </Typography>
        )}

        {candidates.data?.length === 0 && (
          <Typography variant="body2">Deezer has no result with a preview for this song.</Typography>
        )}

        {candidates.data !== undefined && candidates.data.length > 0 && (
          <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1 }} aria-label="Deezer results">
            {candidates.data.map((candidate) => (
              <CandidateRow
                key={candidate.trackId}
                candidate={candidate}
                busy={pick.isPending}
                onPick={() => pick.mutate(candidate.trackId)}
              />
            ))}
          </Box>
        )}

        {pick.isError && (
          <Typography role="alert" variant="body2" color="warning.main" sx={{ mt: 1.5 }}>
            {describeFailure(pick.error)}
          </Typography>
        )}
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'space-between', px: 2.5 }}>
        <Link href={deezerSearchUrl(song)} target="_blank" rel="noopener noreferrer" underline="always" variant="body2" color="inherit">
          None of these? Look for it on Deezer
          <Box component="span" sx={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>
            {' '}
            (opens in a new tab)
          </Box>
        </Link>
        <Button onClick={onClose} color="inherit">
          Cancel
        </Button>
      </DialogActions>
    </Dialog>
  )
}

function CandidateRow({ candidate, busy, onPick }: { candidate: PreviewCandidate; busy: boolean; onPick: () => void }) {
  const detail = [candidate.album, candidate.durationSeconds === null ? null : clock(candidate.durationSeconds)]
    .filter((part) => part !== null && part !== '')
    .join(' · ')

  return (
    <Box
      component="li"
      sx={(theme) => ({
        display: 'grid',
        gridTemplateColumns: '48px minmax(0, 1fr) auto',
        gap: 1.5,
        alignItems: 'center',
        p: 1,
        borderRadius: '10px',
        border: `1px solid ${theme.vars.palette.divider}`,
      })}
    >
      <AlbumArt
        seed={candidate.trackId}
        size={48}
        alt=""
        deezerCoverUrl={deezerCoverUrl(candidate.coverMd5)}
      />
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{candidate.title}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
          {candidate.artist}
        </Typography>
        {detail !== '' && (
          <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
            {detail}
          </Typography>
        )}
      </Box>
      <Button
        variant="outlined"
        size="small"
        disabled={busy}
        onClick={onPick}
        aria-label={`Use this version: ${candidate.title} by ${candidate.artist}${detail === '' ? '' : `, ${detail}`}`}
      >
        Use this
      </Button>
    </Box>
  )
}
