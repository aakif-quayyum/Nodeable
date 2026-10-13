import AppBar from '@mui/material/AppBar'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import LinearProgress from '@mui/material/LinearProgress'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import { lazy, Suspense } from 'react'
import { Link, NavLink, Outlet, useMatch, useNavigation } from 'react-router'
import { useAddSheet } from '../features/search/addSheet.ts'
import { ThemeToggle } from './ThemeToggle.tsx'

// The sheet is only needed once someone opens it, so its code (the dialog and the results list) waits until then.
const SearchSheet = lazy(() => import('../features/search/SearchSheet.tsx').then((module) => ({ default: module.SearchSheet })))

export function AppShell() {
  const navigation = useNavigation()
  const { open, openSheet } = useAddSheet()
  // The workspace is as tall as the window (the stage fills it and the column beside it scrolls); other pages flow.
  const workspace = useMatch('/graph') !== null

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', height: workspace ? { md: '100dvh' } : undefined }}>
      {/* WCAG 2.4.1: keyboard users can skip the navigation. The link is invisible until it receives focus. */}
      <Box
        component="a"
        href="#main-content"
        sx={{
          position: 'absolute',
          left: 8,
          top: -48,
          zIndex: 'tooltip',
          bgcolor: 'background.paper',
          color: 'text.primary',
          px: 2,
          py: 1,
          borderRadius: 1,
          '&:focus': { top: 8 },
        }}
      >
        Skip to main content
      </Box>

      {/* AppBar renders a <header>, which screen readers announce as the banner landmark. */}
      <AppBar position="sticky">
        <Toolbar sx={{ gap: 1, flexWrap: 'wrap', py: 1 }}>
          <Typography
            variant="display"
            component={Link}
            to="/"
            sx={{ color: 'inherit', textDecoration: 'none', fontSize: 26, mr: { xs: 'auto', sm: 2 } }}
          >
            Nodeable
          </Typography>

          {/* On a phone the links take a row of their own: the rows then do not depend on how wide the text is, so the
              page does not move when a web font replaces the system one (CLS). */}
          <Box
            component="nav"
            aria-label="Primary"
            sx={{ display: 'flex', gap: 0.5, flexGrow: { sm: 1 }, order: { xs: 3, sm: 0 }, flexBasis: { xs: '100%', sm: 'auto' } }}
          >
            {/* NavLink adds aria-current="page" to the link for the current route. */}
            <Button color="inherit" component={NavLink} to="/" end>
              Home
            </Button>
            <Button color="inherit" component={NavLink} to="/graph">
              Graph
            </Button>
            <Button color="inherit" component={NavLink} to="/about">
              About
            </Button>
          </Box>

          <Button variant="contained" onClick={openSheet} aria-haspopup="dialog">
            + Add a song
          </Button>
          <ThemeToggle />
        </Toolbar>

        {/* Shown while a lazy route's code is downloading, so a click never feels dead (spec principle 3). */}
        {navigation.state === 'loading' && <LinearProgress aria-label="Loading page" />}
      </AppBar>

      {/* tabIndex -1 lets the skip link move focus here without adding a tab stop. */}
      <Box
        component="main"
        id="main-content"
        tabIndex={-1}
        sx={{
          p: { xs: 2, sm: 3 },
          outline: 'none',
          flex: '1 1 auto',
          minHeight: 0,
          ...(workspace ? { display: 'flex', flexDirection: 'column', pb: { md: 2.5 } } : {}),
        }}
      >
        <Outlet />
      </Box>

      {open && (
        <Suspense fallback={null}>
          <SearchSheet />
        </Suspense>
      )}
    </Box>
  )
}
