import { personNodeId, songNodeId, type DerivedGraph, type GraphLink, type GraphNode } from '../graph/graphModel.ts'
import { primaryRole, type Workspace } from '../graph/workspaceModel.ts'

/**
 * Above this many nodes the constellation is drawn on a canvas instead of as SVG elements (spec section 12, decision
 * 0020). The spec started at 250; the measurement of pull request 4 (spec section 12, "Constellation threshold") put
 * the SVG renderer below 30 frames a second from about 80 nodes while the canvas held 127 at 1000, so it is 60.
 */
export const CANVAS_THRESHOLD = 60

export type ConstellationRenderer = 'svg' | 'canvas'

export function rendererFor(nodeCount: number): ConstellationRenderer {
  return nodeCount > CANVAS_THRESHOLD ? 'canvas' : 'svg'
}

/**
 * What the stage keeps free for its own overlays when the picture is fitted: the caption above and the legend below
 * (two rows of chips on a narrow desktop stage, three on a phone), in CSS pixels.
 */
export function fitMargins(stageWidth: number): { top: number; bottom: number } {
  return stageWidth < 560 ? { top: 96, bottom: 108 } : { top: 40, bottom: 66 }
}

/** A record's radius in the constellation, and how big a person is for the songs they are on (FR-HUB-01). */
export const constellationSongRadius = 14
const personRadiusFor = (songs: number) => Math.min(20, 3 + songs * 2)

export interface Constellation extends DerivedGraph {
  /** A node's neighbours (and itself): what lights up when it is looked at. */
  neighbours: ReadonlyMap<string, ReadonlySet<string>>
}

/**
 * The workspace as the force layout and both renderers see it: one node for each song and each person that the filters,
 * the pending removals and the hidden people leave, and one link for each song-and-person pair that has a credit. It is
 * built from the same `Workspace` as the orbit, the cards and the Text view, so the views agree (NFR-A11Y-01).
 */
export function constellationOf(ws: Workspace): Constellation {
  const nodes: GraphNode[] = ws.songs.map((song) => ({
    kind: 'song',
    id: songNodeId(song.mbid),
    r: constellationSongRadius,
    mbid: song.mbid,
    title: song.title,
    artist: song.artist,
    year: song.year,
    status: song.creditsStatus,
    artRelease: song.artReleaseMbid ?? null,
    artGroup: song.artReleaseGroupMbid ?? null,
    artDeezer: song.deezerCoverMd5 ?? null,
  }))

  const links: GraphLink[] = []
  for (const person of ws.people) {
    nodes.push({
      kind: 'person',
      id: personNodeId(person.mbid),
      r: personRadiusFor(person.songs.length),
      mbid: person.mbid,
      name: person.name,
      songs: person.songs.length,
      roles: person.roles,
      isHub: person.songs.length >= 2,
    })
    for (const songMbid of person.songs) {
      links.push({
        id: `${songNodeId(songMbid)}|${personNodeId(person.mbid)}`,
        source: songNodeId(songMbid),
        target: personNodeId(person.mbid),
        roles: [primaryRole(person, songMbid)],
      })
    }
  }

  const neighbours = new Map<string, Set<string>>(nodes.map((node) => [node.id, new Set([node.id])]))
  for (const link of links) {
    neighbours.get(link.source)?.add(link.target)
    neighbours.get(link.target)?.add(link.source)
  }

  return { nodes, links, songCount: ws.songs.length, personCount: ws.people.length, neighbours }
}
