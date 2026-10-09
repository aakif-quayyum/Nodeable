import CssBaseline from '@mui/material/CssBaseline'
import { ThemeProvider } from '@mui/material/styles'
import type { ReactNode } from 'react'
import { theme } from './theme.ts'

// All app-wide providers live here, so tests and main.tsx wrap the app the same way.
// More arrive later in M1 (TanStack Query in commit 15).
export function Providers({ children }: { children: ReactNode }) {
  return (
    // Dark first: the studio theme starts dark, and the toggle in the app bar remembers the user's choice.
    <ThemeProvider theme={theme} defaultMode="dark">
      <CssBaseline enableColorScheme />
      {children}
    </ThemeProvider>
  )
}
