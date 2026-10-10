import CssBaseline from '@mui/material/CssBaseline'
import { ThemeProvider } from '@mui/material/styles'
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { createQueryClient } from './queryClient.ts'
import { theme } from './theme.ts'

// One client for the whole app, created once at module level so its cache survives re-renders.
const appQueryClient = createQueryClient()

// All app-wide providers live here, so tests and main.tsx wrap the app the same way.
// Tests pass their own QueryClient so no cached data leaks from one test to the next.
export function Providers({ children, queryClient = appQueryClient }: { children: ReactNode; queryClient?: QueryClient }) {
  return (
    <QueryClientProvider client={queryClient}>
      {/* Dark first: the studio theme starts dark, and the toggle in the app bar remembers the user's choice. */}
      <ThemeProvider theme={theme} defaultMode="dark">
        <CssBaseline enableColorScheme />
        {children}
      </ThemeProvider>
    </QueryClientProvider>
  )
}
