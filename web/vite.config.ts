import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// LEARN: LG-01 vite-vitest-config | Vitest reads the same vite.config.ts as the dev server, so tests use the same plugins and module resolution as the app; importing defineConfig from 'vitest/config' just adds the typed `test` block
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
