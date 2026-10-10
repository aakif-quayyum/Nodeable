import js from '@eslint/js'
import { defineConfig, globalIgnores } from 'eslint/config'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

// LEARN: LG-01 eslint-flat-config | ESLint's "flat config" is a plain array of config objects; later entries override earlier ones, and each entry can be limited to certain files, so the whole setup reads top to bottom like a middleware chain
export default defineConfig([
  globalIgnores(['dist', 'src/api/schema.d.ts']),

  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,

      // LEARN: LG-01 typed-linting | "TypeChecked" rules ask the TypeScript compiler for the real type of each expression, so they can catch bugs plain syntax rules cannot, such as an un-awaited Promise or an `any` leaking into typed code
      tseslint.configs.recommendedTypeChecked,

      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,

      // Accessibility rules on JSX (spec principle 7, NFR-A11Y-01).
      jsxA11y.flatConfigs.recommended,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        // projectService finds the right tsconfig for each file, so the linter and the compiler agree on types.
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  {
    // Plain JavaScript files (this config itself) are outside the TypeScript projects, so skip the type-aware rules there.
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
])
