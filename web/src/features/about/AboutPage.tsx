import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Skeleton from '@mui/material/Skeleton'
import Typography from '@mui/material/Typography'
import { useCrawlStatus } from './useCrawlStatus.ts'

// Unmeasured is not zero (spec principle 5): null from the Api means the Worker has not recorded the figure yet.
const NOT_MEASURED = 'Not measured yet'

function formatRate(perMinute: number | null) {
  return perMinute === null ? NOT_MEASURED : `${perMinute.toFixed(1)} per minute`
}

function formatRatio(ratio: number | null) {
  return ratio === null ? NOT_MEASURED : `${Math.round(ratio * 100)}%`
}

// The architecture diagram and the full live crawl panel arrive in M4 (FR-ABOUT-01).
export function Component() {
  const status = useCrawlStatus()

  return (
    <>
      <Typography variant="h1" gutterBottom>
        About Nodeable
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Nodeable maps the producers, songwriters, engineers and session musicians behind the songs you love.
      </Typography>

      <Card variant="outlined" component="section" aria-labelledby="crawl-status-heading" sx={{ maxWidth: 480 }}>
        <CardContent>
          <Typography variant="h2" id="crawl-status-heading" sx={{ fontSize: '1.25rem', fontWeight: 600 }} gutterBottom>
            Crawl status
          </Typography>

          {/* A polite live region tells screen reader users when the figures arrive without interrupting them. */}
          <Box aria-live="polite" aria-busy={status.isPending}>
            {status.isPending && <Skeleton variant="rounded" height={72} />}

            {status.isError && <Alert severity="error">Could not load crawl status. Try again in a moment.</Alert>}

            {status.isSuccess && (
              <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 3, rowGap: 1 }}>
                <Typography component="dt" color="text.secondary">
                  Queue
                </Typography>
                <Typography component="dd" sx={{ m: 0 }}>
                  {status.data.queueDepth} {status.data.queueDepth === 1 ? 'job' : 'jobs'} waiting
                </Typography>

                <Typography component="dt" color="text.secondary">
                  Fetch rate
                </Typography>
                <Typography component="dd" sx={{ m: 0 }}>
                  {formatRate(status.data.fetchRatePerMinute)}
                </Typography>

                <Typography component="dt" color="text.secondary">
                  Cache hit ratio
                </Typography>
                <Typography component="dd" sx={{ m: 0 }}>
                  {formatRatio(status.data.cacheHitRatio)}
                </Typography>
              </Box>
            )}
          </Box>
        </CardContent>
      </Card>
    </>
  )
}
