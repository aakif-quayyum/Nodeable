import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import LinearProgress from '@mui/material/LinearProgress'
import Typography from '@mui/material/Typography'
import { lazy, Suspense } from 'react'
import { useLocation, useSearchParams } from 'react-router'
import { SearchForm } from './SearchForm.tsx'
import { useAddSheet } from './addSheet.ts'
import { MIN_QUERY_LENGTH } from './useRecordingSearch.ts'

const SearchResults = lazy(() => import('./SearchResults.tsx').then((module) => ({ default: module.SearchResults })))

/**
 * Adding a song from inside the app (FR-SEARCH-01, FR-SEARCH-02): a dialog with the search and its results, opened
 * from the header. MUI's Dialog traps focus, returns it to the button that opened it and closes on Escape, so none of
 * that is rebuilt here.
 */
export function SearchSheet() {
  const { open, closeSheet } = useAddSheet()
  const { pathname } = useLocation()
  const [params] = useSearchParams()

  const title = params.get('q')?.trim() ?? ''
  const artist = params.get('artist')?.trim() || undefined
  const searching = title.length >= MIN_QUERY_LENGTH

  return (
    <Dialog
      open={open}
      onClose={closeSheet}
      fullWidth
      maxWidth="sm"
      aria-labelledby="add-song-heading"
      slotProps={{ paper: { sx: { alignSelf: 'flex-start', mt: { xs: 2, sm: '6vh' }, width: '100%', maxWidth: 700 } } }}
    >
      <DialogContent sx={{ p: { xs: 2, sm: 3 } }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1.5, mb: 2 }}>
          <Typography id="add-song-heading" variant="h2" component="h2">
            Add a song
          </Typography>
          <Button variant="outlined" onClick={closeSheet}>
            Close
          </Button>
        </Box>

        <SearchForm pathname={pathname} keep={{ sheet: 'add' }} />

        {searching && (
          <Box sx={{ mt: 2.5 }}>
            <Suspense fallback={<LinearProgress aria-label="Loading results" />}>
              <SearchResults title={title} artist={artist} onAdded={closeSheet} onShowInGraph={closeSheet} />
            </Suspense>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  )
}
