/**
 * The design tokens of the UI refresh (decision 0020), taken from the prototype in docs/design. They are plain data so
 * that the theme, the canvas renderer and the contrast tests read the same values.
 *
 * The scheme is dark first and flat: surfaces are solid colours separated by hairlines, with no gradients or shadows.
 * The light scheme is derived from the same roles (a paper surface, an ink text) and checked by the same tests.
 */
export interface SchemeTokens {
  /** The page. */
  bg: string
  /** Panels and cards. */
  panel: string
  /** A raised surface inside a panel: inputs, chips, avatars. */
  panel2: string
  /** A hairline between surfaces. Decoration only; not enough to mark the edge of a control. */
  line: string
  /** The edge of a control (an input, an outlined button): at least 3:1 against the page (WCAG 1.4.11). */
  lineStrong: string
  /** Text. */
  fg: string
  /** Secondary text: at least 4.5:1 against the page and the panels. */
  muted: string
  /** Text on the `accent` and `ok` fills (a filled `fg` surface takes `bg` as its text). */
  ink: string
  /** The record's black, used for song nodes. */
  vinyl: string
  /** A filled "credits complete" or "added" state; always used with `ink` text. */
  ok: string
  /** The one highlight colour: a marked word, a new credit, a partial status. Always used with `ink` text. */
  accent: string
}

export const tokens: Record<'dark' | 'light', SchemeTokens> = {
  dark: {
    bg: '#101113',
    panel: '#16171A',
    panel2: '#1E2024',
    line: '#2A2C31',
    lineStrong: '#6E727B',
    fg: '#F4F2EE',
    muted: '#9B9DA4',
    ink: '#101113',
    vinyl: '#0A0A0B',
    ok: '#4CD07D',
    accent: '#FFD23F',
  },
  light: {
    bg: '#F4F2EE',
    panel: '#FFFFFF',
    panel2: '#ECE9E3',
    line: '#D9D5CC',
    lineStrong: '#7A7870',
    fg: '#101113',
    muted: '#55575E',
    ink: '#101113',
    vinyl: '#0A0A0B',
    ok: '#4CD07D',
    accent: '#FFD23F',
  },
}

// Archivo is a variable font with a width axis: the display type is the same family set condensed (62 to 68 percent)
// and in capitals. Fontsource names the variable families "<Name> Variable".
export const fontFamilies = {
  body: '"Archivo Variable", "Helvetica Neue", "Segoe UI", system-ui, sans-serif',
  display: '"Archivo Variable", "Arial Narrow", "Helvetica Neue", system-ui, sans-serif',
  mono: '"JetBrains Mono Variable", ui-monospace, Menlo, Consolas, monospace',
} as const

/** Motion curves and durations shared by the refresh's animations (NFR-MOTION-01). */
export const motion = {
  ease: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
  fast: 150,
  base: 250,
  slow: 450,
} as const
