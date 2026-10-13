import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import { useId, useState, type FormEvent } from 'react'
import { createSearchParams, useNavigate, useSearchParams } from 'react-router'
import { MIN_QUERY_LENGTH } from './useRecordingSearch.ts'

/** Suggestions shown under the form on the landing page and in the sheet; choosing one runs the search. */
const trySuggestions: readonly { title: string; artist: string }[] = [
  { title: 'Redbone', artist: 'Childish Gambino' },
  { title: 'Telegraph Ave', artist: 'Childish Gambino' },
  { title: 'Me and Your Mama', artist: 'Childish Gambino' },
]

interface SearchFormProps {
  /** The page the search is put on: the landing page, or the graph with its sheet open. */
  pathname: string
  /** Parameters kept in the address next to the search, such as `sheet=add`. */
  keep?: Readonly<Record<string, string>>
  /** Whether to offer suggestions to try. */
  suggestions?: boolean
}

/**
 * The search form of the landing page and of the add-a-song sheet (FR-SEARCH-01). The search text lives in the
 * address (`?q=Redbone&artist=Childish+Gambino`), not in a store: a search can be shared, bookmarked and repeated with
 * the back button, and the results need nothing else to know what was asked.
 */
export function SearchForm({ pathname, keep = {}, suggestions = true }: SearchFormProps) {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const titleId = useId()
  const artistId = useId()
  const errorId = useId()

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

  function search(nextTitle: string, nextArtist: string) {
    const trimmed = nextTitle.trim()
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setError(`Type at least ${MIN_QUERY_LENGTH} characters of a song title.`)
      return
    }

    setError(null)
    const query = createSearchParams({ ...keep, q: trimmed })
    if (nextArtist.trim() !== '') {
      query.set('artist', nextArtist.trim())
    }
    void navigate({ pathname, search: query.toString() })
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    search(title, artist)
  }

  return (
    <Box>
      {/* role="search" makes this form a search landmark that screen reader users can jump to. */}
      <Box
        component="form"
        role="search"
        aria-label="Search for a song"
        onSubmit={submit}
        noValidate
        sx={(theme) => ({
          display: 'flex',
          flexWrap: 'wrap',
          maxWidth: 640,
          overflow: 'hidden',
          borderRadius: '14px',
          border: `1px solid ${theme.vars.palette.lineStrong}`,
          backgroundColor: theme.vars.palette.background.paper,
          '&:focus-within': { borderColor: theme.vars.palette.text.primary },
        })}
      >
        <Field id={titleId} label="Song title" value={title} onChange={setTitle} invalid={error !== null} describedBy={error ? errorId : undefined} placeholder="Redbone" />
        <Field id={artistId} label="Artist (optional)" value={artist} onChange={setArtist} placeholder="Childish Gambino" divided />
        <Button
          type="submit"
          variant="contained"
          sx={{ flex: '1 1 8rem', minHeight: 58, borderRadius: 0, fontWeight: 800, fontSize: 15, px: 3.25 }}
        >
          Search
        </Button>
      </Box>

      {error !== null && (
        <Typography id={errorId} variant="body2" color="error" sx={{ mt: 1 }}>
          {error}
        </Typography>
      )}

      {suggestions && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center', mt: 1.75 }}>
          <Typography variant="kicker" color="text.secondary" component="span">
            Try
          </Typography>
          {trySuggestions.map((suggestion) => (
            <Button
              key={suggestion.title}
              size="small"
              variant="outlined"
              onClick={() => search(suggestion.title, suggestion.artist)}
              sx={{ borderRadius: 999, py: 0.25, px: 1.5, fontSize: 13 }}
            >
              {suggestion.title}
            </Button>
          ))}
        </Box>
      )}
    </Box>
  )
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  invalid = false,
  describedBy,
  divided = false,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  invalid?: boolean
  describedBy?: string | undefined
  divided?: boolean
}) {
  return (
    // The label wraps its input: the small caption is the accessible name, and a click anywhere in the cell focuses it.
    <Box
      component="label"
      htmlFor={id}
      sx={(theme) => ({
        flex: '1 1 10.5rem',
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        px: 1.75,
        py: 1.25,
        cursor: 'text',
        borderLeft: divided ? `1px solid ${theme.vars.palette.divider}` : 'none',
      })}
    >
      <Typography variant="kicker" color="text.secondary" component="span">
        {label}
      </Typography>
      <Box
        component="input"
        id={id}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        maxLength={200}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onChange={(event: React.ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
        sx={(theme) => ({
          background: 'none',
          border: 0,
          outline: 'none',
          color: theme.vars.palette.text.primary,
          font: 'inherit',
          fontSize: 18,
          fontWeight: 600,
          py: 0.4,
          minWidth: 0,
          '&::placeholder': { color: theme.vars.palette.text.secondary, opacity: 0.6, fontWeight: 500 },
        })}
      />
    </Box>
  )
}
