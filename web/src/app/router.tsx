import Typography from '@mui/material/Typography'
import { createBrowserRouter, type RouteObject } from 'react-router'
import { AppShell } from './AppShell.tsx'
import { HomePage } from './HomePage.tsx'
import { NotFoundPage } from './NotFoundPage.tsx'

// The routes are plain data, so tests can run them in a memory router while the app uses the browser's address bar.
export const routes: RouteObject[] = [
  {
    path: '/',
    Component: AppShell,
    // Shown on the very first load while the shell's lazy children (if any) resolve.
    HydrateFallback: () => <Typography sx={{ p: 3 }}>Loading Nodeable…</Typography>,
    children: [
      // The home route is part of the main bundle: it is what the first paint needs.
      { index: true, Component: HomePage },

      { path: 'about', lazy: () => import('../features/about/AboutPage.tsx') },

      { path: '*', Component: NotFoundPage },
    ],
  },
]

export function createAppRouter() {
  return createBrowserRouter(routes)
}
