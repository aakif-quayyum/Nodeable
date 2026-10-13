import { keyframes, styled, type Theme } from '@mui/material/styles'
import { creditRoles, creditRoleStyles } from '../../app/creditRoles.ts'
import { fontFamilies } from '../../app/tokens.ts'

const spin = keyframes`to { transform: rotate(360deg); }`
const ripple = keyframes`from { transform: scale(1); opacity: 0.9; } to { transform: scale(1.9); opacity: 0; }`
const twinkle = keyframes`0%, 100% { opacity: 0.1; } 50% { opacity: 0.7; }`

/**
 * Each role's colour as a CSS variable (`--role-producer`), for the dark scheme and, redefined, for the light one. SVG
 * attributes and conic gradients cannot take a MUI theme value, but they can take `var(--role-producer)`, so no node or
 * card has to know which scheme is on (NFR-A11Y-02: each role colour is tested for 3:1 against both surfaces).
 */
export function roleVars(theme: Theme) {
  const dark: Record<string, string> = {}
  const light: Record<string, string> = {}
  for (const role of creditRoles) {
    dark[`--role-${role}`] = creditRoleStyles[role].colors.dark
    light[`--role-${role}`] = creditRoleStyles[role].colors.light
  }
  return { ...dark, ...theme.applyStyles('light', light) }
}

/** The colours and fonts the drawing needs, as CSS variables on the stage. */
export function stageVars(theme: Theme) {
  return {
    ...roleVars(theme),
    '--fg': theme.vars.palette.text.primary,
    '--muted': theme.vars.palette.text.secondary,
    '--panel': theme.vars.palette.background.paper,
    '--raised': theme.vars.palette.raised,
    '--vinyl': theme.vars.palette.vinyl,
    '--line-strong': theme.vars.palette.lineStrong,
    '--font-body': fontFamilies.body,
    '--font-mono': fontFamilies.mono,
  }
}

/**
 * The orbit's `<svg>`. Colours are variables (above); every animation is behind `no-preference` and moves only
 * `transform` and `opacity` (NFR-MOTION-01), so a person who asked for less motion gets the still version by default.
 */
export const OrbitSvg = styled('svg')(({ theme }) => ({
  ...stageVars(theme),
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  display: 'block',
  touchAction: 'none',
  cursor: 'grab',
  '&:active': { cursor: 'grabbing' },
  '& .lnk': { fill: 'none', strokeWidth: 1.6 },
  '& .xlnk': { fill: 'none', stroke: 'var(--fg)', strokeOpacity: 0.22, strokeWidth: 1, strokeDasharray: '2 5' },
  '& .guide': { fill: 'none', stroke: '#ffffff14', strokeDasharray: '1 6' },
  '& .nd': { cursor: 'pointer', outline: 'none' },
  '& .nd.is-centre': { cursor: 'default' },
  '& .nd:focus-visible .hit': { stroke: 'var(--fg)', strokeWidth: 2.5 },
  // Names are never smaller than 12 px (`--ls` is 1 or more, set by the layout from the room on the stage).
  '& .lbl': {
    fontFamily: 'var(--font-body)',
    fontWeight: 600,
    fontSize: 'calc(12px * var(--ls, 1))',
    fill: 'var(--fg)',
    paintOrder: 'stroke',
    stroke: 'var(--panel)',
    strokeWidth: '4px',
    strokeLinejoin: 'round',
    pointerEvents: 'none',
  },
  '& .lbl.sm': { fontWeight: 500, fill: 'var(--muted)' },
  '& .ini': { font: '700 8px var(--font-body)', fill: 'var(--fg)', pointerEvents: 'none' },
  '& .hubN': { font: '800 13px var(--font-body)', fill: 'var(--fg)', pointerEvents: 'none', fontVariantNumeric: 'tabular-nums' },
  '& .hubL': { font: '700 4.6px var(--font-mono)', letterSpacing: '0.14em', textTransform: 'uppercase', fill: 'var(--muted)', pointerEvents: 'none' },
  '& .nd[data-big="0"] .ini': { opacity: 0 },
  // The focus mode (spec section 12): everything outside the hovered node's path and neighbours steps back.
  '& .dim': { opacity: 0.1 },
  '& .spin': { transformBox: 'fill-box', transformOrigin: 'center' },
  '& .ripple': { fill: 'none', strokeWidth: 1.5, transformBox: 'fill-box', transformOrigin: 'center' },
  '& .roleArc': { fill: 'none', strokeWidth: 3 },
  '& .roleTxt': { font: '700 10px var(--font-mono)', letterSpacing: '0.14em', textTransform: 'uppercase' },
  '& .star': { fill: '#F4F2EE' },
  '@media (prefers-reduced-motion: no-preference)': {
    '& .is-centre .spin, & .is-spinning .spin': { animation: `${spin} 4.5s linear infinite` },
    '& .ripple': { animation: `${ripple} 2.4s cubic-bezier(0.2, 0.8, 0.2, 1) infinite` },
    '& .arcs': { transition: 'opacity 400ms' },
    '& .tw': { animation: `${twinkle} 3.4s ease-in-out infinite` },
  },
}))
