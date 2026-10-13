import { describe, expect, it } from 'vitest'
import { creditRoles, type CreditRoleKey } from '../../app/creditRoles.ts'
import { credit, person, sampleSnapshot, snapshotOf, song } from '../../test/workspaceFixtures.ts'
import { buildWorkspace } from '../graph/workspaceModel.ts'
import { CANVAS_THRESHOLD, constellationOf, rendererFor } from './constellationModel.ts'

const all: ReadonlySet<CreditRoleKey> = new Set(creditRoles)
const build = (hidden: string[] = [], roles: ReadonlySet<CreditRoleKey> = all) =>
  buildWorkspace(sampleSnapshot(), { roles, removed: new Set(), hidden: new Set(hidden) })

describe('constellation model', () => {
  it('FR_VIEW_02 has a node for each song and each person and a link for each credited song and person', () => {
    const graph = constellationOf(build())

    expect(graph.songCount).toBe(3)
    expect(graph.personCount).toBe(4)
    expect(graph.nodes.filter((node) => node.kind === 'song')).toHaveLength(3)
    // Donald and Ludwig are on two songs, Collins and Riley on one and two: 2 + 2 + 1 + 2 links.
    expect(graph.links).toHaveLength(2 + 2 + 1 + 2)
  })

  it('FR_HUB_01 sizes a person by the songs they are on and marks a person on two or more as a connector', () => {
    const graph = constellationOf(build())
    const people = new Map(graph.nodes.flatMap((node) => (node.kind === 'person' ? [[node.mbid, node] as const] : [])))

    expect(people.get('person-donald')!.isHub).toBe(true)
    expect(people.get('person-collins')!.isHub).toBe(false)
    expect(people.get('person-donald')!.r).toBeGreaterThan(people.get('person-collins')!.r)
  })

  it('FR_VIEW_03 leaves out a hidden person and what the role filter takes away, as the orbit does', () => {
    const hidden = constellationOf(build(['person-donald']))
    expect(hidden.nodes.some((node) => node.id === 'person:person-donald')).toBe(false)

    const mixing = constellationOf(build([], new Set<CreditRoleKey>(['mixing'])))
    expect(mixing.personCount).toBe(1)
    expect(mixing.links.every((link) => link.roles[0] === 'mixing')).toBe(true)
  })

  it('FR_VIEW_02 knows each node’s neighbours, for lighting them up', () => {
    const graph = constellationOf(build())

    expect([...graph.neighbours.get('person:person-collins')!].sort()).toEqual(['person:person-collins', 'song:song-redbone'])
    expect(graph.neighbours.get('song:song-tg')!.size).toBe(1)
  })

  it('NFR_PERF_03 draws SVG up to the threshold and a canvas above it', () => {
    expect(rendererFor(CANVAS_THRESHOLD)).toBe('svg')
    expect(rendererFor(CANVAS_THRESHOLD + 1)).toBe('canvas')
  })

  it('FR_VIEW_02 passes the cover ids on so the records can show covers', () => {
    const withCover = snapshotOf({
      songs: [song('a', 'A', { artReleaseMbid: 'r-1', artReleaseGroupMbid: 'rg-1' })],
      people: [person('x', 'X')],
      credits: [credit('a', 'x', 'producer')],
    })
    const graph = constellationOf(buildWorkspace(withCover, { roles: all, removed: new Set(), hidden: new Set() }))

    expect(graph.nodes[0]).toMatchObject({ kind: 'song', artRelease: 'r-1', artGroup: 'rg-1' })
  })
})
