import AppBar from '@mui/material/AppBar'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import LinearProgress from '@mui/material/LinearProgress'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import { Link, NavLink, Outlet, useNavigation } from 'react-router'
import { ThemeToggle } from './ThemeToggle.tsx'

export function AppShell() {
  const navigation = useNavigation()

  return (
    <>
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
        <Toolbar sx={{ gap: 1 }}>
          <Typography
            variant="h6"
            component={Link}
            to="/"
            sx={{ color: 'inherit', textDecoration: 'none', fontWeight: 700, mr: 2 }}
          >
            Nodeable
          </Typography>

          <Box component="nav" aria-label="Primary" sx={{ display: 'flex', gap: 1, flexGrow: 1 }}>
            {/* NavLink adds aria-current="page" to the link for the current route. */}
            <Button color="inherit" component={NavLink} to="/" end>
              Home
            </Button>
            <Button color="inherit" component={NavLink} to="/about">
              About
            </Button>
          </Box>

          <ThemeToggle />
        </Toolbar>

        {/* Shown while a lazy route's code is downloading, so a click never feels dead (spec principle 3). */}
        {navigation.state === 'loading' && <LinearProgress aria-label="Loading page" />}
      </AppBar>

      {/* tabIndex -1 lets the skip link move focus here without adding a tab stop. */}
      <Box component="main" id="main-content" tabIndex={-1} sx={{ p: { xs: 2, sm: 3 }, outline: 'none' }}>
        <Outlet />
      </Box>
    </>
  )
}
