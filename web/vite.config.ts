import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Aspire tells a service where its dependencies live through environment variables. For the "api" resource the address
// arrives as services__api__http__0; the fallback is the Api's own launch profile, for running `npm run dev` on its own.
const apiTarget = process.env['services__api__http__0'] ?? 'http://localhost:5029'

// Aspire injects OTEL_EXPORTER_OTLP_ENDPOINT into every resource: for the web app that is the dashboard's OTLP/HTTP address.
// The browser sends its spans to /otlp on Vite's own origin and Vite forwards them there, so no CORS rules are needed.
const otlpTarget = process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] ?? 'http://localhost:19180'

// Aspire also picks the port for the web app and passes it as PORT, so the dashboard link and Vite agree.
const port = process.env['PORT'] ? Number(process.env['PORT']) : 5173

// LEARN: LG-01 vite-vitest-config | Vitest reads the same vite.config.ts as the dev server, so tests use the same plugins and module resolution as the app; importing defineConfig from 'vitest/config' just adds the typed `test` block
export default defineConfig({
  plugins: [react()],
  server: {
    port,
    strictPort: Boolean(process.env['PORT']),
    // LEARN: LG-01 dev-proxy | The browser only ever talks to Vite's origin; Vite forwards /api to the real Api, so there is no CORS to configure and the traceparent header travels same-origin, exactly as Caddy will do in production
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true },
      // /otlp/v1/traces becomes /v1/traces on the dashboard.
      '/otlp': { target: otlpTarget, changeOrigin: true, rewrite: (path) => path.replace(/^\/otlp/, '') },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
