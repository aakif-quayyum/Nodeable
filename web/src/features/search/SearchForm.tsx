import SearchIcon from '@mui/icons-material/Search'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import { useState, type FormEvent } from 'react'
import { createSearchParams, useNavigate, useSearchParams } from 'react-router'
import { MIN_QUERY_LENGTH } from './useRecordingSearch.ts'

// LEARN: LG-03 url-as-state | The search text lives in the address (useSearchParams), not in a store: a search can be shared, bookmarked and repeated with the back button, and the page reads it like any other input
// The search lives in the address bar (`/?q=Redbone&artist=Childish+Gambino`): a search can be shared, bookmarked and
// repeated with the back button, and the results page needs no store to know what was asked.
export function SearchForm() {
  const [params] = useSearchParams()
  const navigate = useNavigate()

  const urlTitle = params.get('q') ?? ''
  const urlArtist = params.get('artist') ?? ''

  const [title, setTitle] = useState(urlTitle)
  const [artist, setArtist] = useState(urlArtist)
  const [error, setError] = useState<string | null>(null)

  // When the address changes without this form (back and forward), the boxes follow it. React's documented way to
  // derive state from props is to compare during render, which avoids an effect and the extra render it causes.
  const [seen, setSeen] = useState({ urlTitle, urlArtist })
  if (seen.urlTitle !== urlTitle || seen.urlArtist !== urlArtist) {
    setSeen({ urlTitle, urlArtist })
    setTitle(urlTitle)
    setArtist(urlArtist)
    setError(null)
  }

  function submit(event: FormEvent) {
    event.preventDefault()

    const trimmed = title.trim()
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setError(`Type at least ${MIN_QUERY_LENGTH} characters of a song title.`)
      return
    }

    setError(null)
    const query = createSearchParams({ q: trimmed })
    if (artist.trim() !== '') {
      query.set('artist', artist.trim())
    }
    void navigate({ pathname: '/', search: query.toString() })
  }

  return (
    // role="search" makes this form a search landmark that screen reader users can jump to.
    <Box
      component="form"
      role="search"
      aria-label="Search for a song"
      onSubmit={submit}
      noValidate
      sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'flex-start', flexGrow: 1, minWidth: 0 }}
    >
      <TextField
        label="Song title"
        size="small"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        error={error !== null}
        helperText={error}
        slotProps={{ htmlInput: { maxLength: 200 } }}
        sx={{ flex: '2 1 12rem' }}
      />
      <TextField
        label="Artist (optional)"
        size="small"
        value={artist}
        onChange={(event) => setArtist(event.target.value)}
        slotProps={{ htmlInput: { maxLength: 200 } }}
        sx={{ flex: '1 1 10rem' }}
      />
      <Button type="submit" variant="contained" startIcon={<SearchIcon />} sx={{ height: 40 }}>
        Search
      </Button>
    </Box>
  )
}
