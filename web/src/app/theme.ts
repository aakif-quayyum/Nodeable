import { createTheme } from '@mui/material/styles'
import { fontFamilies, motion, tokens, type SchemeTokens } from './tokens.ts'

// One scheme's tokens as MUI palette values. Every colour the UI uses comes from tokens.ts through here, so a change
// of the design is a change of one file.
function paletteFor(scheme: SchemeTokens) {
  return {
    // A filled primary button is the text colour as a surface, so its label is the page colour.
    primary: { main: scheme.fg, contrastText: scheme.bg },
    secondary: { main: scheme.accent, contrastText: scheme.ink },
    success: { main: scheme.ok, contrastText: scheme.ink },
    background: { default: scheme.bg, paper: scheme.panel },
    text: { primary: scheme.fg, secondary: scheme.muted },
    divider: scheme.line,
    raised: scheme.panel2,
    lineStrong: scheme.lineStrong,
    ink: scheme.ink,
    vinyl: scheme.vinyl,
  }
}

// The "studio" look, refreshed (decision 0020): flat colour blocks, hairline rules, condensed capitals for the
// display type and monospaced capitals for labels. MUI keeps inputs, buttons, dialogs and sheets; the theme restyles
// them, so no component repeats these values.
export const theme = createTheme({
  cssVariables: { colorSchemeSelector: 'data' },
  colorSchemes: {
    dark: { palette: paletteFor(tokens.dark) },
    light: { palette: paletteFor(tokens.light) },
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily: fontFamilies.body,
    fontSize: 15,
    h1: { fontFamily: fontFamilies.display, fontStretch: '62%', fontWeight: 900, fontSize: '2.25rem', lineHeight: 0.9, textTransform: 'uppercase' },
    h2: { fontFamily: fontFamilies.display, fontStretch: '66%', fontWeight: 900, fontSize: '1.75rem', lineHeight: 0.95, textTransform: 'uppercase' },
    h3: { fontFamily: fontFamilies.display, fontStretch: '70%', fontWeight: 850, fontSize: '1.375rem', lineHeight: 1, textTransform: 'uppercase' },
    h4: { fontFamily: fontFamilies.display, fontStretch: '72%', fontWeight: 850, fontSize: '1.125rem', lineHeight: 1, textTransform: 'uppercase' },
    button: { fontWeight: 700, textTransform: 'none' },
    // The two variants the prototype uses that MUI does not have: a condensed display face for names and counts, and
    // a monospaced kicker for small labels.
    display: { fontFamily: fontFamilies.display, fontStretch: '62%', fontWeight: 900, lineHeight: 0.85, textTransform: 'uppercase' },
    kicker: { fontFamily: fontFamilies.mono, fontSize: '0.656rem', fontWeight: 500, letterSpacing: '0.16em', lineHeight: 1.4, textTransform: 'uppercase' },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        // Archivo's width axis is driven by `font-stretch`; body copy sits at the normal width.
        body: { fontStretch: '100%' },
        // One focus ring for everything that can take focus, in the text colour so it is visible on every surface.
        ':focus-visible': { outline: '2px solid var(--mui-palette-text-primary)', outlineOffset: 2 },
      },
    },
    // Dark-mode MUI paints a lighter overlay (a gradient) on raised paper; the design is flat.
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
    MuiAppBar: {
      defaultProps: { color: 'default', elevation: 0 },
      styleOverrides: { root: ({ theme: t }) => ({ borderBottom: `1px solid ${t.vars.palette.divider}` }) },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 10, transition: `transform ${motion.fast}ms ${motion.ease}, background-color ${motion.base}ms` },
        outlined: ({ theme: t }) => ({
          borderColor: t.vars.palette.lineStrong,
          color: t.vars.palette.text.primary,
          '&:hover': { borderColor: t.vars.palette.text.primary, backgroundColor: 'transparent' },
        }),
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        // The edge of an input is a control boundary: the stronger token, not the hairline (WCAG 1.4.11).
        root: ({ theme: t }) => ({
          backgroundColor: t.vars.palette.background.paper,
          '& .MuiOutlinedInput-notchedOutline': { borderColor: t.vars.palette.lineStrong },
          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: t.vars.palette.text.primary },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: t.vars.palette.text.primary, borderWidth: 1 },
        }),
      },
    },
    MuiDialog: {
      styleOverrides: { paper: ({ theme: t }) => ({ borderRadius: 18, border: `1px solid ${t.vars.palette.divider}` }) },
    },
    MuiChip: {
      styleOverrides: { root: { borderRadius: 6, fontWeight: 600 } },
    },
  },
})
