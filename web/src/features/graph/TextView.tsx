import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Link from '@mui/material/Link'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { useId, useState } from 'react'
import { AlbumArt } from '../art/AlbumArt.tsx'
import type { GraphCredit } from './graphEvents.ts'
import { RoleChip } from './RoleChip.tsx'
import type { Workspace, WorkspaceSong } from './workspaceModel.ts'

const creditsShownAtFirst = 8
/** People are listed this many at a time past the connectors, so 700 people are never 700 rows at once. */
export const peoplePageSize = 100

/** The distinct (role, detail) pairs of a list of credits, in the order they first appear. */
function distinctRoles(credits: readonly GraphCredit[]) {
  const seen = new Map<string, GraphCredit>()
  for (const credit of credits) {
    const key = `${credit.role}|${credit.detail}`
    if (!seen.has(key)) seen.set(key, credit)
  }
  return [...seen.values()]
}

interface TextViewProps {
  workspace: Workspace
  /** Why a song's credits could not be fetched, by song MBID. */
  failures: Readonly<Record<string, string>>
  /** Whether the people past the connectors are listed (the "+N more" node turns this on). */
  peopleExpanded: boolean
  onExpandPeople: () => void
  onRemove: (song: WorkspaceSong) => void
  onHide: (personMbid: string) => void
}

/**
 * The accessible version of the graph (NFR-A11Y-01): the same songs, people and credits as the orbit, with the same role
 * filters and the same hidden people, as two real tables that a keyboard and a screen reader can move through. It
 * carries "Remove from graph" and "Hide from view" for every row, so nothing can only be done on a drawing. It uses no D3.
 */
export function TextView({ workspace, failures, peopleExpanded, onExpandPeople, onRemove, onHide }: TextViewProps) {
  const [extra, setExtra] = useState(peoplePageSize)
  const connectors = workspace.connectors
  const others = workspace.people.slice(connectors.length)
  const shownOthers = peopleExpanded ? others.slice(0, extra) : []

  return (
    <Box sx={{ display: 'grid', gap: 3 }}>
      <TableContainer>
        {/* A table's accessible name is its caption, so a screen reader announces "Songs and their credits, table". */}
        <Table size="small" sx={tableSx}>
          <caption>Songs and their credits</caption>
          <TableHead>
            <TableRow>
              <TableCell scope="col">Song</TableCell>
              <TableCell scope="col">Credits</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {workspace.songs.map((song) => (
              <SongRow key={song.mbid} song={song} workspace={workspace} failure={failures[song.mbid]} onRemove={onRemove} />
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {workspace.people.length > 0 && (
        <Box>
          <TableContainer>
            <Table size="small" sx={tableSx}>
              <caption>
                {peopleExpanded || others.length === 0
                  ? 'People, most songs first'
                  : `Connectors, most songs first (${connectors.length} of ${workspace.people.length} people)`}
              </caption>
              <TableHead>
                <TableRow>
                  <TableCell scope="col">Person</TableCell>
                  <TableCell scope="col" align="right">
                    Songs
                  </TableCell>
                  <TableCell scope="col">Roles</TableCell>
                  <TableCell scope="col">
                    <span style={visuallyHidden}>Actions</span>
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {[...connectors, ...shownOthers].map((person) => (
                  <TableRow key={person.mbid}>
                    <TableCell component="th" scope="row">
                      {person.name}
                      {person.songs.length >= 2 && <Chip size="small" color="secondary" label="Connector" sx={{ ml: 1 }} />}
                    </TableCell>
                    <TableCell align="right">{person.songs.length}</TableCell>
                    <TableCell>
                      <Box component="ul" sx={chipListSx}>
                        {distinctRoles(person.credits).map((credit) => (
                          <li key={`${credit.role}|${credit.detail}`}>
                            <RoleChip role={credit.role} detail={credit.detail} />
                          </li>
                        ))}
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Button size="small" color="inherit" onClick={() => onHide(person.mbid)} aria-label={`Hide from view: ${person.name}`} sx={{ whiteSpace: 'nowrap' }}>
                        Hide from view
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {!peopleExpanded && others.length > 0 && (
            <Button size="small" onClick={onExpandPeople} sx={{ mt: 1 }}>
              Show all {workspace.people.length} people
            </Button>
          )}
          {peopleExpanded && others.length > shownOthers.length && (
            <Button size="small" onClick={() => setExtra((count) => count + peoplePageSize)} sx={{ mt: 1 }}>
              Show {Math.min(peoplePageSize, others.length - shownOthers.length)} more of {others.length - shownOthers.length} people
            </Button>
          )}
        </Box>
      )}
    </Box>
  )
}

function SongRow({
  song,
  workspace,
  failure,
  onRemove,
}: {
  song: WorkspaceSong
  workspace: Workspace
  failure: string | undefined
  onRemove: (song: WorkspaceSong) => void
}) {
  const [showAll, setShowAll] = useState(false)
  const creditsId = useId()
  const shown = showAll ? song.credits : song.credits.slice(0, creditsShownAtFirst)
  const nameOf = (mbid: string) => workspace.personById.get(mbid)?.name ?? 'Unknown person'

  return (
    <TableRow>
      <TableCell component="th" scope="row" sx={{ verticalAlign: 'top' }}>
        <Box sx={{ mb: 0.75 }}>
          <AlbumArt seed={song.mbid} size={44} alt={`Cover of ${song.title}`} releaseMbid={song.artReleaseMbid} releaseGroupMbid={song.artReleaseGroupMbid} />
        </Box>
        <Typography component="span" sx={{ fontWeight: 600 }}>
          {song.title}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {song.artist}
          {song.year === null ? '' : ` · ${song.year}`}
        </Typography>

        <Box sx={{ mt: 1 }}>
          <SongStatus song={song} failure={failure} />
        </Box>
        <Button
          size="small"
          color="inherit"
          aria-label={`Remove from graph: ${song.title} by ${song.artist}`}
          onClick={() => onRemove(song)}
          sx={{ mt: 0.5, ml: -1 }}
        >
          Remove from graph
        </Button>
      </TableCell>

      <TableCell sx={{ verticalAlign: 'top' }}>
        {song.credits.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            {song.creditsStatus === 'loading' ? 'Credits are being fetched.' : 'No credits found.'}
          </Typography>
        ) : (
          <>
            <Box component="ul" id={creditsId} sx={chipListSx} aria-label={`Credits for ${song.title}`}>
              {shown.map((credit) => (
                <li key={`${credit.personMbid}|${credit.role}|${credit.detail}`}>
                  <RoleChip role={credit.role} detail={credit.detail} prefix={nameOf(credit.personMbid)} />
                </li>
              ))}
            </Box>
            {song.credits.length > creditsShownAtFirst && (
              <Button size="small" aria-expanded={showAll} aria-controls={creditsId} onClick={() => setShowAll((open) => !open)}>
                {showAll ? 'Show fewer credits' : `Show all ${song.credits.length} credits`}
              </Button>
            )}
          </>
        )}
      </TableCell>
    </TableRow>
  )
}

function SongStatus({ song, failure }: { song: WorkspaceSong; failure: string | undefined }) {
  if (song.creditsStatus === 'loading') {
    return (
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
        <CircularProgress size={16} aria-hidden />
        <Typography variant="body2">Fetching credits…</Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ display: 'grid', gap: 0.5, justifyItems: 'start' }}>
      {failure !== undefined && (
        <Typography variant="body2" color="warning.main">
          {failure}
        </Typography>
      )}
      {song.incomplete ? (
        <>
          <Chip size="small" color="warning" variant="outlined" label="Credits incomplete" />
          <Link
            href={`https://musicbrainz.org/recording/${song.mbid}`}
            target="_blank"
            rel="noopener noreferrer"
            variant="body2"
            aria-label={`Add credits on MusicBrainz for ${song.title} (opens in a new tab)`}
          >
            Add credits on MusicBrainz
          </Link>
        </>
      ) : (
        <Typography variant="body2" color="text.secondary">
          {song.creditsStatus === 'complete' ? 'Credits complete' : 'Some credits'}
        </Typography>
      )}
    </Box>
  )
}

// MUI styles a table's caption small, grey and below the table; here it names the table, so it is shown above it.
const tableSx = {
  '& caption': { captionSide: 'top', color: 'text.primary', fontSize: '1rem', fontWeight: 600, px: 0 },
} as const

const chipListSx = { display: 'flex', flexWrap: 'wrap', gap: 0.5, listStyle: 'none', m: 0, p: 0 } as const

const visuallyHidden = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' } as const
