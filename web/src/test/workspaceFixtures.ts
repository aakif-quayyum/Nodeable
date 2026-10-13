import type { components } from '../api/schema'

type Snapshot = components['schemas']['GraphSnapshot']
type Song = components['schemas']['GraphSongItem']
type Credit = components['schemas']['GraphCreditItem']
type Person = components['schemas']['PersonItem']

/** Small builders for graph data in tests: ids are readable (`song-redbone`), which keeps assertions legible. */
export function song(key: string, title: string, overrides: Partial<Song> = {}): Song {
  return {
    mbid: `song-${key}`,
    title,
    artist: 'Childish Gambino',
    year: 2016,
    creditsStatus: 'complete',
    addedAt: '2026-10-13T09:00:00Z',
    ...overrides,
  }
}

export function person(key: string, name: string): Person {
  return { mbid: `person-${key}`, name }
}

export function credit(songKey: string, personKey: string, role: Credit['role'], detail = ''): Credit {
  return { songMbid: `song-${songKey}`, personMbid: `person-${personKey}`, role, detail, level: 'recording' }
}

export function snapshotOf(parts: { songs?: Song[]; people?: Person[]; credits?: Credit[]; seq?: number }): Snapshot {
  return {
    id: '7c1e0000-0000-4000-8000-000000000000',
    name: 'Untitled graph',
    seq: parts.seq ?? 5,
    songs: parts.songs ?? [],
    people: parts.people ?? [],
    credits: parts.credits ?? [],
    hubs: [],
    crawl: { queued: 0, done: 0, failed: 0, etaSeconds: 0 },
  }
}

/**
 * Three songs and the people of the prototype's sample: Donald and Ludwig produce and write Redbone, write the other
 * two (so they connect all three), and Riley mixes Redbone and Me and Your Mama. Telegraph Ave. has no credits.
 */
export function sampleSnapshot(): Snapshot {
  return snapshotOf({
    songs: [song('redbone', 'Redbone'), song('mym', 'Me and Your Mama'), song('tg', 'Telegraph Ave.', { year: 2013, creditsStatus: 'none' })],
    people: [
      person('donald', 'Donald Glover'),
      person('ludwig', 'Ludwig Göransson'),
      person('riley', 'Riley Mackin'),
      person('collins', 'William Earl Collins'),
    ],
    credits: [
      credit('redbone', 'donald', 'producer'),
      credit('redbone', 'ludwig', 'producer'),
      credit('redbone', 'donald', 'songwriter'),
      credit('redbone', 'ludwig', 'songwriter'),
      credit('redbone', 'collins', 'songwriter'),
      credit('redbone', 'donald', 'instrument', 'drums'),
      credit('redbone', 'donald', 'instrument', 'glockenspiel'),
      credit('redbone', 'riley', 'mixing'),
      credit('mym', 'donald', 'songwriter'),
      credit('mym', 'ludwig', 'songwriter'),
      credit('mym', 'riley', 'mixing'),
    ],
  })
}
