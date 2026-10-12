import { describe, expect, it } from 'vitest'
import type { GraphSnapshot } from './graphEvents.ts'
import { deriveGraph, personNodeId, songNodeId } from './graphModel.ts'

const redbone = '7408f11c-6c4e-41e5-b81b-6a15bf6cb268'
const america = 'dc316772-0ef2-4b31-9ee5-c0b3cf1a1c1e'
const donald = '1ba09d36-5d9d-4a23-8b52-2f2e4d5b1b11'
const ludwig = '9a7f3a5e-1d0f-4d1a-93f2-6e0a91b6f4c2'
const removed = 'aaaaaaaa-0000-4000-8000-000000000000'

function snapshot(): GraphSnapshot {
  return {
    id: '7c1e0000-0000-4000-8000-000000000000',
    name: 'Untitled graph',
    seq: 1,
    songs: [
      { mbid: redbone, title: 'Redbone', artist: 'Childish Gambino', year: 2016, creditsStatus: 'complete', addedAt: '2026-10-12T09:09:45Z' },
      { mbid: america, title: 'This Is America', artist: 'Childish Gambino', year: 2018, creditsStatus: 'partial', addedAt: '2026-10-12T09:10:00Z' },
    ],
    people: [
      { mbid: donald, name: 'Donald Glover' },
      { mbid: ludwig, name: 'Ludwig Göransson' },
    ],
    credits: [
      { songMbid: redbone, personMbid: donald, role: 'songwriter', detail: '', level: 'recording' },
      { songMbid: redbone, personMbid: donald, role: 'vocal', detail: '', level: 'recording' },
      { songMbid: america, personMbid: donald, role: 'songwriter', detail: '', level: 'recording' },
      { songMbid: redbone, personMbid: ludwig, role: 'producer', detail: '', level: 'recording' },
    ],
    hubs: [],
    crawl: { queued: 0, done: 0, failed: 0, etaSeconds: 0 },
  }
}

describe('deriveGraph', () => {
  it('FR_HUB_01 makes a node for every song and every credited person, and a link for each pair with a credit', () => {
    const graph = deriveGraph(snapshot())

    expect(graph.songCount).toBe(2)
    expect(graph.personCount).toBe(2)
    expect(graph.nodes.map((node) => node.id)).toEqual([
      songNodeId(redbone),
      songNodeId(america),
      personNodeId(donald),
      personNodeId(ludwig),
    ])
    expect(graph.links.map((link) => `${link.source} > ${link.target}`)).toEqual([
      `song:${redbone} > person:${donald}`,
      `song:${america} > person:${donald}`,
      `song:${redbone} > person:${ludwig}`,
    ])
  })

  it('FR_HUB_01 sizes people by the number of songs they are credited on and marks those on two or more as hubs', () => {
    const people = deriveGraph(snapshot()).nodes.filter((node) => node.kind === 'person')
    const [glover, goransson] = people

    expect(glover).toMatchObject({ songs: 2, isHub: true })
    expect(goransson).toMatchObject({ songs: 1, isHub: false })
    expect(glover!.r).toBeGreaterThan(goransson!.r)
  })

  it("FR_HUB_01 lists a person's roles most frequent first and counts a song once however many roles it has", () => {
    const glover = deriveGraph(snapshot()).nodes.find((node) => node.id === personNodeId(donald))

    // songwriter is on two songs, vocal on one.
    expect(glover).toMatchObject({ kind: 'person', roles: ['songwriter', 'vocal'], songs: 2 })
  })

  it('FR_HUB_01 ignores credits of songs that are not in the graph', () => {
    const data = snapshot()
    data.credits.push({ songMbid: removed, personMbid: ludwig, role: 'mixing', detail: '', level: 'recording' })
    data.songs = data.songs.slice(0, 1)

    const graph = deriveGraph(data)
    const goransson = graph.nodes.find((node) => node.id === personNodeId(ludwig))

    expect(goransson).toMatchObject({ songs: 1, roles: ['producer'] })
    expect(graph.links.some((link) => link.source === songNodeId(removed))).toBe(false)
  })

  it('NFR_PERF_03 gives the same nodes in the same order for the same snapshot', () => {
    expect(deriveGraph(snapshot())).toEqual(deriveGraph(snapshot()))
  })
})
