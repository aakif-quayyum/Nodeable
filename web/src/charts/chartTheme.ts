import { creditRoleStyles, creditRoles, type CreditRoleKey } from '../app/creditRoles.ts'
import { fontFamilies, tokens } from '../app/tokens.ts'

export type ChartScheme = 'dark' | 'light'

/** The name a scheme's theme is registered under with ECharts. */
export const chartThemeName = (scheme: ChartScheme) => `nodeable-${scheme}`

/**
 * The colours of a series, in the order panels hand them out. They are the role colours of the graph (decision 0020):
 * the same palette, already checked for contrast in both schemes. A series also differs by dash and marker, so colour
 * is never the only thing telling two lines apart (NFR-A11Y-02).
 */
export function seriesColors(scheme: ChartScheme): string[] {
  return creditRoles.filter((role): role is Exclude<CreditRoleKey, 'other'> => role !== 'other').map((role) => creditRoleStyles[role].colors[scheme])
}

/** Dash patterns and symbols that go with the colours above, one pair for each position. */
export const lineStyles = [
  { type: 'solid', symbol: 'circle' },
  { type: 'dashed', symbol: 'rect' },
  { type: 'dotted', symbol: 'triangle' },
  { type: 'solid', symbol: 'diamond' },
  { type: 'dashed', symbol: 'roundRect' },
  { type: 'dotted', symbol: 'pin' },
] as const

/** The theme object for one scheme, built from the design tokens (decision 0020), so no hex value is written twice. */
export function buildChartTheme(scheme: ChartScheme) {
  const t = tokens[scheme]
  const axis = {
    axisLine: { lineStyle: { color: t.lineStrong } },
    axisTick: { lineStyle: { color: t.lineStrong } },
    axisLabel: { color: t.muted, fontFamily: fontFamilies.mono, fontSize: 11 },
    splitLine: { lineStyle: { color: t.line } },
    nameTextStyle: { color: t.muted },
  }
  return {
    color: seriesColors(scheme),
    backgroundColor: 'transparent',
    textStyle: { color: t.fg, fontFamily: fontFamilies.mono },
    legend: { textStyle: { color: t.muted, fontFamily: fontFamilies.mono, fontSize: 11 }, itemWidth: 22 },
    tooltip: {
      backgroundColor: t.panel2,
      borderColor: t.lineStrong,
      textStyle: { color: t.fg, fontFamily: fontFamilies.mono, fontSize: 12 },
      axisPointer: { lineStyle: { color: t.fg, type: 'solid', width: 1 }, crossStyle: { color: t.fg } },
    },
    categoryAxis: axis,
    valueAxis: axis,
    timeAxis: axis,
    markLine: { lineStyle: { color: t.accent }, label: { color: t.fg } },
    visualMap: { textStyle: { color: t.muted } },
  }
}
