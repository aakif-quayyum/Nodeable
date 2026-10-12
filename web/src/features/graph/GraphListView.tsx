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
import { useId, useMemo, useState } from 'react'
import { hasIncompleteCredits, type GraphCredit, type GraphSnapshot, type GraphSong } from './graphEvents.ts'
import { RoleChip } from './RoleChip.tsx'

const creditsShownAtFirst = 8

interface PersonRow {
  mbid: string
  name: string
  songs: number
  credits: GraphCredit[]
}

function peopleOf(snapshot: GraphSnapshot): PersonRow[] {
  const songIds = new Set(snapshot.songs.map((song) => song.mbid))
  const names = new Map(snapshot.people.map((person) => [person.mbid, person.name]))
  const byPerson = new Map<string, GraphCredit[]>()

  // Only credits of songs that are in the graph count: a credit for a song that was removed must not make a hub.
  for (const credit of snapshot.credits) {
    if (!songIds.has(credit.songMbid)) continue
    const list = byPerson.get(credit.personMbid)
    if (list === undefined) byPerson.set(credit.personMbid, [credit])
    else list.push(credit)
  }

  return [...byPerson].map(([mbid, credits]) => ({
    mbid,
    name: names.get(mbid) ?? 'Unknown person',
    songs: new Set(credits.map((credit) => credit.songMbid)).size,
    credits,
  }))
}

function sortPeople(people: PersonRow[]): PersonRow[] {
  return [...people].sort((a, b) => b.songs - a.songs || a.name.localeCompare(b.name))
}

/** The distinct (role, detail) pairs of a list of credits, in the order they first appear. */
function distinctRoles(credits: readonly GraphCredit[]) {
  const seen = new Map<string, GraphCredit>()
  for (const credit of credits) {
    const key = `${credit.role}|${credit.detail}`
    if (!seen.has(key)) seen.set(key, credit)
  }
  return [...seen.values()]
}

interface GraphListViewProps {
  snapshot: GraphSnapshot
  /** Why a song's credits could not be fetched, by song MBID. */
  failures: Readonly<Record<string, string>>
  onRemove: (song: GraphSong) => void
  /** The MBID of the song being removed, so its button can say so. */
  removing: string | null
}

/**
 * The accessible version of the graph (NFR-A11Y-01): the same songs, people and credits as the canvas, as two real
 * tables that a keyboard and a screen reader can move through. It does not use D3.
 */
export function GraphListView({ snapshot, failures, onRemove, removing }: GraphListViewProps) {
  const people = useMemo(() => sortPeople(peopleOf(snapshot)), [snapshot])
  const names = useMemo(() => new Map(snapshot.people.map((person) => [person.mbid, person.name])), [snapshot.people])

  return (
    <Box sx={{ display: 'grid', gap: 3 }}>
      <TableContainer>
        {/* A table's accessible name is its caption, so a screen reader announces "Songs and their credits, table". */}
        <Table size="small">
          <Box component="caption" sx={{ textAlign: 'left', py: 1, fontWeight: 600 }}>
            Songs and their credits
          </Box>
          <TableHead>
            <TableRow>
              <TableCell scope="col">Song</TableCell>
              <TableCell scope="col">Credits</TableCell>
              <TableCell scope="col">Status</TableCell>
              <TableCell scope="col">
                <Box component="span" sx={visuallyHidden}>
                  Actions
                </Box>
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {snapshot.songs.map((song) => (
              <SongRow
                key={song.mbid}
                song={song}
                snapshot={snapshot}
                names={names}
                failure={failures[song.mbid]}
                removing={removing === song.mbid}
                onRemove={onRemove}
              />
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {people.length > 0 && (
        <TableContainer>
          <Table size="small">
            <Box component="caption" sx={{ textAlign: 'left', py: 1, fontWeight: 600 }}>
              People, most songs first
            </Box>
            <TableHead>
              <TableRow>
                <TableCell scope="col">Person</TableCell>
                <TableCell scope="col" align="right">
                  Songs
                </TableCell>
                <TableCell scope="col">Roles</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {people.map((person) => (
                <TableRow key={person.mbid}>
                  <TableCell component="th" scope="row">
                    {person.name}
                    {person.songs >= 2 && <Chip size="small" color="secondary" label="Hub" sx={{ ml: 1 }} />}
                  </TableCell>
                  <TableCell align="right">{person.songs}</TableCell>
                  <TableCell>
                    <Box component="ul" sx={chipListSx}>
                      {distinctRoles(person.credits).map((credit) => (
                        <li key={`${credit.role}|${credit.detail}`}>
                          <RoleChip role={credit.role} detail={credit.detail} />
                        </li>
                      ))}
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  )
}

function SongRow({
  song,
  snapshot,
  names,
  failure,
  removing,
  onRemove,
}: {
  song: GraphSong
  snapshot: GraphSnapshot
  names: ReadonlyMap<string, string>
  failure: string | undefined
  removing: boolean
  onRemove: (song: GraphSong) => void
}) {
  const [showAll, setShowAll] = useState(false)
  const creditsId = useId()
  const credits = snapshot.credits.filter((credit) => credit.songMbid === song.mbid)
  const shown = showAll ? credits : credits.slice(0, creditsShownAtFirst)
  const nameOf = (mbid: string) => names.get(mbid) ?? 'Unknown person'
  const incomplete = hasIncompleteCredits(snapshot, song)

  return (
    <TableRow>
      <TableCell component="th" scope="row" sx={{ verticalAlign: 'top' }}>
        <Typography component="span" sx={{ fontWeight: 600 }}>
          {song.title}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {song.artist}
          {song.year === null ? '' : ` · ${song.year}`}
        </Typography>
      </TableCell>

      <TableCell sx={{ verticalAlign: 'top' }}>
        {credits.length === 0 ? (
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
            {credits.length > creditsShownAtFirst && (
              <Button
                size="small"
                aria-expanded={showAll}
                aria-controls={creditsId}
                onClick={() => setShowAll((open) => !open)}
              >
                {showAll ? 'Show fewer credits' : `Show all ${credits.length} credits`}
              </Button>
            )}
          </>
        )}
      </TableCell>

      <TableCell sx={{ verticalAlign: 'top' }}>
        <SongStatus song={song} incomplete={incomplete} failure={failure} />
      </TableCell>

      <TableCell sx={{ verticalAlign: 'top' }}>
        <Button
          size="small"
          color="inherit"
          disabled={removing}
          aria-label={`Remove ${song.title} by ${song.artist} from your graph`}
          onClick={() => onRemove(song)}
        >
          Remove
        </Button>
      </TableCell>
    </TableRow>
  )
}

function SongStatus({ song, incomplete, failure }: { song: GraphSong; incomplete: boolean; failure: string | undefined }) {
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
      {incomplete ? (
        <>
          <Chip size="small" color="warning" variant="outlined" label="Credits incomplete" />
          <Link
            href={`https://musicbrainz.org/recording/${song.mbid}`}
            target="_blank"
            rel="noopener noreferrer"
            variant="body2"
            // The visible words are the start of the name (WCAG 2.5.3); the rest says which song, and that it opens a tab.
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

const chipListSx = { display: 'flex', flexWrap: 'wrap', gap: 0.5, listStyle: 'none', m: 0, p: 0 } as const

// Hidden from the eyes, still read by screen readers: the standard "visually hidden" recipe.
const visuallyHidden = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
} as const
