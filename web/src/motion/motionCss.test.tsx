import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { FakeGraphHub } from '../test/fakeGraphHub.ts'
import { renderAt } from '../test/renderApp.tsx'
import { server } from '../test/server.ts'
import { setReducedMotion } from '../test/viewport.ts'
import { sampleSnapshot } from '../test/workspaceFixtures.ts'

const graphId = '7c1e0000-0000-4000-8000-000000000000'

function serveGraph() {
  localStorage.setItem('nodeable.graph', JSON.stringify({ id: graphId, token: 'token-for-the-test' }))
  server.use(http.get(`/api/v1/graphs/${graphId}`, () => HttpResponse.json(sampleSnapshot())))
}

function serveSearch() {
  server.use(
    http.get('/api/v1/search/recordings', () =>
      HttpResponse.json({
        source: 'musicBrainz',
        results: [
          {
            mbid: '7408f11c-6c4e-41e5-b81b-6a15bf6cb268',
            title: 'Redbone',
            artist: 'Childish Gambino',
            firstReleaseTitle: 'Awaken, My Love!',
            year: 2016,
            score: 100,
            creditsStatus: null,
            versions: [],
          },
        ],
      }),
    ),
  )
}

/** Every style rule on the page that declares an animation or a transition outside a `no-preference` block. */
function unguardedMotionRules(): { selector: string; css: string }[] {
  const found: { selector: string; css: string }[] = []
  const visit = (rules: CSSRuleList, guarded: boolean) => {
    for (const rule of Array.from(rules)) {
      const nested = (rule as CSSGroupingRule).cssRules
      if ('media' in rule && nested !== undefined) {
        const text = (rule as CSSMediaRule).media.mediaText
        // `reduce` blocks are the baseline itself; `no-preference` blocks are where an animation belongs.
        visit(nested, guarded || /prefers-reduced-motion:\s*(?:no-preference|reduce)/.test(text))
      } else if (!guarded && 'selectorText' in rule) {
        const css = (rule as CSSStyleRule).cssText
        if (/(?:^|[;{\s])(?:animation|transition)[\w-]*\s*:/.test(css)) {
          found.push({ selector: (rule as CSSStyleRule).selectorText, css: css.slice(0, 200) })
        }
      }
    }
  }
  for (const sheet of Array.from(document.styleSheets)) visit(sheet.cssRules, false)
  return found
}

/** The rules the app wrote itself: MUI's own components carry their name in the class (`css-1abc-MuiButton-root`). */
const ownRules = (rules: { selector: string }[]) => rules.filter((rule) => !/-Mui[A-Z]/.test(rule.selector))

describe('reduced motion in the stylesheet', () => {
  it('NFR_MOTION_01 declares no animation or transition of the app outside a no-preference block: landing and results', async () => {
    setReducedMotion(false)
    serveSearch()
    renderAt('/?q=Redbone')
    await screen.findByText('Redbone')

    expect(ownRules(unguardedMotionRules())).toEqual([])
  })

  it('NFR_MOTION_01 declares no animation or transition of the app outside a no-preference block: orbit, cards and notes', async () => {
    setReducedMotion(false)
    serveGraph()
    renderAt('/graph', { graphConnection: () => new FakeGraphHub() })
    await screen.findByRole('group', { name: /Credits graph/ })

    expect(ownRules(unguardedMotionRules())).toEqual([])
  })

  it('NFR_MOTION_01 declares no animation or transition of the app outside a no-preference block: constellation', async () => {
    setReducedMotion(false)
    serveGraph()
    renderAt('/graph?view=constellation', { graphConnection: () => new FakeGraphHub() })
    await screen.findByRole('group', { name: /constellation/i })

    expect(ownRules(unguardedMotionRules())).toEqual([])
  })

  it('NFR_MOTION_01 ends every CSS animation and transition at once with the setting on, except a progress bar', async () => {
    setReducedMotion(false)
    serveGraph()
    renderAt('/graph', { graphConnection: () => new FakeGraphHub() })
    await screen.findByRole('group', { name: /Credits graph/ })

    const baseline: string[] = []
    const visit = (rules: CSSRuleList) => {
      for (const rule of Array.from(rules)) {
        const nested = (rule as CSSGroupingRule).cssRules
        if ('media' in rule && nested !== undefined) {
          const reduces = /prefers-reduced-motion:\s*reduce/.test((rule as CSSMediaRule).media.mediaText)
          if (reduces) for (const inner of Array.from(nested)) baseline.push(inner.cssText)
        }
      }
    }
    for (const sheet of Array.from(document.styleSheets)) visit(sheet.cssRules)

    const text = baseline.join('\n')
    expect(text).toMatch(/animation-duration:\s*0\.01ms\s*!important/)
    expect(text).toMatch(/transition-duration:\s*0\.01ms\s*!important/)
    expect(text).toMatch(/animation-iteration-count:\s*1\s*!important/)
    // A loading bar's movement is the information; the baseline leaves it alone.
    expect(text).toContain('role="progressbar"')
  })
})
