import Typography from '@mui/material/Typography'

// The architecture diagram and the live crawl status panel arrive in M4 (FR-ABOUT-01); commit 15 adds the first call to the Api here.
// LEARN: LG-01 default-export-lazy | The router loads this module only when /about is visited, and a lazy route needs the page as a named `Component` export; that is what puts About in its own JavaScript chunk instead of the main bundle (ADR 0002)
export function Component() {
  return (
    <>
      <Typography variant="h1" gutterBottom>
        About Nodeable
      </Typography>
      <Typography color="text.secondary">
        Nodeable maps the producers, songwriters, engineers and session musicians behind the songs you love.
      </Typography>
    </>
  )
}
