import { describe, expect, it } from 'vitest'
import { creditRoles, type CreditRoleKey } from '../../app/creditRoles.ts'
import { credit, person, sampleSnapshot, snapshotOf, song } from '../../test/workspaceFixtures.ts'
import { buildWorkspace } from '../graph/workspaceModel.ts'
import { focusParam, layoutOrbit, lerpAngle, maxSecondRing, nodeKey, parseFocus, polarToXY, rootRef } from './orbitLayout.ts'

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
    expect(nodeKey(rootRef)).toBe('g:')
  })

  it('FR_VIEW_01 places polar coordinates with zero pointing up', () => {
    const [x, y] = polarToXY(100, 0)
    expect(x).toBeCloseTo(0)
    expect(y).toBeCloseTo(-100)
    const [rx] = polarToXY(100, Math.PI / 2)
    expect(rx).toBeCloseTo(100)
  })

  it('FR_GRAPH_04 says a centre song has no credits at all, once it is not loading', () => {
    const layout = layoutOrbit(build(), { type: 'song', id: 'song-tg' }, stage)

    expect(layout.empty).toBe('noCredits')
    expect(layout.nodes).toHaveLength(1)
    // The cover takes the middle of the stage: the record is not drawn, and there is no ring to guide the eye round.
    expect(layout.nodes[0]!.size).toBeLessThan(1)
    expect(layout.guides).toEqual([])
  })

  it('FR_GRAPH_04 tells "nothing to show with these filters" from "no credits"', () => {
    const ws = buildWorkspace(sampleSnapshot(), { roles: new Set<CreditRoleKey>(['vocal']), removed: new Set(), hidden: new Set() })

    expect(layoutOrbit(ws, { type: 'song', id: 'song-redbone' }, stage).empty).toBe('filtered')
    expect(layoutOrbit(ws, { type: 'song', id: 'song-tg' }, stage).empty).toBe('noCredits')
  })

  it('FR_VIEW_04 centres on the whole graph: every song on the first ring, their people on the second', () => {
    const layout = layoutOrbit(build(), rootRef, stage)

    expect(layout.nodes[0]).toMatchObject({ id: 'g:', kind: 'graph', depth: 0 })
    expect(layout.nodes.filter((node) => node.depth === 1).map((node) => node.id)).toEqual(['s:song-redbone', 's:song-mym', 's:song-tg'])
    // Donald, Ludwig, Collins and Riley are on Redbone, so they hang from it; Me and Your Mama reaches them by cross-links.
    expect(layout.nodes.filter((node) => node.depth === 2).map((node) => node.id).sort()).toEqual([
      'p:person-collins',
      'p:person-donald',
      'p:person-ludwig',
      'p:person-riley',
    ])
    expect(layout.crossLinks.filter((link) => link.source === 's:song-mym')).toHaveLength(3)
    // The hub's links to its songs are plain: they carry no role.
    expect(layout.links.filter((link) => link.source === 'g:').every((link) => link.role === 'plain')).toBe(true)
    expect(layout.arcs).toEqual([])
  })

  it('FR_VIEW_04 shows songs that share nobody side by side, each with its own people', () => {
    const snapshot = snapshotOf({
      songs: [song('beautiful', 'Beautiful Things'), song('sawadika', 'SaWaDiKa')],
      people: [person('a', 'Benson Boone'), person('b', 'Jack LaFrantz'), person('c', 'Rex Orange'), person('d', 'Sara Mac')],
      credits: [credit('beautiful', 'a', 'songwriter'), credit('beautiful', 'b', 'producer'), credit('sawadika', 'c', 'songwriter'), credit('sawadika', 'd', 'producer')],
    })

    const layout = layoutOrbit(build(snapshot), rootRef, stage)

    expect(layout.nodes.filter((node) => node.depth === 1).map((node) => node.label)).toEqual(['Beautiful Things', 'SaWaDiKa'])
    expect(layout.nodes.filter((node) => node.depth === 2)).toHaveLength(4)
    expect(layout.crossLinks).toEqual([])
  })

  it('FR_VIEW_01 fits the tree to the stage: nothing outside it, a bigger stage a bigger tree, and no name under 12 px', () => {
    const ws = build()
    const inside = (layout: ReturnType<typeof layoutOrbit>, size: { width: number; height: number }) =>
      layout.nodes.every((node) => {
        const [x, y] = polarToXY(node.radius, node.angle)
        const left = layout.origin.x + x - node.size
        const right = layout.origin.x + x + node.size
        const above = layout.origin.y + y - node.size
        const below = layout.origin.y + y + node.size
        return left >= 0 && right <= size.width && above >= 0 && below <= size.height
      })

    const sizes = [
      { width: 1100, height: 760 },
      { width: 760, height: 460 },
      { width: 380, height: 520 },
    ]
    for (const size of sizes) {
      for (const centre of [rootRef, { type: 'song', id: 'song-redbone' } as const, { type: 'person', id: 'person-donald' } as const]) {
        const layout = layoutOrbit(ws, centre, size)
        expect(inside(layout, size), `${centre.type} on ${size.width}x${size.height}`).toBe(true)
        expect(layout.fontScale).toBeGreaterThanOrEqual(1)
      }
    }

    const small = layoutOrbit(ws, { type: 'song', id: 'song-redbone' }, { width: 760, height: 460 })
    const large = layoutOrbit(ws, { type: 'song', id: 'song-redbone' }, { width: 1500, height: 900 })
    expect(large.radius).toBeGreaterThan(small.radius * 1.3)
    expect(large.scale).toBeGreaterThan(small.scale)
  })

  it('FR_VIEW_01 shortens long names to keep the tree large, and never draws a name under 12 px', () => {
    const people = Array.from({ length: 12 }, (_, index) => person(`p${index}`, `A Person With A Very Long Name Number ${index}`))
    const snapshot = snapshotOf({
      songs: [song('a', 'A'), song('b', 'B')],
      people,
      credits: people.map((_, index) => credit(index < 6 ? 'a' : 'b', `p${index}`, 'songwriter')),
    })
    const ws = build(snapshot)
    const names = (layout: ReturnType<typeof layoutOrbit>) => layout.nodes.filter((node) => node.depth === 2).map((node) => node.label)

    const wide = layoutOrbit(ws, rootRef, { width: 1100, height: 760 })
    const narrow = layoutOrbit(ws, rootRef, { width: 320, height: 420 })

    // Cut with an ellipsis to the room each node has, and left off where there is none; the full name is still the
    // node's accessible name and its tooltip. A small stage gives less room than a large one.
    expect(names(wide).every((name) => name === '' || (name.length <= 28 && name.endsWith('…')))).toBe(true)
    expect(names(wide).some((name) => name !== '')).toBe(true)
    expect(Math.max(...names(narrow).map((name) => name.length))).toBeLessThan(Math.max(...names(wide).map((name) => name.length)))
    expect(wide.fontScale).toBeGreaterThanOrEqual(1)
    expect(narrow.fontScale).toBe(1)
  })
})
