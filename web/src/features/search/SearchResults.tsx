import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Collapse from '@mui/material/Collapse'
import LinearProgress from '@mui/material/LinearProgress'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import Typography from '@mui/material/Typography'
import { useId, useState } from 'react'
import type { components } from '../../api/schema'
import { AlbumArt } from '../art/AlbumArt.tsx'
import { GraphRequestError } from '../graph/graphApi.ts'
import { useAddSong, useGraphSongIds } from '../graph/useGraphMutations.ts'
import { SearchError, useRecordingSearch } from './useRecordingSearch.ts'

type Result = components['schemas']['SearchResultItem']
type Version = components['schemas']['SearchVersionItem']
type CreditsStatus = components['schemas']['CreditsStatus']

const kindLabels: Record<Version['kind'], string> = {
  live: 'Live',
  remaster: 'Remaster',
  compilation: 'Compilation',
  other: 'Other version',
}

function describe(item: { artist: string; firstReleaseTitle: string | null; year: number | null }) {
  // A year that is not known is left out, never shown as 0 (spec principle 5).
  const release = item.firstReleaseTitle
    ? item.year === null
      ? item.firstReleaseTitle
      : `${item.firstReleaseTitle} (${item.year})`
    : item.year === null
      ? null
      : String(item.year)

  return release === null ? item.artist : `${item.artist} · ${release}`
}

function cachedLabel(status: CreditsStatus | null): string | null {
  if (status === 'complete') return 'Credits cached'
  if (status === 'partial') return 'Some credits cached'
  // "none" means the song is known but nothing is credited, and null means it has never been fetched: neither is worth a chip.
  return null
}

function errorMessage(error: unknown): string {
  if (error instanceof SearchError) {
    if (error.status === 429) {
      return 'Search is busy right now. Try again in a few seconds.'
    }
    if (error.status === 503) {
      return 'MusicBrainz is not answering right now. Try again in a few seconds.'
    }
  }
  return 'The search did not work. Try again.'
}

function addErrorMessage(error: unknown): string {
  if (error instanceof GraphRequestError) {
    if (error.status === 409) return 'Your graph is full: it holds up to 50 songs. Remove one to add another.'
    if (error.status === 404) return 'MusicBrainz does not know this recording.'
    if (error.status === 429) return 'Adding is busy right now. Try again in a few seconds.'
    if (error.status === 503) return 'MusicBrainz is not answering right now. Try again in a few seconds.'
  }
  return 'The song could not be added. Try again.'
}

export function SearchResults({ title, artist }: { title: string; artist: string | undefined }) {
  const search = useRecordingSearch(title, artist)
  const inGraph = useGraphSongIds()
  const heading = artist ? `Results for “${title}” by ${artist}` : `Results for “${title}”`

  return (
    <Box component="section" aria-labelledby="results-heading" aria-busy={search.isPending}>
      <Typography variant="h2" id="results-heading" sx={{ fontSize: '1.25rem', fontWeight: 600 }} gutterBottom>
        {heading}
      </Typography>

      {search.isPending && <LinearProgress aria-label="Searching" />}

      {search.isError && (
        <Alert
          severity="warning"
          action={
            <Button color="inherit" size="small" onClick={() => void search.refetch()}>
              Try again
            </Button>
          }
        >
          {errorMessage(search.error)}
        </Alert>
      )}

      {search.isSuccess && search.data.results.length === 0 && (
        <Typography role="status" color="text.secondary">
          No songs found. Check the spelling, or try fewer words.
        </Typography>
      )}

      {search.isSuccess && search.data.results.length > 0 && (
        <>
          {/* A status region is announced by screen readers when its text changes, without moving focus. */}
          <Typography role="status" color="text.secondary" sx={{ mb: 1 }}>
            {search.data.results.length === 1 ? '1 song found' : `${search.data.results.length} songs found`}
            {search.data.source === 'cache' ? ', from songs Nodeable already knows' : ''}
          </Typography>

          <List aria-label="Search results" disablePadding sx={{ maxWidth: 720 }}>
            {search.data.results.map((result) => (
              <ResultRow key={result.mbid} result={result} inGraph={inGraph.has(result.mbid)} />
            ))}
          </List>
        </>
      )}
    </Box>
  )
}

function ResultRow({ result, inGraph }: { result: Result; inGraph: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const add = useAddSong()
  const versionsId = useId()
  const cached = cachedLabel(result.creditsStatus)
  const count = result.versions.length

  return (
    <ListItem divider disableGutters sx={{ display: 'block', py: 1.5 }}>
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
        <AlbumArt
          seed={result.mbid}
          size={52}
          alt={`Cover of ${result.firstReleaseTitle ?? result.title}`}
          releaseMbid={result.artReleaseMbid}
          releaseGroupMbid={result.artReleaseGroupMbid}
        />
        <Box sx={{ minWidth: 0, flex: 1 }}>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <Typography component="span" sx={{ fontWeight: 600 }}>
          {result.title}
        </Typography>
        <Typography component="span" color="text.secondary" variant="body2">
          {describe(result)}
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', mt: 0.5 }}>
        <Typography variant="caption" color="text.secondary">
          {result.score}% match
        </Typography>
        {cached !== null && <Chip size="small" variant="outlined" label={cached} />}
        <Button
          size="small"
          variant="outlined"
          disabled={inGraph || add.isPending}
          aria-label={inGraph ? `${result.title} is in your graph` : `Add to graph: ${result.title} by ${result.artist}`}
          onClick={() => add.mutate(result.mbid)}
        >
          {inGraph ? 'In your graph' : add.isPending ? 'Adding…' : 'Add to graph'}
        </Button>
        {count > 0 && (
          <Button
            size="small"
            aria-expanded={expanded}
            aria-controls={versionsId}
            onClick={() => setExpanded((open) => !open)}
          >
            {expanded ? 'Hide' : 'Show'} {count} other {count === 1 ? 'version' : 'versions'}
          </Button>
        )}
      </Box>

      {add.isError && (
        <Alert severity="warning" sx={{ mt: 1 }}>
          {addErrorMessage(add.error)}
        </Alert>
      )}
        </Box>
      </Box>

      {count > 0 && (
        <Collapse in={expanded} unmountOnExit id={versionsId}>
          <List aria-label={`Other versions of ${result.title}`} dense disablePadding sx={{ pl: 2, mt: 0.5 }}>
            {result.versions.map((version) => (
              <ListItem key={version.mbid} disableGutters sx={{ display: 'block' }}>
                <Typography component="span" variant="body2">
                  {version.title}
                </Typography>{' '}
                <Chip size="small" label={kindLabels[version.kind]} sx={{ mr: 0.5 }} />
                <Typography component="span" variant="body2" color="text.secondary">
                  {describe(version)}
                  {version.note ? ` — ${version.note}` : ''}
                </Typography>
              </ListItem>
            ))}
          </List>
        </Collapse>
      )}
    </ListItem>
  )
}
