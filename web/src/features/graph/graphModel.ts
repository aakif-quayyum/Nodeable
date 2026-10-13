import { scaleSqrt } from 'd3-scale'
import { creditRoles, type CreditRoleKey } from '../../app/creditRoles.ts'
import type { GraphSnapshot, SongStatus } from './graphEvents.ts'

/**
 * What the canvas draws. The snapshot says what is true; this is the same data shaped for a force simulation: one node
 * per song and per person, one link per song-and-person pair that has at least one credit.
 */
interface NodeBase {
  /** Stable across snapshots: `song:<mbid>` or `person:<mbid>`, so the layout can keep a node where it was. */
  id: string
  /** Radius in pixels at zoom 1. A person grows with the number of songs they are credited on (FR-HUB-01). */
  r: number
  // Filled in by the layout, so the simulation can move the nodes in place. Optional because a node has no position
  // until it has been placed.
  x?: number
  y?: number
  vx?: number
  vy?: number
}

export interface SongNode extends NodeBase {
  kind: 'song'
  mbid: string
  title: string
  artist: string
  year: number | null
  status: SongStatus
  /** Where the cover is looked up (FR-ART-01); unknown until the recording has been fetched with its releases. */
  artRelease?: string | null
  artGroup?: string | null
}

export interface PersonNode extends NodeBase {
  kind: 'person'
  mbid: string
  name: string
  /** The number of graph songs the person is credited on. */
  songs: number
  /** The roles the person has in the graph, most frequent first. */
  roles: CreditRoleKey[]
  isHub: boolean
}

export type GraphNode = SongNode | PersonNode

export interface GraphLink {
  id: string
  /** Node ids. */
  source: string
  target: string
  roles: CreditRoleKey[]
}

export interface DerivedGraph {
  nodes: GraphNode[]
  links: GraphLink[]
  songCount: number
  personCount: number
}

export const songRadius = 10
const personRadius = scaleSqrt().domain([1, 50]).range([5, 18]).clamp(true)

/**
 * The snapshot with only the credits of the active roles (FR-HUB-03). Hubs are not read from the snapshot afterwards:
 * they are derived again from what is left, so a person credited on two songs only as a vocalist stops being a hub
 * while vocals are off. With every role active the same object is returned.
 */
export function filterCredits(snapshot: GraphSnapshot, active: ReadonlySet<CreditRoleKey>): GraphSnapshot {
  if (creditRoles.every((role) => active.has(role))) return snapshot
  return { ...snapshot, credits: snapshot.credits.filter((credit) => active.has(credit.role)) }
}

/** The people credited on two or more songs, most songs first (FR-HUB-02). */
export function hubsOf(graph: DerivedGraph): PersonNode[] {
  return graph.nodes.filter((node): node is PersonNode => node.kind === 'person' && node.isHub)
}

export const songNodeId = (mbid: string) => `song:${mbid}`
export const personNodeId = (mbid: string) => `person:${mbid}`

/** A person's roles on the graph's songs, most frequent first; a tie keeps the order of the role list. */
function rolesByFrequency(roles: readonly CreditRoleKey[]): CreditRoleKey[] {
  const counts = new Map<CreditRoleKey, number>()
  for (const role of roles) counts.set(role, (counts.get(role) ?? 0) + 1)
  return [...counts.keys()].sort(
    (a, b) => counts.get(b)! - counts.get(a)! || creditRoles.indexOf(a) - creditRoles.indexOf(b),
  )
}

/**
 * The graph the canvas draws, from a snapshot. Only credits of songs that are in the graph count, as in the list view.
 * The same snapshot always gives the same nodes and links in the same order.
 */
export function deriveGraph(snapshot: GraphSnapshot): DerivedGraph {
  const songs = new Map(snapshot.songs.map((song) => [song.mbid, song]))
  const names = new Map(snapshot.people.map((person) => [person.mbid, person.name]))

  const byPerson = new Map<string, { songs: Set<string>; roles: CreditRoleKey[]; bySong: Map<string, CreditRoleKey[]> }>()
  for (const credit of snapshot.credits) {
    if (!songs.has(credit.songMbid)) continue
    let person = byPerson.get(credit.personMbid)
    if (person === undefined) {
      person = { songs: new Set(), roles: [], bySong: new Map() }
      byPerson.set(credit.personMbid, person)
    }
    person.songs.add(credit.songMbid)
    person.roles.push(credit.role)
    const forSong = person.bySong.get(credit.songMbid)
    if (forSong === undefined) person.bySong.set(credit.songMbid, [credit.role])
    else forSong.push(credit.role)
  }

  const nodes: GraphNode[] = snapshot.songs.map((song) => ({
    kind: 'song',
    id: songNodeId(song.mbid),
    r: songRadius,
    mbid: song.mbid,
    title: song.title,
    artist: song.artist,
    year: song.year,
    status: song.creditsStatus,
  }))

  const links: GraphLink[] = []
  const people = [...byPerson].sort(
    ([aId, a], [bId, b]) => b.songs.size - a.songs.size || (names.get(aId) ?? '').localeCompare(names.get(bId) ?? ''),
  )

  for (const [mbid, person] of people) {
    nodes.push({
      kind: 'person',
      id: personNodeId(mbid),
      r: personRadius(person.songs.size),
      mbid,
      name: names.get(mbid) ?? 'Unknown person',
      songs: person.songs.size,
      roles: rolesByFrequency(person.roles),
      isHub: person.songs.size >= 2,
    })

    for (const [songMbid, roles] of person.bySong) {
      links.push({
        id: `${songNodeId(songMbid)}|${personNodeId(mbid)}`,
        source: songNodeId(songMbid),
        target: personNodeId(mbid),
        roles: rolesByFrequency(roles),
      })
    }
  }

  return { nodes, links, songCount: snapshot.songs.length, personCount: people.length }
}
