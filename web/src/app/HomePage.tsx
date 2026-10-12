import LinearProgress from '@mui/material/LinearProgress'
import Typography from '@mui/material/Typography'
import { lazy, Suspense } from 'react'
import { useSearchParams } from 'react-router'
import { MIN_QUERY_LENGTH } from '../features/search/useRecordingSearch.ts'

// The results list is not needed for the first paint, which is the search form and the introduction, so its code is a
// separate chunk (ADR 0002: first load stays under 250 KB gzipped). `lazy` expects a module with a default export,
// so the named export is wrapped.
const SearchResults = lazy(() =>
  import('../features/search/SearchResults.tsx').then((module) => ({ default: module.SearchResults })),
)

// The home page is the search and, from the next pull request, the graph (spec section 12).
export function HomePage() {
  const [params] = useSearchParams()
  const title = params.get('q')?.trim() ?? ''
  const artist = params.get('artist')?.trim() || undefined

  return (
    <>
      <Typography variant="h1" gutterBottom>
        Nodeable
      </Typography>

      {title.length >= MIN_QUERY_LENGTH ? (
        <Suspense fallback={<LinearProgress aria-label="Loading results" />}>
          <SearchResults title={title} artist={artist} />
        </Suspense>
      ) : (
        <Typography color="text.secondary">
          Discover music through the people who made it. Search for a song to see who produced and wrote it.
        </Typography>
      )}
    </>
  )
}
