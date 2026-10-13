import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Link from '@mui/material/Link'
import LinearProgress from '@mui/material/LinearProgress'
import Typography from '@mui/material/Typography'
import { keyframes } from '@mui/material/styles'
import { lazy, Suspense } from 'react'
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router'
import { useGraphSession } from '../graph/graphSession.ts'
import { SearchForm } from '../search/SearchForm.tsx'
import { MIN_QUERY_LENGTH } from '../search/useRecordingSearch.ts'
import { RecordDisc } from './RecordDisc.tsx'

// The results list is not needed for the first paint (the form, the headline and the picture are), so its code is a
// separate chunk (decision 0002: first load stays under 250 KB gzipped). `lazy` expects a module with a default
// export, so the named export is wrapped.
const SearchResults = lazy(() =>
  import('../search/SearchResults.tsx').then((module) => ({ default: module.SearchResults })),
)

const drop = keyframes`from { opacity: 0; transform: translateY(0.25em); }`

const steps = [
  { n: '01', title: 'Add songs you love', text: 'Search by title. Remixes, live takes and compilations fold behind the original.' },
  { n: '02', title: 'Watch the crew appear', text: 'Producers, writers and players arrive one by one as their credits load.' },
  { n: '03', title: 'Follow the connectors', text: 'People behind several of your songs light up. Click one to see what else they made.' },
] as const

const headline = [
  { word: 'Every', highlight: false },
  { word: 'song', highlight: false },
  { word: 'has a', highlight: false },
  { word: 'crew.', highlight: true },
] as const

/**
 * The landing page (FR-LAND-01): what Nodeable is, a search, and how it works. When the browser already has a graph it
 * says so and links to it. The search results appear under the form, and adding a song opens the graph.
 */
export function LandingPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const session = useGraphSession()

  const title = params.get('q')?.trim() ?? ''
  const artist = params.get('artist')?.trim() || undefined
  const searching = title.length >= MIN_QUERY_LENGTH

  return (
    <Box sx={{ maxWidth: 1320, mx: 'auto' }}>
      <Box
        component="section"
        aria-labelledby="landing-heading"
        sx={(theme) => ({
          display: 'grid',
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1.1fr) minmax(0, 0.9fr)' },
          gap: 4,
          alignItems: 'center',
          pt: { xs: 2.5, md: 4.5 },
          pb: 5,
          borderBottom: `1px solid ${theme.vars.palette.divider}`,
        })}
      >
        <Box sx={{ order: { xs: 2, md: 0 } }}>
          <Typography
            id="landing-heading"
            variant="h1"
            // The words are separate boxes (for the staggered entrance) with a line break, which gives a screen reader no space.
            aria-label="Every song has a crew."
            sx={{ fontSize: 'clamp(64px, 10.5vw, 150px)', lineHeight: 0.84, mb: 3 }}
          >
            {headline.map(({ word, highlight }, index) => (
              <Box key={word} component="span">
                <Box
                  component="span"
                  sx={(theme) => ({
                    display: 'inline-block',
                    ...(highlight
                      ? {
                          backgroundColor: theme.vars.palette.secondary.main,
                          color: theme.vars.palette.secondary.contrastText,
                          px: '0.08em',
                          transform: 'rotate(-1.5deg)',
                        }
                      : {}),
                    '@media (prefers-reduced-motion: no-preference)': {
                      animation: `${drop} 700ms cubic-bezier(0.2, 0.8, 0.2, 1) both`,
                      animationDelay: `${index * 90}ms`,
                    },
                  })}
                >
                  {word}
                </Box>
                {index === 1 ? <br /> : ' '}
              </Box>
            ))}
          </Typography>

          <Typography sx={{ fontSize: 'clamp(16px, 1.5vw, 19px)', color: 'text.secondary', maxWidth: '31em', mb: 3.25 }}>
            Add the songs you love. Nodeable finds the producers, writers and session players behind them, then shows you
            who connects them.
          </Typography>

          <SearchForm pathname="/" />

          {session !== null && (
            <Button component={RouterLink} to="/graph" variant="text" sx={{ mt: 2, px: 0 }}>
              Back to your graph →
            </Button>
          )}

          {searching && (
            <Box sx={{ mt: 3, maxWidth: 640 }}>
              <Suspense fallback={<LinearProgress aria-label="Loading results" />}>
                <SearchResults
                  title={title}
                  artist={artist}
                  loadGraphSongs
                  onAdded={() => void navigate('/graph')}
                  onShowInGraph={() => void navigate('/graph')}
                />
              </Suspense>
            </Box>
          )}
        </Box>

        <Box sx={{ order: { xs: 1, md: 0 }, display: 'grid', justifyItems: 'center' }}>
          <RecordDisc />
        </Box>
      </Box>

      <Box
        component="section"
        aria-label="How it works"
        sx={(theme) => ({
          display: 'grid',
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(3, minmax(0, 1fr))' },
          borderBottom: `1px solid ${theme.vars.palette.divider}`,
        })}
      >
        {steps.map((step, index) => (
          <Box
            key={step.n}
            sx={(theme) => ({
              py: 2.75,
              pr: { md: 2.75 },
              pl: { md: index === 0 ? 0 : 2.75 },
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
              borderLeft: { md: index === 0 ? 'none' : `1px solid ${theme.vars.palette.divider}` },
              borderTop: { xs: index === 0 ? 'none' : `1px solid ${theme.vars.palette.divider}`, md: 'none' },
            })}
          >
            <Typography variant="display" component="span" sx={{ fontSize: 56, color: 'text.secondary' }}>
              {step.n}
            </Typography>
            <Typography variant="h3" component="h2">
              {step.title}
            </Typography>
            <Typography color="text.secondary" sx={{ maxWidth: '30em' }}>
              {step.text}
            </Typography>
          </Box>
        ))}
      </Box>

      <Typography variant="body2" color="text.secondary" sx={{ pt: 2 }}>
        Credits come from{' '}
        <Link href="https://musicbrainz.org/" target="_blank" rel="noopener noreferrer">
          MusicBrainz
        </Link>
        , the open music encyclopedia. Cover art comes from the Cover Art Archive.
      </Typography>
    </Box>
  )
}
