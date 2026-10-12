import type { components } from '../../api/schema'

type Schemas = components['schemas']

export type GraphSnapshot = Schemas['GraphSnapshot']
export type GraphSong = Schemas['GraphSongItem']
export type GraphCredit = Schemas['GraphCreditItem']
export type GraphPerson = Schemas['PersonItem']
export type GraphHub = Schemas['HubItem']
export type SongStatus = Schemas['SongStatus']

/**
 * What the hub sends (spec section 9). The shapes are not in the OpenAPI document, which describes REST only, so
 * they are written out here. `type` is the hub method name: the connection adds it to the payload, so one value
 * says both which event this is and what it carries.
 */
// LEARN: LG-03 discriminated-union | A union whose members share a literal `type` field: a switch on `type` narrows the value to exactly one member, and the `never` check at the end makes the compiler fail when a new event is added and this switch forgets it (JavaScript would just fall through)
export type GraphEvent =
  | {
      type: 'CreditsResolved'
      seq: number
      songMbid: string
      people: GraphPerson[]
      credits: Omit<GraphCredit, 'songMbid'>[]
    }
  | { type: 'SongStatusChanged'; seq: number; songMbid: string; creditsStatus: SongStatus }
  | { type: 'HubsUpdated'; seq: number; hubs: GraphHub[] }
  | { type: 'CrawlProgress'; seq: number; queued: number; done: number; failed: number; etaSeconds: number }
  | { type: 'CrawlFailed'; seq: number; songMbid: string; reason: string }

export const graphEventTypes = [
  'CreditsResolved',
  'SongStatusChanged',
  'HubsUpdated',
  'CrawlProgress',
  'CrawlFailed',
] as const satisfies readonly GraphEvent['type'][]

function creditKey(credit: { songMbid: string; personMbid: string; role: string; detail: string }) {
  return `${credit.songMbid}|${credit.personMbid}|${credit.role}|${credit.detail}`
}

/**
 * Applies one hub event to a snapshot and returns the new snapshot; the snapshot passed in is never changed.
 *
 * The rules are the ones of spec section 9: an event whose `seq` is at or below the snapshot's is already part of
 * it and is ignored, and applying any event twice gives the same graph as applying it once, so the caller may
 * replay events without tracking which it has seen (FR-GRAPH-02, FR-GRAPH-03).
 */
export function applyGraphEvent(snapshot: GraphSnapshot, event: GraphEvent): GraphSnapshot {
  if (event.seq <= snapshot.seq) {
    return snapshot
  }

  switch (event.type) {
    case 'CreditsResolved': {
      const known = new Set(snapshot.people.map((person) => person.mbid))
      const newPeople = event.people.filter((person) => {
        if (known.has(person.mbid)) return false
        known.add(person.mbid)
        return true
      })

      // The merge key is (song, person, role, detail), the same one the server de-duplicates on. A credit that
      // arrives again replaces the one held (its level may be closer to the recording now) instead of being added.
      const incoming = new Map<string, GraphCredit>()
      for (const credit of event.credits) {
        const full = { ...credit, songMbid: event.songMbid }
        incoming.set(creditKey(full), full)
      }
      const kept = snapshot.credits.filter((credit) => !incoming.has(creditKey(credit)))

      return {
        ...snapshot,
        people: newPeople.length === 0 ? snapshot.people : [...snapshot.people, ...newPeople],
        credits: [...kept, ...incoming.values()],
      }
    }

    case 'SongStatusChanged':
      return {
        ...snapshot,
        songs: snapshot.songs.map((song) =>
          song.mbid === event.songMbid ? { ...song, creditsStatus: event.creditsStatus } : song,
        ),
      }

    case 'HubsUpdated':
      return { ...snapshot, hubs: event.hubs }

    case 'CrawlProgress':
      return {
        ...snapshot,
        crawl: { queued: event.queued, done: event.done, failed: event.failed, etaSeconds: event.etaSeconds },
      }

    // A failed job changes no data of the graph: the song keeps what it has, and the reason is shown beside it.
    case 'CrawlFailed':
      return snapshot

    default: {
      const unreachable: never = event
      return unreachable
    }
  }
}

/**
 * A snapshot with the events newer than it applied, oldest first. Used when a snapshot arrives after events did:
 * the events are replayed on top of it, and the ones it already contains are dropped by `applyGraphEvent`.
 */
export function replayEvents(snapshot: GraphSnapshot, events: readonly GraphEvent[]): GraphSnapshot {
  return [...events].sort((a, b) => a.seq - b.seq).reduce(applyGraphEvent, snapshot)
}

/** True when a song has neither a producer nor a songwriter credit (FR-GRAPH-04). A song still loading is not judged. */
export function hasIncompleteCredits(snapshot: GraphSnapshot, song: GraphSong): boolean {
  if (song.creditsStatus === 'loading') {
    return false
  }
  return !snapshot.credits.some(
    (credit) => credit.songMbid === song.mbid && (credit.role === 'producer' || credit.role === 'songwriter'),
  )
}
