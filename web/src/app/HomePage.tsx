import Box from '@mui/material/Box'
import LinearProgress from '@mui/material/LinearProgress'
import Typography from '@mui/material/Typography'
import { lazy, Suspense } from 'react'
import { useSearchParams } from 'react-router'
import { useGraphSession } from '../features/graph/graphSession.ts'
import { MIN_QUERY_LENGTH } from '../features/search/useRecordingSearch.ts'

// The results list is not needed for the first paint, which is the search form and the introduction, so its code is a
// separate chunk (ADR 0002: first load stays under 250 KB gzipped). `lazy` expects a module with a default export,
// so the named export is wrapped.
const SearchResults = lazy(() =>
  import('../features/search/SearchResults.tsx').then((module) => ({ default: module.SearchResults })),
)

// The graph is lazy for the same reason, and it also carries SignalR: a first-time visitor never downloads either.
const GraphView = lazy(() => import('../features/graph/GraphView.tsx').then((module) => ({ default: module.GraphView })))

// The home page is the search and the graph (spec section 12).
export function HomePage() {
  const [params] = useSearchParams()
  const title = params.get('q')?.trim() ?? ''
  const artist = params.get('artist')?.trim() || undefined
  const session = useGraphSession()

  const searching = title.length >= MIN_QUERY_LENGTH

  return (
    <>
      <Typography variant='h1' gutterBottom>
        Nodeable
      </Typography>

      {!searching && session === null && (
        <Typography color='text.secondary'>
          Discover music through the people who made it. Search for a song to see who produced and wrote it.
        </Typography>
      )}

      {/* Results and graph sit side by side on a wide screen and stack on a narrow one. The graph is the destination:
          it stays on the page while the person searches for the next song. */}
      <Box
        sx={{
          display: 'grid',
          gap: 4,
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: session !== null && searching ? 'minmax(0, 5fr) minmax(0, 7fr)' : 'minmax(0, 1fr)' },
          alignItems: 'start',
        }}
      >
        {searching && (
          <Suspense fallback={<LinearProgress aria-label='Loading results' />}>
            <SearchResults title={title} artist={artist} />
          </Suspense>
        )}

        {session !== null && (
          <Suspense fallback={<LinearProgress aria-label='Loading your graph' />}>
            <GraphView session={session} />
          </Suspense>
        )}
      </Box>
    </>
  )
}
