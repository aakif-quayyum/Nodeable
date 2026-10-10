import { describe, expect, it } from 'vitest'
import { contrastRatio } from '../test/contrast.ts'
import { creditRoles, creditRoleStyles } from './creditRoles.ts'
import { theme } from './theme.ts'

const schemes = ['dark', 'light'] as const

function paletteFor(scheme: (typeof schemes)[number]) {
  const palette = theme.colorSchemes[scheme]?.palette
  if (!palette) {
    throw new Error(`The theme has no ${scheme} colour scheme`)
  }
  return palette
}

describe('studio theme', () => {
  it('NFR_A11Y_02 gives every credit role an icon and a colour that is distinct within each scheme', () => {
    for (const role of creditRoles) {
      expect(creditRoleStyles[role].Icon, role).toBeDefined()
    }

    for (const scheme of schemes) {
      const colours = creditRoles.map((role) => creditRoleStyles[role].colors[scheme])
      expect(new Set(colours).size, `${scheme} role colours`).toBe(creditRoles.length)
    }
  })

  // WCAG 1.4.11 asks for 3:1 between graphical objects (the graph's role colours) and the surface behind them.
  it.each(schemes)('NFR_A11Y_02 keeps every role colour at 3:1 or better on the %s backgrounds', (scheme) => {
    const { background } = paletteFor(scheme)

    for (const role of creditRoles) {
      const colour = creditRoleStyles[role].colors[scheme]
      expect(contrastRatio(colour, background.default), `${role} on default`).toBeGreaterThanOrEqual(3)
      expect(contrastRatio(colour, background.paper), `${role} on paper`).toBeGreaterThanOrEqual(3)
    }
  })

  // WCAG 1.4.3 asks for 4.5:1 for normal-size text (spec principle 7, WCAG 2.2 AA).
  it.each(schemes)('NFR_A11Y_01 keeps text and button labels at 4.5:1 or better in the %s scheme', (scheme) => {
    const { background, text, primary, secondary } = paletteFor(scheme)

    for (const surface of [background.default, background.paper]) {
      expect(contrastRatio(text.primary, surface), 'primary text').toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(text.secondary, surface), 'secondary text').toBeGreaterThanOrEqual(4.5)
    }
    expect(contrastRatio(primary.contrastText, primary.main), 'label on primary button').toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(secondary.contrastText, secondary.main), 'label on secondary button').toBeGreaterThanOrEqual(4.5)
  })
})
