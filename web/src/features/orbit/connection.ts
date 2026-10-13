import type { Workspace } from '../graph/workspaceModel.ts'
import type { NodeRef } from './orbitLayout.ts'

/**
 * The songs that the centre can be reached from by following credits: a song reaches the people on it, a person the
 * songs they are on. What is left over are songs that share nobody with the centre's part of the graph.
 */
export function connectedSongs(ws: Workspace, centre: NodeRef): Set<string> {
  const songs = new Set<string>()
  const people = new Set<string>()
  const queue: NodeRef[] = centre.type === 'graph' ? [] : [centre]

  while (queue.length > 0) {
    const next = queue.pop()!
    if (next.type === 'song') {
      if (songs.has(next.id)) continue
      songs.add(next.id)
      for (const person of ws.peopleBySong.get(next.id) ?? []) queue.push({ type: 'person', id: person.mbid })
    } else if (next.type === 'person') {
      if (people.has(next.id)) continue
      people.add(next.id)
      for (const mbid of ws.personById.get(next.id)?.songs ?? []) queue.push({ type: 'song', id: mbid })
    }
  }
  return songs
}

/** How many songs of the graph have no credit in common, directly or through others, with the centre (0 for the whole graph). */
export function songsNotConnected(ws: Workspace, centre: NodeRef): number {
  if (centre.type === 'graph') return 0
  const reached = connectedSongs(ws, centre)
  return ws.songs.filter((song) => !reached.has(song.mbid)).length
}
