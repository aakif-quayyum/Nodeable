import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import LinearProgress from '@mui/material/LinearProgress'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import Typography from '@mui/material/Typography'
import { keyframes } from '@mui/material/styles'
import { useEffect, useId, useState } from 'react'
import type { components } from '../../api/schema'
import { useReducedMotion } from '../../motion/useReducedMotion.ts'
import { AlbumArt } from '../art/AlbumArt.tsx'
import { Sleeve } from '../art/Sleeve.tsx'
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

const recordingKindLabels = { remix: 'Remix', edit: 'Edit', bootleg: 'Bootleg', mixtape: 'Mixtape' } as const

// The animations of the list (NFR-MOTION-01): everything moves with transform and opacity only, and the whole block
// is behind `no-preference`, so a person who asked for less motion gets the end state at once, live.
const rise = keyframes`from { opacity: 0; transform: translateY(12px); }`
const riseSide = keyframes`from { opacity: 0; transform: translateX(-8px); }`
const level = keyframes`from { transform: scaleY(0.05); }`
const pop = keyframes`40% { transform: scale(1.12); }`

// LEARN: LG-03R reduced-motion-css | Putting every animation inside `prefers-reduced-motion: no-preference` makes the still version the default and the motion the opt-in, and the browser re-evaluates the query itself, so a person who switches the setting while the page is open gets the end state at once with no JavaScript
const motionOnly = (css: Record<string, unknown>) => ({ '@media (prefers-reduced-motion: no-preference)': css })

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

interface SearchResultsProps {
  title: string
  artist: string | undefined
  /** Called a moment after a song was added (long enough for the button's pop): the landing page opens the graph. */
  onAdded?: () => void
  /** Called when the person chooses a song that is already in the graph. */
  onShowInGraph?: () => void
  /** Whether to read the graph's songs from the server when they are not loaded yet (the landing page has no graph on screen). */
  loadGraphSongs?: boolean
}

export function SearchResults({ title, artist, onAdded, onShowInGraph, loadGraphSongs = false }: SearchResultsProps) {
  const search = useRecordingSearch(title, artist)
  const inGraph = useGraphSongIds(loadGraphSongs)
  const heading = artist ? `Results for “${title}” by ${artist}` : `Results for “${title}”`

  return (
    <Box component="section" aria-labelledby="results-heading" aria-busy={search.isPending}>
      <Typography
        variant="h3"
        component="h2"
        id="results-heading"
        sx={{ pb: 1.25, mb: 1, borderBottom: 1, borderColor: 'divider' }}
      >
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
          <Typography role="status" variant="kicker" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
            {search.data.results.length === 1 ? '1 song found' : `${search.data.results.length} songs found`}
            {search.data.source === 'cache' ? ', from songs Nodeable already knows' : ''}
          </Typography>

          <List aria-label="Search results" disablePadding>
            {search.data.results.map((result, index) => (
              <ResultRow
                key={result.mbid}
                result={result}
                index={index}
                inGraph={inGraph.has(result.mbid)}
                onAdded={onAdded}
                onShowInGraph={onShowInGraph}
              />
            ))}
          </List>
        </>
      )}
    </Box>
  )
}

/** The match score as six small bars: a glance, with the number beside it as text so the bars carry no fact alone. */
function MatchMeter({ score }: { score: number }) {
  const on = Math.round((score / 100) * 6)

  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.9 }}>
      <Box aria-hidden sx={{ display: 'inline-flex', gap: '2px', alignItems: 'flex-end', height: 14 }}>
        {[5, 7, 9, 11, 13, 15].map((height, bar) => (
          <Box
            key={height}
            component="i"
            sx={(theme) => ({
              width: 4,
              height,
              display: 'block',
              transformOrigin: 'bottom',
              backgroundColor: bar < on ? (bar >= 4 ? theme.vars.palette.secondary.main : theme.vars.palette.success.main) : theme.vars.palette.divider,
              ...motionOnly({ animation: `${level} 500ms cubic-bezier(0.2, 0.8, 0.2, 1) both`, animationDelay: `${bar * 45 + 120}ms` }),
            })}
          />
        ))}
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
        {score}% match
      </Typography>
    </Box>
  )
}

function ResultRow({
  result,
  index,
  inGraph,
  onAdded,
  onShowInGraph,
}: {
  result: Result
  index: number
  inGraph: boolean
  onAdded: (() => void) | undefined
  onShowInGraph: (() => void) | undefined
}) {
  const [expanded, setExpanded] = useState(false)
  const add = useAddSong()
  const reduced = useReducedMotion()
  const versionsId = useId()
  const cached = cachedLabel(result.creditsStatus)
  const count = result.versions.length

  // A moment after the song is added, long enough for the button's pop to be seen, the page moves on.
  useEffect(() => {
    if (!add.isSuccess || onAdded === undefined) return
    const timer = setTimeout(onAdded, reduced ? 0 : 420)
    return () => clearTimeout(timer)
  }, [add.isSuccess, onAdded, reduced])

  return (
    <ListItem
      disableGutters
      sx={(theme) => ({
        display: 'grid',
        gridTemplateColumns: '52px minmax(0, 1fr) auto',
        columnGap: 1.75,
        alignItems: 'center',
        py: 1.5,
        borderBottom: `1px solid ${theme.vars.palette.divider}`,
        ...motionOnly({ animation: `${rise} 500ms cubic-bezier(0.2, 0.8, 0.2, 1) both`, animationDelay: `${index * 55}ms` }),
      })}
    >
      <AlbumArt
        seed={result.mbid}
        size={52}
        alt={`Cover of ${result.firstReleaseTitle ?? result.title}`}
        releaseMbid={result.artReleaseMbid}
        releaseGroupMbid={result.artReleaseGroupMbid}
      />

      <Box sx={{ minWidth: 0 }}>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          <Typography component="span" sx={{ fontWeight: 700, fontSize: '1.03rem', lineHeight: 1.2 }}>
            {result.title}
          </Typography>
          {result.kind != null && (
            <Chip size="small" label={recordingKindLabels[result.kind]} sx={(theme) => ({ height: 20, backgroundColor: theme.vars.palette.raised, fontFamily: theme.typography.kicker.fontFamily, letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: 10 })} />
          )}
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
          {describe(result)}
        </Typography>

        <Box sx={{ display: 'flex', gap: 1.75, alignItems: 'center', flexWrap: 'wrap', mt: 0.75 }}>
          <MatchMeter score={result.score} />
          {cached !== null && <Chip size="small" variant="outlined" label={cached} />}
          {count > 0 && (
            <Button
              size="small"
              color="inherit"
              aria-expanded={expanded}
              aria-controls={versionsId}
              onClick={() => setExpanded((open) => !open)}
              sx={{ gap: 0.75, color: 'text.secondary', fontWeight: 600 }}
              startIcon={
                // The stack of mini sleeves hints that these are other copies; it is decoration, drawn locally with no requests.
                <Box aria-hidden sx={{ display: 'inline-flex' }}>
                  {result.versions.slice(0, 4).map((version, at) => (
                    <Box key={version.mbid} sx={(theme) => ({ ml: at === 0 ? 0 : '-5px', boxShadow: `0 0 0 1.5px ${theme.vars.palette.background.default}`, borderRadius: '3px', overflow: 'hidden', display: 'flex' })}>
                      <Sleeve seed={version.mbid} size={14} />
                    </Box>
                  ))}
                </Box>
              }
            >
              {expanded ? 'Hide' : 'Show'} {count} other {count === 1 ? 'version' : 'versions'}
            </Button>
          )}
        </Box>
      </Box>

      <Box>
        {inGraph ? (
          <Button
            size="small"
            variant="text"
            color="success"
            aria-label={`${result.title} is in your graph`}
            onClick={onShowInGraph}
            sx={{ fontFamily: 'inherit', fontWeight: 700, whiteSpace: 'nowrap' }}
          >
            ✓ In your graph
          </Button>
        ) : (
          <Button
            size="small"
            variant={add.isSuccess ? 'contained' : 'outlined'}
            color={add.isSuccess ? 'success' : 'primary'}
            disabled={add.isPending || add.isSuccess}
            aria-label={add.isSuccess ? `${result.title} added` : `Add to graph: ${result.title} by ${result.artist}`}
            onClick={() => add.mutate(result.mbid)}
            sx={{ whiteSpace: 'nowrap', ...(add.isSuccess ? motionOnly({ animation: `${pop} 400ms cubic-bezier(0.2, 0.8, 0.2, 1)` }) : {}) }}
          >
            {add.isSuccess ? '✓ Added' : add.isPending ? 'Adding…' : 'Add to graph'}
          </Button>
        )}
      </Box>

      {add.isError && (
        <Alert severity="warning" sx={{ gridColumn: '1 / -1', mt: 1 }}>
          {addErrorMessage(add.error)}
        </Alert>
      )}

      {/* The versions are revealed at once and their rows rise in with a stagger: only opacity and transform move. */}
      {expanded && count > 0 && (
        <List id={versionsId} aria-label={`Other versions of ${result.title}`} dense disablePadding sx={{ gridColumn: '1 / -1', pl: 8.25, mt: 0.5 }}>
          {result.versions.map((version, at) => (
            <ListItem
              key={version.mbid}
              disableGutters
              sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', ...motionOnly({ animation: `${riseSide} 300ms cubic-bezier(0.2, 0.8, 0.2, 1) both`, animationDelay: `${at * 50 + 100}ms` }) }}
            >
              <Sleeve seed={version.mbid} size={20} />
              <Typography component="span" variant="body2">
                {version.title}
              </Typography>
              <Chip size="small" label={kindLabels[version.kind]} />
              <Typography component="span" variant="body2" color="text.secondary">
                {describe(version)}
                {version.note ? ` — ${version.note}` : ''}
              </Typography>
            </ListItem>
          ))}
        </List>
      )}
    </ListItem>
  )
}
