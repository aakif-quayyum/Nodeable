import Equalizer from '@mui/icons-material/Equalizer'
import Edit from '@mui/icons-material/Edit'
import MoreHoriz from '@mui/icons-material/MoreHoriz'
import Mic from '@mui/icons-material/Mic'
import Piano from '@mui/icons-material/Piano'
import Settings from '@mui/icons-material/Settings'
import Tune from '@mui/icons-material/Tune'
import type { SvgIconComponent } from '@mui/icons-material'

export const creditRoles = ['producer', 'songwriter', 'mixing', 'engineering', 'instrument', 'vocal', 'other'] as const

export type CreditRoleKey = (typeof creditRoles)[number]

export interface CreditRoleStyle {
  /** The short name: "Producer". Used on chips, legends and in tooltips. */
  label: string
  /** The phrase a liner note uses for the row: "Produced by". */
  phrase: string
  /** Every role pairs its colour with an icon, so colour is never the only signal (NFR-A11Y-02). */
  Icon: SvgIconComponent
  /** One colour per colour scheme: bright on the dark surfaces, deeper on the light ones. Each is tested for 3:1. */
  colors: { dark: string; light: string }
}

// The dark values are the design prototype's (docs/design); the light values are the same hues, deepened until they
// reach 3:1 against both light surfaces (the contrast test in theme.test.ts decides).
export const creditRoleStyles: Record<CreditRoleKey, CreditRoleStyle> = {
  producer: { label: 'Producer', phrase: 'Produced by', Icon: Tune, colors: { dark: '#FFD23F', light: '#8A6A00' } },
  songwriter: { label: 'Songwriter', phrase: 'Written by', Icon: Edit, colors: { dark: '#FF6B4A', light: '#C2362B' } },
  mixing: { label: 'Mixing', phrase: 'Mixed by', Icon: Equalizer, colors: { dark: '#3EC6E0', light: '#007A94' } },
  engineering: { label: 'Engineering', phrase: 'Engineered by', Icon: Settings, colors: { dark: '#8B7BFF', light: '#5B43D6' } },
  // @mui/icons-material has no guitar icon, so instruments use the piano.
  instrument: { label: 'Instrument', phrase: 'Played by', Icon: Piano, colors: { dark: '#4CD07D', light: '#1E8E4A' } },
  vocal: { label: 'Vocal', phrase: 'Vocals', Icon: Mic, colors: { dark: '#FF7AC6', light: '#C2398F' } },
  // Unmapped MusicBrainz relationship types (decision 0010): a neutral grey, and the label comes from the credit's detail.
  other: { label: 'Other', phrase: 'Also credited', Icon: MoreHoriz, colors: { dark: '#9B9DA4', light: '#6C707A' } },
}

/**
 * What a credit says in words: the role, and its detail when it has one ("Instrument · guitar"). An `other` credit
 * is named by its detail alone ("Arranger"), which is the only thing MusicBrainz told us (decision 0010).
 */
export function roleText(role: CreditRoleKey, detail: string): string {
  const base = creditRoleStyles[role].label
  if (detail === '') return base
  return role === 'other' ? detail : `${base} · ${detail}`
}
