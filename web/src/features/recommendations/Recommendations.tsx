import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Heading } from '../connectors/ConnectorCards.tsx'
import type { GraphSnapshot } from '../graph/graphEvents.ts'
import type { GraphSession } from '../graph/graphSession.ts'
import { useAddSong } from '../graph/useGraphMutations.ts'
import { fetchRecommendations } from './recommendationsApi.ts'

interface RecommendationsProps {
  session: GraphSession
  snapshot: GraphSnapshot
}

/**
 * Recommendations (FR-REC-01, FR-REC-02): songs Nodeable already holds that the graph's hubs are credited on, with the
 * reason in words. The Api reads the stored credits only, so nothing here waits on MusicBrainz.
 *
 * The list is read again when the songs or the hubs change, and not otherwise: a recommendation depends on nothing else.
 */
export function Recommendations({ session, snapshot }: RecommendationsProps) {
  const addSong = useAddSong()
  const hasHubs = snapshot.hubs.length > 0

  // LEARN: LG-04 query-key-as-input | The query key is the list of inputs the answer depends on (the graph, its songs, its hubs): when one changes the key changes, TanStack Query fetches again and keeps showing the old list meanwhile, which is what a useEffect with a dependency array and a loading flag would do by hand
  const inputs = `${snapshot.songs.map((song) => song.mbid).sort().join(',')}|${snapshot.hubs.map((hub) => `${hub.personMbid}:${hub.songs}`).join(',')}`
  const recommendations = useQuery({
    queryKey: ['recommendations', session.id, inputs],
    queryFn: ({ signal }) => fetchRecommendations(session, signal),
    enabled: hasHubs,
    placeholderData: keepPreviousData,
    retry: false,
  })

  const items = hasHubs ? (recommendations.data ?? []) : []

  return (
    <Box component="section" aria-labelledby="recommendations-heading">
      <Heading id="recommendations-heading">Recommended</Heading>

      {recommendations.isError ? (
        <Typography color="text.secondary" sx={{ fontSize: 13.5 }}>
          Recommendations are not available right now. Try again in a minute.
        </Typography>
      ) : items.length === 0 ? (
        <Typography color="text.secondary" sx={{ fontSize: 13.5 }}>
          {hasHubs
            ? 'Nothing to suggest yet. Songs appear here once Nodeable has stored more of what your connectors worked on.'
            : 'Suggestions come from people credited on more than one of your songs. None yet.'}
        </Typography>
      ) : (
        <Box component="ul" sx={{ display: 'grid', gap: 1, listStyle: 'none', m: 0, p: 0 }}>
          {items.map((item) => (
            <Box
              component="li"
              key={item.mbid}
              sx={(theme) => ({
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) auto',
                alignItems: 'center',
                gap: 1.5,
                p: 1.25,
                border: `1px solid ${theme.vars.palette.lineStrong}`,
                borderRadius: 1,
              })}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontWeight: 600, fontSize: 14.5 }}>
                  {item.title}
                  <Typography component="span" color="text.secondary" sx={{ fontSize: 13.5, fontWeight: 400 }}>
                    {` · ${item.artist}${item.year === null || item.year === undefined ? '' : ` · ${item.year}`}`}
                  </Typography>
                </Typography>
                <Typography color="text.secondary" sx={{ fontSize: 13 }}>
                  {item.reason}
                </Typography>
              </Box>
              <Button
                size="small"
                variant="outlined"
                disabled={addSong.isPending}
                onClick={() => addSong.mutate(item.mbid)}
                aria-label={`Add ${item.title} to your graph`}
              >
                Add
              </Button>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  )
}
