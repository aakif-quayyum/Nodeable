import type { CreditRoleKey } from '../../app/creditRoles.ts'
import type { SongStatus } from './graphEvents.ts'

/**
 * What the constellation draws. The workspace says what is true; this is the same data shaped for a force simulation:
 * one node per song and per person, one link per song-and-person pair that has at least one credit.
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
  /** Deezer's album image ID, the cover chain's third step; null until a preview is found. */
  artDeezer?: string | null
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

export const songNodeId = (mbid: string) => `song:${mbid}`
export const personNodeId = (mbid: string) => `person:${mbid}`
