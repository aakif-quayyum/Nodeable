import Equalizer from '@mui/icons-material/Equalizer'
import Edit from '@mui/icons-material/Edit'
import Mic from '@mui/icons-material/Mic'
import Piano from '@mui/icons-material/Piano'
import Settings from '@mui/icons-material/Settings'
import Tune from '@mui/icons-material/Tune'
import type { SvgIconComponent } from '@mui/icons-material'

export const creditRoles = ['producer', 'songwriter', 'mixing', 'engineering', 'instrument', 'vocal'] as const

export type CreditRoleKey = (typeof creditRoles)[number]

export interface CreditRoleStyle {
  label: string
  /** Every role pairs its colour with an icon, so colour is never the only signal (NFR-A11Y-02). */
  Icon: SvgIconComponent
  /** One colour per colour scheme: bright on the dark background, deeper on the light one. */
  colors: { dark: string; light: string }
}

export const creditRoleStyles: Record<CreditRoleKey, CreditRoleStyle> = {
  producer: { label: 'Producer', Icon: Tune, colors: { dark: '#f5a524', light: '#8f5400' } },
  songwriter: { label: 'Songwriter', Icon: Edit, colors: { dark: '#ff6b9a', light: '#b8174f' } },
  mixing: { label: 'Mixing', Icon: Equalizer, colors: { dark: '#4cc9f0', light: '#006a8e' } },
  engineering: { label: 'Engineering', Icon: Settings, colors: { dark: '#9b8cff', light: '#5a43d6' } },
  // @mui/icons-material has no guitar icon, so instruments use the piano.
  instrument: { label: 'Instrument', Icon: Piano, colors: { dark: '#6ee7a0', light: '#1d7a46' } },
  vocal: { label: 'Vocal', Icon: Mic, colors: { dark: '#ff8a5b', light: '#b8420f' } },
}
