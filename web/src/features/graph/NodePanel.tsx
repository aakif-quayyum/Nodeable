import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Link from '@mui/material/Link'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import type { GraphSnapshot, SongStatus } from './graphEvents.ts'
import type { DerivedGraph } from './graphModel.ts'
import { RoleChip } from './RoleChip.tsx'

const statusText: Record<SongStatus, string> = {
  loading: 'Fetching credits',
  complete: 'Credits complete',
  partial: 'Some credits',
  none: 'No credits found',
}

/**
 * The details of the node that was clicked, from the graph's own data only: no request is made here (the richer,
 * fetched person drawer is M4's). It is a labelled region the person can reach with the keyboard by tabbing past the
 * canvas, and closing it returns the canvas to its resting state.
 */
export function NodePanel({
  graph,
  snapshot,
  selectedId,
  onClose,
}: {
  graph: DerivedGraph
  snapshot: GraphSnapshot
  selectedId: string | null
  onClose: () => void
}) {
  const node = selectedId === null ? undefined : graph.nodes.find((candidate) => candidate.id === selectedId)
  if (node === undefined) return null

  const songTitle = (mbid: string) => snapshot.songs.find((song) => song.mbid === mbid)?.title ?? 'Unknown song'
  const personName = (mbid: string) => snapshot.people.find((person) => person.mbid === mbid)?.name ?? 'Unknown person'

  return (
    <Paper
      component="section"
      variant="outlined"
      aria-label={`Details: ${node.kind === 'song' ? node.title : node.name}`}
      sx={{ p: 2, mt: 1 }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: 'start' }}>
        {node.kind === 'song' ? (
          <Box>
            <Typography variant="h3" sx={{ fontSize: '1.1rem', fontWeight: 600 }}>
              {node.title}
            </Typography>
            <Typography color="text.secondary" variant="body2">
              {node.artist}
              {node.year === null ? '' : ` · ${node.year}`} · {statusText[node.status]}
            </Typography>
          </Box>
        ) : (
          <Box>
            <Typography variant="h3" sx={{ fontSize: '1.1rem', fontWeight: 600 }}>
              {node.name}
            </Typography>
            <Typography color="text.secondary" variant="body2">
              Credited on {node.songs} {node.songs === 1 ? 'song' : 'songs'} in your graph
              {node.isHub ? ' · a hub' : ''}
            </Typography>
          </Box>
        )}
        <Button size="small" color="inherit" onClick={onClose}>
          Close
        </Button>
      </Box>

      {node.kind === 'person' ? (
        <>
          <Box component="ul" sx={{ listStyle: 'none', m: 0, mt: 1, p: 0, display: 'grid', gap: 0.75 }}>
            {graph.links
              .filter((link) => link.target === node.id)
              .map((link) => {
                const songMbid = link.source.replace('song:', '')
                return (
                  <Box component="li" key={link.id} sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                    <Typography variant="body2">{songTitle(songMbid)}</Typography>
                    {snapshot.credits
                      .filter((credit) => credit.songMbid === songMbid && credit.personMbid === node.mbid)
                      .map((credit) => (
                        <RoleChip key={`${credit.role}|${credit.detail}`} role={credit.role} detail={credit.detail} />
                      ))}
                  </Box>
                )
              })}
          </Box>
          <Link
            href={`https://musicbrainz.org/artist/${node.mbid}`}
            target="_blank"
            rel="noopener noreferrer"
            variant="body2"
            sx={{ display: 'inline-block', mt: 1 }}
            aria-label={`${node.name} on MusicBrainz (opens in a new tab)`}
          >
            MusicBrainz
          </Link>
        </>
      ) : (
        <Box component="ul" sx={{ listStyle: 'none', m: 0, mt: 1, p: 0, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
          {snapshot.credits
            .filter((credit) => credit.songMbid === node.mbid)
            .map((credit) => (
              <li key={`${credit.personMbid}|${credit.role}|${credit.detail}`}>
                <RoleChip role={credit.role} detail={credit.detail} prefix={personName(credit.personMbid)} />
              </li>
            ))}
        </Box>
      )}
    </Paper>
  )
}
