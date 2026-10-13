import { describe, expect, it } from 'vitest'
import { creditRoles, type CreditRoleKey } from '../../app/creditRoles.ts'
import { credit, person, sampleSnapshot, snapshotOf, song } from '../../test/workspaceFixtures.ts'
import { buildWorkspace } from '../graph/workspaceModel.ts'
import { focusParam, layoutOrbit, lerpAngle, maxSecondRing, nodeKey, parseFocus, polarToXY } from './orbitLayout.ts'

const stage = { width: 900, height: 640 }
const all: ReadonlySet<CreditRoleKey> = new Set(creditRoles)
const build = (snapshot = sampleSnapshot()) => buildWorkspace(snapshot, { roles: all, removed: new Set(), hidden: new Set() })

describe('orbit layout', () => {
  it('FR_VIEW_01 puts a song’s people on the first ring and their other songs on the second', () => {
    const layout = layoutOrbit(build(), { type: 'song', id: 'song-redbone' }, stage)

    const byDepth = (depth: number) => layout.nodes.filter((node) => node.depth === depth).map((node) => node.id)
    expect(byDepth(0)).toEqual(['s:song-redbone'])
    expect(byDepth(1)).toEqual(['p:person-donald', 'p:person-ludwig', 'p:person-collins', 'p:person-riley'])
    // Me and Your Mama is reached from Donald first, so it is drawn once, under him, with a cross-link from the others.
    expect(byDepth(2)).toEqual(['s:song-mym'])
    expect(layout.crossLinks.map((link) => [link.source, link.target])).toEqual([
      ['p:person-ludwig', 's:song-mym'],
      ['p:person-riley', 's:song-mym'],
    ])
  })

  it('FR_VIEW_01 centres on a person with their songs on the first ring and the people around them on the second', () => {
    const layout = layoutOrbit(build(), { type: 'person', id: 'person-riley' }, stage)

    expect(layout.nodes.filter((node) => node.depth === 1).map((node) => node.id)).toEqual(['s:song-redbone', 's:song-mym'])
    const second = layout.nodes.filter((node) => node.depth === 2).map((node) => node.id)
    expect(second).toEqual(['p:person-donald', 'p:person-ludwig', 'p:person-collins'])
    // Role arcs name a song's roles: a person's orbit has none.
    expect(layout.arcs).toEqual([])
  })

  it('FR_VIEW_01 draws one role arc for each run of people who share a main role on the centre song', () => {
    const layout = layoutOrbit(build(), { type: 'song', id: 'song-redbone' }, stage)

    expect(layout.arcs.map((arc) => arc.role)).toEqual(['producer', 'songwriter', 'mixing'])
    for (const arc of layout.arcs) expect(arc.a1).toBeGreaterThan(arc.a0)
  })

  it('FR_VIEW_01 shows at most 60 on the second ring and stands for the rest with one "+N more" node', () => {
    const people = Array.from({ length: 75 }, (_, index) => person(`p${index}`, `Person ${String(index).padStart(2, '0')}`))
    const snapshot = snapshotOf({
      songs: [song('a', 'A'), ...people.map((_, index) => song(`s${index}`, `Song ${index}`))],
      people: [person('hub', 'The Hub'), ...people],
      credits: [
        credit('a', 'hub', 'producer'),
        ...people.map((_, index) => credit(`s${index}`, 'hub', 'songwriter')),
        ...people.map((_, index) => credit(`s${index}`, `p${index}`, 'mixing')),
      ],
    })

    const layout = layoutOrbit(build(snapshot), { type: 'person', id: 'person-hub' }, stage)

    const second = layout.nodes.filter((node) => node.depth === 2)
    expect(second).toHaveLength(maxSecondRing + 1)
    const more = second.find((node) => node.kind === 'more')!
    expect(more.label).toBe('+15 more')
    expect(more.moreCount).toBe(15)
  })

  it('NFR_MOTION_01 moves an angle the short way round the circle', () => {
    const nearlyFull = Math.PI * 2 - 0.1

    expect(lerpAngle(nearlyFull, 0.1, 0.5)).toBeCloseTo(Math.PI * 2, 5)
    expect(lerpAngle(0.1, nearlyFull, 0.5)).toBeCloseTo(0, 5)
    expect(lerpAngle(1, 2, 0)).toBe(1)
    expect(lerpAngle(1, 2, 1)).toBeCloseTo(2, 5)
  })

  it('FR_VIEW_01 keeps the same key for the same nodes when only the stage size changes', () => {
    const ws = build()
    const ref = { type: 'song', id: 'song-redbone' } as const

    const a = layoutOrbit(ws, ref, stage)
    const b = layoutOrbit(ws, ref, { width: 500, height: 700 })

    expect(a.key).toBe(b.key)
    expect(a.radius).not.toBe(b.radius)
  })

  it('FR_VIEW_01 reads and writes the focus parameter, and refuses a value it does not know', () => {
    expect(parseFocus('song:abc')).toEqual({ type: 'song', id: 'abc' })
    expect(parseFocus('person:abc')).toEqual({ type: 'person', id: 'abc' })
    expect(parseFocus('album:abc')).toBeNull()
    expect(parseFocus('song:')).toBeNull()
    expect(parseFocus(null)).toBeNull()
    expect(focusParam({ type: 'person', id: 'abc' })).toBe('person:abc')
    expect(nodeKey({ type: 'person', id: 'abc' })).toBe('p:abc')
  })

  it('FR_VIEW_01 places polar coordinates with zero pointing up', () => {
    const [x, y] = polarToXY(100, 0)
    expect(x).toBeCloseTo(0)
    expect(y).toBeCloseTo(-100)
    const [rx] = polarToXY(100, Math.PI / 2)
    expect(rx).toBeCloseTo(100)
  })

  it('FR_GRAPH_04 says a centre song has no credits to show, once it is not loading', () => {
    const layout = layoutOrbit(build(), { type: 'song', id: 'song-tg' }, stage)

    expect(layout.noCredits).toBe(true)
    expect(layout.nodes).toHaveLength(1)
  })
})
