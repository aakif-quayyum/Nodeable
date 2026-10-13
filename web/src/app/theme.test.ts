import { describe, expect, it } from 'vitest'
import { contrastRatio } from '../test/contrast.ts'
import { creditRoles, creditRoleStyles } from './creditRoles.ts'
import { theme } from './theme.ts'
import { tokens } from './tokens.ts'

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
    // Chips and avatars sit on the raised surface as well as on the page and the panels.
    const surfaces = { default: background.default, paper: background.paper, raised: tokens[scheme].panel2 }

    for (const role of creditRoles) {
      const colour = creditRoleStyles[role].colors[scheme]
      for (const [name, surface] of Object.entries(surfaces)) {
        expect(contrastRatio(colour, surface), `${role} on ${name}`).toBeGreaterThanOrEqual(3)
      }
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

  // WCAG 1.4.11: the edge of an input or an outlined button is what tells a person it is a control.
  it.each(schemes)('NFR_A11Y_01 keeps the edge of a control at 3:1 or better against the page and the panels in the %s scheme', (scheme) => {
    const { background } = paletteFor(scheme)

    expect(contrastRatio(tokens[scheme].lineStrong, background.default), 'page').toBeGreaterThanOrEqual(3)
    expect(contrastRatio(tokens[scheme].lineStrong, background.paper), 'panel').toBeGreaterThanOrEqual(3)
  })

  // A filled 'complete' status or the accent highlight always carries ink text.
  it.each(schemes)('NFR_A11Y_01 keeps ink text on the accent and the ok fill at 4.5:1 or better in the %s scheme', (scheme) => {
    expect(contrastRatio(tokens[scheme].ink, tokens[scheme].accent), 'accent').toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(tokens[scheme].ink, tokens[scheme].ok), 'ok').toBeGreaterThanOrEqual(4.5)
  })

  it('NFR_A11Y_02 names every role with a phrase for the liner notes', () => {
    for (const role of creditRoles) {
      expect(creditRoleStyles[role].phrase.length, role).toBeGreaterThan(0)
    }
  })
})
