import { useColorScheme } from '@mui/material/styles'
import type { ChartScheme } from './chartTheme.ts'

/** The colour scheme the page is showing, "dark" until MUI has read the person's setting. */
export function useChartScheme(): ChartScheme {
  const { colorScheme } = useColorScheme()
  return colorScheme === 'light' ? 'light' : 'dark'
}
