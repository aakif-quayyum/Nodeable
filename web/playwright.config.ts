import { defineConfig, devices } from '@playwright/test'

// The browser flow of the UI refresh (spec section 13, decision 0020): the production build of the web app, in a real
// browser, with the Api and the hub faked at the network edge (see e2e/fakeApi.ts). The suite against the whole stack,
// with a recorded MusicBrainz, is M4's. Run in CI; locally: `npm run build && npm run e2e`.
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // `vite preview` serves the built files; the fake Api answers /api and /hubs before they reach it.
    command: 'npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env['CI'],
    timeout: 60_000,
  },
})
