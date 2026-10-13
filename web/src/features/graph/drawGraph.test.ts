import { describe, expect, it } from 'vitest'
import { creditRoles, creditRoleStyles, type CreditRoleKey } from '../../app/creditRoles.ts'
import { drawGraph, ENTER_MS, LABEL_ALL_LIMIT, labelledNodes, type Palette, type Scene } from './drawGraph.ts'
import type { GraphLink, GraphNode, PersonNode, SongNode } from './graphModel.ts'

const palette: Palette = {
  background: '#000',
  text: '#fff',
  link: '#888',
  song: '#0A0A0B',
  selected: '#fa0',
  roles: Object.fromEntries(creditRoles.map((role) => [role, creditRoleStyles[role].colors.dark])) as Record<
    CreditRoleKey,
    string
  >,
}

const song = (id: string, x = 0, y = 0): SongNode => ({
  kind: 'song',
  id: `song:${id}`,
  mbid: id,
  title: `Song ${id}`,
  artist: 'A',
  year: null,
  status: 'complete',
  r: 10,
  x,
  y,
})

const person = (id: string, isHub = false, x = 0, y = 0): PersonNode => ({
  kind: 'person',
  id: `person:${id}`,
  mbid: id,
  name: `Person ${id}`,
  songs: isHub ? 2 : 1,
  roles: ['producer'],
  isHub,
  r: 6,
  x,
  y,
})

function scene(overrides: Partial<Scene> & { nodes: GraphNode[] }): Scene {
  return {
    width: 400,
    height: 300,
    dpr: 1,
    transform: { x: 0, y: 0, k: 1 },
    links: [],
    hoveredId: null,
    selectedId: null,
    born: new Map(),
    now: 1000,
    palette,
    personCount: overrides.nodes.filter((node) => node.kind === 'person').length,
    ...overrides,
  }
}

/** A canvas context that records which shapes and texts were drawn. */
function recordingContext() {
  const calls = { rect: 0, arc: 0, text: [] as string[], alphas: [] as number[] }
  const noop = () => undefined
  const context = {
    setTransform: noop,
    clearRect: noop,
    fillRect: noop,
    save: noop,
    restore: noop,
    translate: noop,
    scale: noop,
    beginPath: noop,
    moveTo: noop,
    lineTo: noop,
    stroke: noop,
    fill: noop,
    setLineDash: noop,
    rect: () => void (calls.rect += 1),
    arc: () => void (calls.arc += 1),
    fillText: (text: string) => void calls.text.push(text),
    strokeText: noop,
    measureText: (text: string) => ({ width: text.length * 6 }),
    set globalAlpha(value: number) {
      calls.alphas.push(value)
    },
  }
  return { context: context as unknown as CanvasRenderingContext2D, calls }
}

describe('labelledNodes', () => {
  const many = Array.from({ length: LABEL_ALL_LIMIT + 1 }, (_, index) => person(`p${index}`, index === 0))

  it('FR_HUB_01 labels every node while the graph has 300 people or fewer', () => {
    const nodes = [song('s'), ...many.slice(0, LABEL_ALL_LIMIT)]

    expect(labelledNodes(scene({ nodes }))).toHaveLength(nodes.length)
  })

  it('NFR_PERF_03 above 300 people labels songs, hubs and the hovered node only', () => {
    const nodes: GraphNode[] = [song('s'), ...many]

    const labelled = labelledNodes(scene({ nodes, hoveredId: 'person:p5' })).map((node) => node.id)

    expect(labelled.sort()).toEqual(['person:p0', 'person:p5', 'song:s'].sort())
  })

  it('NFR_PERF_03 zoomed far out labels only the hovered and the selected node', () => {
    const nodes = [song('s'), person('a'), person('b')]

    const labelled = labelledNodes(
      scene({ nodes, transform: { x: 0, y: 0, k: 0.2 }, hoveredId: 'person:a', selectedId: 'song:s' }),
    )

    expect(labelled.map((node) => node.id).sort()).toEqual(['person:a', 'song:s'])
  })
})

describe('drawGraph', () => {
  it('FR_VIEW_02 leaves out a name that would be drawn over a more important one', () => {
    const { context, calls } = recordingContext()
    // The song and a person on the same spot: the song's name is placed first, so the person's is left out.
    const nodes = [song('s', 0, 0), person('a', true, 0, 0)]

    drawGraph(context, scene({ nodes }))

    expect(calls.text).toEqual(['Song s'])
  })

  it('FR_VIEW_02 steps back everything outside the focus and names the focused node’s neighbours', () => {
    const { context, calls } = recordingContext()
    const nodes = [song('s', 0, 0), person('a', false, 200, 0), person('b', false, 400, 0)]

    drawGraph(context, scene({ nodes, hoveredId: 'person:a', focusIds: new Set(['person:a', 'song:s']) }))

    // Person b is outside the focus: it is drawn at the stepped-back alpha.
    expect(calls.alphas).toContain(0.12)
    expect(calls.text).toEqual(expect.arrayContaining(['Song s', 'Person a']))
  })

  it('FR_HUB_01 draws a song as a record (a disc, its label and the hole) and a person as one disc', () => {
    const { context, calls } = recordingContext()

    drawGraph(context, scene({ nodes: [song('s1'), song('s2'), person('a'), person('b'), person('c')] }))

    expect(calls.rect).toBe(0)
    expect(calls.arc).toBe(2 * 3 + 3)
  })

  it('FR_GRAPH_02 fades a new node in over 300 ms and reports that it is still animating', () => {
    const { context, calls } = recordingContext()
    const born = new Map([['person:a', 1000 - ENTER_MS / 2]])

    const animating = drawGraph(context, scene({ nodes: [person('a')], born }))

    expect(animating).toBe(true)
    expect(calls.alphas).toContain(0.5)
  })

  it('FR_GRAPH_02 stops animating once the fade is over, so a resting graph asks for no more frames', () => {
    const { context } = recordingContext()
    const born = new Map([['person:a', 1000 - ENTER_MS - 1]])

    expect(drawGraph(context, scene({ nodes: [person('a')], born }))).toBe(false)
  })

  it('FR_HUB_01 draws a link only when both of its nodes exist', () => {
    const { context } = recordingContext()
    const links: GraphLink[] = [{ id: 'l', source: 'song:s', target: 'person:gone', roles: ['producer'] }]

    expect(() => drawGraph(context, scene({ nodes: [song('s')], links }))).not.toThrow()
  })
})
