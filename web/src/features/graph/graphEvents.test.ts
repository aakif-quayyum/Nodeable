import { describe, expect, it } from 'vitest'
import { applyGraphEvent, replayEvents, type GraphEvent, type GraphSnapshot } from './graphEvents.ts'

const redbone = '7408f11c-6c4e-41e5-b81b-6a15bf6cb268'
const america = 'dc316772-0ef2-4b31-9ee5-c0b3cf1a1c1e'
const donald = '1ba09d36-5d9d-4a23-8b52-2f2e4d5b1b11'
const ludwig = '9a7f3a5e-1d0f-4d1a-93f2-6e0a91b6f4c2'

function snapshot(overrides: Partial<GraphSnapshot> = {}): GraphSnapshot {
  return {
    id: '7c1e0000-0000-4000-8000-000000000000',
    name: 'Untitled graph',
    seq: 10,
    songs: [
      { mbid: redbone, title: 'Redbone', artist: 'Childish Gambino', year: 2016, creditsStatus: 'loading', addedAt: '2026-10-12T09:09:45Z' },
    ],
    people: [],
    credits: [],
    hubs: [],
    crawl: { queued: 1, done: 0, failed: 0, etaSeconds: 1 },
    ...overrides,
  }
}

const creditsResolved = (seq: number, overrides: Partial<Extract<GraphEvent, { type: 'CreditsResolved' }>> = {}): GraphEvent => ({
  type: 'CreditsResolved',
  seq,
  songMbid: redbone,
  people: [{ mbid: donald, name: 'Donald Glover' }],
  credits: [{ personMbid: donald, role: 'songwriter', detail: '', level: 'recording' }],
  ...overrides,
})

describe('applyGraphEvent', () => {
  it('FR_GRAPH_02 ignores an event at or below the snapshot seq, which the snapshot already contains', () => {
    const before = snapshot({ seq: 10 })

    expect(applyGraphEvent(before, creditsResolved(10))).toBe(before)
    expect(applyGraphEvent(before, creditsResolved(3))).toBe(before)
  })

  it('FR_GRAPH_02 adds the people and credits of a resolved song', () => {
    const after = applyGraphEvent(snapshot(), creditsResolved(11))

    expect(after.people).toEqual([{ mbid: donald, name: 'Donald Glover' }])
    expect(after.credits).toEqual([
      { songMbid: redbone, personMbid: donald, role: 'songwriter', detail: '', level: 'recording' },
    ])
  })

  it('FR_ART_01 learns the cover ids of a song from the credits event, and keeps them when a later event has none', () => {
    const release = '60b98e3b-a038-40b8-b17a-c0b1606c41a8'
    const group = 'e1adb327-2619-427c-acec-d8bb3efb5dca'

    const learned = applyGraphEvent(snapshot(), creditsResolved(11, { artReleaseMbid: release, artReleaseGroupMbid: group }))
    const later = applyGraphEvent(learned, creditsResolved(12))

    expect(learned.songs[0]).toMatchObject({ artReleaseMbid: release, artReleaseGroupMbid: group })
    expect(later.songs[0]).toMatchObject({ artReleaseMbid: release, artReleaseGroupMbid: group })
  })

  it('FR_GRAPH_03 gives the same graph when the same event is applied twice', () => {
    const once = applyGraphEvent(snapshot(), creditsResolved(11))
    const twice = applyGraphEvent(once, creditsResolved(11))

    expect(twice.credits).toEqual(once.credits)
    expect(twice.people).toEqual(once.people)
  })

  it('FR_GRAPH_03 keeps one credit per song, person, role and detail and takes the level that arrives last', () => {
    const first = applyGraphEvent(snapshot(), creditsResolved(11, {
      credits: [{ personMbid: donald, role: 'songwriter', detail: '', level: 'work' }],
    }))
    const second = applyGraphEvent(first, creditsResolved(12))

    expect(second.credits).toHaveLength(1)
    expect(second.credits[0]?.level).toBe('recording')
  })

  it('FR_GRAPH_03 keeps credits that differ in detail, such as two instruments by one person', () => {
    const after = applyGraphEvent(snapshot(), creditsResolved(11, {
      credits: [
        { personMbid: donald, role: 'instrument', detail: 'guitar', level: 'recording' },
        { personMbid: donald, role: 'instrument', detail: 'piano', level: 'recording' },
      ],
    }))

    expect(after.credits.map((credit) => credit.detail)).toEqual(['guitar', 'piano'])
  })

  it('FR_GRAPH_02 never changes the snapshot it was given', () => {
    const before = snapshot()
    const frozen = JSON.stringify(before)

    applyGraphEvent(before, creditsResolved(11))
    applyGraphEvent(before, { type: 'SongStatusChanged', seq: 12, songMbid: redbone, creditsStatus: 'complete' })

    expect(JSON.stringify(before)).toBe(frozen)
  })

  it('FR_GRAPH_04 updates a song status and leaves the other songs alone', () => {
    const before = snapshot({
      songs: [
        ...snapshot().songs,
        { mbid: america, title: 'This Is America', artist: 'Childish Gambino', year: 2018, creditsStatus: 'loading', addedAt: '2026-10-12T09:10:00Z' },
      ],
    })

    const after = applyGraphEvent(before, { type: 'SongStatusChanged', seq: 11, songMbid: redbone, creditsStatus: 'complete' })

    expect(after.songs.map((song) => song.creditsStatus)).toEqual(['complete', 'loading'])
  })

  it('FR_HUB_02 replaces the hubs and the crawl progress', () => {
    const withHubs = applyGraphEvent(snapshot(), {
      type: 'HubsUpdated',
      seq: 11,
      hubs: [{ personMbid: ludwig, songs: 2, roles: ['producer'] }],
    })
    const withProgress = applyGraphEvent(withHubs, { type: 'CrawlProgress', seq: 12, queued: 0, done: 5, failed: 1, etaSeconds: 0 })

    expect(withProgress.hubs).toEqual([{ personMbid: ludwig, songs: 2, roles: ['producer'] }])
    expect(withProgress.crawl).toEqual({ queued: 0, done: 5, failed: 1, etaSeconds: 0 })
  })

  it('FR_GRAPH_02 keeps credits that arrive before their song is in the snapshot', () => {
    // The add-song answer and the hub's credits race: the credits may be here first.
    const empty = snapshot({ songs: [] })

    const after = applyGraphEvent(empty, creditsResolved(11))

    expect(after.credits).toHaveLength(1)
  })
})

describe('replayEvents', () => {
  it('FR_GRAPH_02 applies only the events newer than the snapshot, in seq order', () => {
    const events: GraphEvent[] = [
      { type: 'SongStatusChanged', seq: 13, songMbid: redbone, creditsStatus: 'complete' },
      { type: 'CrawlProgress', seq: 9, queued: 7, done: 0, failed: 0, etaSeconds: 7 },
      { type: 'CrawlProgress', seq: 12, queued: 0, done: 1, failed: 0, etaSeconds: 0 },
      creditsResolved(11),
    ]

    const after = replayEvents(snapshot({ seq: 10 }), events)

    // The seq 9 event is already in the snapshot; the seq 12 one is the last progress report.
    expect(after.crawl).toEqual({ queued: 0, done: 1, failed: 0, etaSeconds: 0 })
    expect(after.songs[0]?.creditsStatus).toBe('complete')
    expect(after.credits).toHaveLength(1)
  })
})
