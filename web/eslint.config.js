import js from '@eslint/js'
import { defineConfig, globalIgnores } from 'eslint/config'
import jsxA11y from 'eslint-plugin-jsx-a11y-x'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default defineConfig([
  globalIgnores([
    'dist',
    'src/api/schema.d.ts',
    // Deliberately inaccessible markup: the lint-config test lints it and expects the findings, so `npm run lint` must not.
    'src/test/fixtures/**',
  ]),

  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,

      // LEARN: LG-01 typed-linting | "TypeChecked" rules ask the TypeScript compiler for the real type of each expression, so they can catch bugs plain syntax rules cannot, such as an un-awaited Promise or an `any` leaking into typed code
      tseslint.configs.recommendedTypeChecked,

      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,

      // Accessibility rules on JSX (spec principle 7, NFR-A11Y-01). This is jsx-a11y-x, the maintained fork of
      // eslint-plugin-jsx-a11y with the same recommended rules (decision 0014); its rule names start with jsx-a11y-x/.
      jsxA11y.configs.recommended,
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
