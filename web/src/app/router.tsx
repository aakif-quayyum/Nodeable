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

      // LEARN: LG-01 route-lazy | `lazy` takes a function that dynamically imports the page; Vite turns each import() into a separate chunk that is downloaded the first time the route is visited (code splitting by route)
      { path: 'about', lazy: () => import('../features/about/AboutPage.tsx') },

      { path: '*', Component: NotFoundPage },
    ],
  },
]

export function createAppRouter() {
  return createBrowserRouter(routes)
}
