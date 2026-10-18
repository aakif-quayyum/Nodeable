import Typography from '@mui/material/Typography'
import { createBrowserRouter, type RouteObject } from 'react-router'
import { AppShell } from './AppShell.tsx'
import { GraphPage } from '../features/graph/GraphPage.tsx'
import { LandingPage } from '../features/landing/LandingPage.tsx'
import { NotFoundPage } from './NotFoundPage.tsx'

// The routes are plain data, so tests can run them in a memory router while the app uses the browser's address bar.
export const routes: RouteObject[] = [
  {
    path: '/',
    Component: AppShell,
    // Shown on the very first load while the shell's lazy children (if any) resolve.
    HydrateFallback: () => <Typography sx={{ p: 3 }}>Loading Nodeable…</Typography>,
    children: [
      // The landing page is part of the main bundle: it is what the first paint needs.
      { index: true, Component: LandingPage },

      // The workspace (spec section 12). Its heavy parts are lazy inside the page.
      { path: 'graph', Component: GraphPage },

      { path: 'about', lazy: () => import('../features/about/AboutPage.tsx') },

      // The operator's page (NFR-OBS-03). It is reached by its address only, has no link in the header, and loads the chart
      // code on its own, so no other page pays for it.
      { path: 'status', lazy: () => import('../features/status/StatusPage.tsx') },

      { path: '*', Component: NotFoundPage },
    ],
  },
]

export function createAppRouter() {
  return createBrowserRouter(routes)
}
