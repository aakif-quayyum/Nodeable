import Box from '@mui/material/Box'
import Link from '@mui/material/Link'
import Skeleton from '@mui/material/Skeleton'
import Typography from '@mui/material/Typography'
import { lazy, Suspense } from 'react'
import { ArchitectureDiagram } from './ArchitectureDiagram.tsx'

// The charts are a separate chunk: the text and the diagram paint first, and the chart code is fetched only by someone who
// reads this far (ADR 0002; the same chunk as the status page).
// LEARN: LG-04 lazy-in-page-chunk | React.lazy inside a page defers a heavy part to its own chunk and Suspense shows a fallback while it downloads, so the cheap part of the page (text, the diagram) is usable at once and the charting library is paid for only when this page is read
const CrawlerPanels = lazy(() => import('./CrawlerPanels.tsx').then((module) => ({ default: module.CrawlerPanels })))

const repositoryUrl = 'https://github.com/aakif-quayyum/Nodeable'
export const specUrl = `${repositoryUrl}/blob/main/docs/spec/nodeable-spec.md`

function ExternalLink({ href, children }: { href: string; children: string }) {
  return (
    <Link href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </Link>
  )
}

/** The About page (FR-ABOUT-01, US-08): what Nodeable is made of, how its crawler is doing right now, and where the code is. */
export function Component() {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 4 }}>
      <Box>
        <Typography variant="h1" gutterBottom>
          About Nodeable
        </Typography>
        <Typography color="text.secondary">
          Nodeable maps the producers, songwriters, engineers and session musicians behind the songs you love.
        </Typography>
      </Box>

      <Box component="section" aria-labelledby="architecture-heading" sx={{ display: 'grid', gap: 2 }}>
        <Typography id="architecture-heading" variant="h2" sx={{ fontSize: 24 }}>
          How it works
        </Typography>
        <Typography color="text.secondary" sx={{ fontSize: 14.5 }}>
          Two small services share a database and a rate gate. Adding a song returns at once; a background worker fetches the credits from
          MusicBrainz, one request a second, and the page fills in as they arrive.
        </Typography>
        <ArchitectureDiagram />
      </Box>

      <Box component="section" aria-labelledby="crawler-heading" sx={{ display: 'grid', gap: 2 }}>
        <Typography id="crawler-heading" variant="h2" sx={{ fontSize: 24 }}>
          How the crawler is doing right now
        </Typography>
        <Suspense fallback={<Skeleton variant="rounded" height={260} aria-label="Loading the crawler's numbers" />}>
          <CrawlerPanels />
        </Suspense>
      </Box>

      <Box component="section" aria-labelledby="code-heading" sx={{ display: 'grid', gap: 1 }}>
        <Typography id="code-heading" variant="h2" sx={{ fontSize: 24 }}>
          Read the code
        </Typography>
        <Typography sx={{ fontSize: 14.5 }}>
          Nodeable is a portfolio project, built to learn C#, .NET, TypeScript and modern observability tooling. Everything is written down:{' '}
          <ExternalLink href={repositoryUrl}>the code on GitHub</ExternalLink> and <ExternalLink href={specUrl}>the specification</ExternalLink>.
        </Typography>
      </Box>
    </Box>
  )
}
