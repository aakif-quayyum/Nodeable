import { createTheme } from '@mui/material/styles'

// The "studio" look: a near-black control-room surface with amber and cyan accents, and a light variant with the same hues deepened for contrast.
export const theme = createTheme({
  cssVariables: { colorSchemeSelector: 'data' },
  colorSchemes: {
    dark: {
      palette: {
        primary: { main: '#f5a524', contrastText: '#1a1205' },
        secondary: { main: '#4cc9f0', contrastText: '#00222c' },
        background: { default: '#0f1218', paper: '#171b24' },
        text: { primary: '#e8eaf0', secondary: '#a3abbd' },
        divider: 'rgba(232, 234, 240, 0.14)',
      },
    },
    light: {
      palette: {
        primary: { main: '#8f5400', contrastText: '#ffffff' },
        secondary: { main: '#006a8e', contrastText: '#ffffff' },
        background: { default: '#f4f5f8', paper: '#ffffff' },
        text: { primary: '#151822', secondary: '#4a5163' },
        divider: 'rgba(21, 24, 34, 0.16)',
      },
    },
  },
  shape: { borderRadius: 8 },
  typography: {
    // System fonts only: no font download keeps the first load small (ADR 0002).
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
    h1: { fontSize: '2rem', fontWeight: 700 },
  },
  components: {
    MuiAppBar: {
      defaultProps: { color: 'default', elevation: 0 },
      styleOverrides: { root: ({ theme: t }) => ({ borderBottom: `1px solid ${t.vars.palette.divider}` }) },
    },
  },
})
