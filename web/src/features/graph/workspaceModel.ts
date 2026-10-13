import { creditRoles, type CreditRoleKey } from '../../app/creditRoles.ts'
import type { GraphCredit, GraphSnapshot, GraphSong } from './graphEvents.ts'

/** What the person has chosen to see: the views are the snapshot minus these. All three are UI state, never sent anywhere. */
export interface WorkspaceOptions {
  /** The roles whose credits are shown (FR-HUB-03). */
  roles: ReadonlySet<CreditRoleKey>
  /** Songs whose removal is waiting out its undo time (FR-GRAPH-06): already out of every view. */
  removed: ReadonlySet<string>
  /** People hidden from the views (FR-VIEW-03). */
  hidden: ReadonlySet<string>
}

export interface WorkspaceSong extends GraphSong {
  /** The credits that are shown: those of the active roles, without hidden people. */
  credits: GraphCredit[]
  /**
   * FR-GRAPH-04: neither a producer nor a songwriter credit. Judged from every credit of the song, not from what the
   * filters leave, and not while the song is still loading.
   */
  incomplete: boolean
}

export interface WorkspacePerson {
  mbid: string
  name: string
  /** The credits that are shown, over the songs that are in the graph. */
  credits: GraphCredit[]
  /** The graph songs the person is credited on, in the order the songs were added. */
  songs: string[]
  /** Their roles, in the order of `creditRoles` (the order the legend and the liner notes use). */
  roles: CreditRoleKey[]
  /** The role they have most credits in, a tie going to the earlier role. */
  mainRole: CreditRoleKey
  bySong: Map<string, GraphCredit[]>
}

export interface Workspace {
  songs: WorkspaceSong[]
  songById: Map<string, WorkspaceSong>
  /** Most songs first, then by name: the order of the connector cards and of the Text view. */
  people: WorkspacePerson[]
  personById: Map<string, WorkspacePerson>
  peopleBySong: Map<string, WorkspacePerson[]>
  /** People credited on two or more songs (FR-HUB-01, FR-HUB-02). */
  connectors: WorkspacePerson[]
  /** The number of credits that are shown. */
  creditCount: number
  /** Hidden people who have credits in this graph, for the "n hidden" control. */
  hiddenPeople: { mbid: string; name: string }[]
}

const roleOrder = (role: CreditRoleKey) => creditRoles.indexOf(role)

/**
 * The views' model: the snapshot with the role filters, the pending removals and the hidden people applied, and
 * everything the orbit, the cards, the notes and the Text view ask of it worked out once. The same inputs always give
 * the same answer in the same order, so the views and the Text view cannot disagree (NFR-A11Y-01).
 */
// LEARN: LG-03R one-workspace | The filters (roles, pending removals, hidden people) are applied once to build a single derived model that every view reads, so the orbit, the cards, the notes and the Text view cannot disagree and a new filter is one more input, not a change in four components
export function buildWorkspace(snapshot: GraphSnapshot, options: WorkspaceOptions): Workspace {
  const liveSongs = snapshot.songs.filter((song) => !options.removed.has(song.mbid))
  const songIds = new Set(liveSongs.map((song) => song.mbid))
  const names = new Map(snapshot.people.map((person) => [person.mbid, person.name]))

  // Credits of a removed song are never counted: a credit that is still in the snapshot must not make a connector.
  const inGraph = snapshot.credits.filter((credit) => songIds.has(credit.songMbid))
  const hiddenIds = new Set<string>()
  const shown = inGraph.filter((credit) => {
    if (options.hidden.has(credit.personMbid)) {
      hiddenIds.add(credit.personMbid)
      return false
    }
    return options.roles.has(credit.role)
  })

  const songOrder = new Map(liveSongs.map((song, index) => [song.mbid, index]))
  const creditsBySong = new Map<string, GraphCredit[]>()
  const allBySong = new Map<string, GraphCredit[]>()
  for (const credit of inGraph) {
    const list = allBySong.get(credit.songMbid)
    if (list === undefined) allBySong.set(credit.songMbid, [credit])
    else list.push(credit)
  }
  for (const credit of shown) {
    const list = creditsBySong.get(credit.songMbid)
    if (list === undefined) creditsBySong.set(credit.songMbid, [credit])
    else list.push(credit)
  }

  const songs: WorkspaceSong[] = liveSongs.map((song) => ({
    ...song,
    credits: creditsBySong.get(song.mbid) ?? [],
    incomplete:
      song.creditsStatus !== 'loading' &&
      !(allBySong.get(song.mbid) ?? []).some((credit) => credit.role === 'producer' || credit.role === 'songwriter'),
  }))

  const byPerson = new Map<string, GraphCredit[]>()
  for (const credit of shown) {
    const list = byPerson.get(credit.personMbid)
    if (list === undefined) byPerson.set(credit.personMbid, [credit])
    else list.push(credit)
  }

  const people: WorkspacePerson[] = [...byPerson].map(([mbid, credits]) => {
    const bySong = new Map<string, GraphCredit[]>()
    const counts = new Map<CreditRoleKey, number>()
    for (const credit of credits) {
      const list = bySong.get(credit.songMbid)
      if (list === undefined) bySong.set(credit.songMbid, [credit])
      else list.push(credit)
      counts.set(credit.role, (counts.get(credit.role) ?? 0) + 1)
    }
    const roles = [...counts.keys()].sort((a, b) => roleOrder(a) - roleOrder(b))
    const mainRole = [...counts.keys()].sort((a, b) => counts.get(b)! - counts.get(a)! || roleOrder(a) - roleOrder(b))[0] ?? 'other'

    return {
      mbid,
      name: names.get(mbid) ?? 'Unknown person',
      credits,
      songs: [...bySong.keys()].sort((a, b) => (songOrder.get(a) ?? 0) - (songOrder.get(b) ?? 0)),
      roles,
      mainRole,
      bySong,
    }
  })
  people.sort((a, b) => b.songs.length - a.songs.length || a.name.localeCompare(b.name))

  const personById = new Map(people.map((person) => [person.mbid, person]))

  // A song's people: grouped by their main role on it (the order of the roles), then by who was credited first.
  const peopleBySong = new Map<string, WorkspacePerson[]>()
  for (const [songMbid, credits] of creditsBySong) {
    const seen = new Map<string, number>()
    credits.forEach((credit, index) => {
      if (!seen.has(credit.personMbid)) seen.set(credit.personMbid, index)
    })
    const list = [...seen.keys()]
      .map((mbid) => personById.get(mbid)!)
      .sort(
        (a, b) =>
          roleOrder(primaryRole(a, songMbid)) - roleOrder(primaryRole(b, songMbid)) || seen.get(a.mbid)! - seen.get(b.mbid)!,
      )
    peopleBySong.set(songMbid, list)
  }

  return {
    songs,
    songById: new Map(songs.map((song) => [song.mbid, song])),
    people,
    personById,
    peopleBySong,
    connectors: people.filter((person) => person.songs.length >= 2),
    creditCount: shown.length,
    hiddenPeople: [...hiddenIds]
      .map((mbid) => ({ mbid, name: names.get(mbid) ?? 'Unknown person' }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  }
}

/** A person's first role on a song, by the order of the roles; "other" when they have no shown credit on it. */
export function primaryRole(person: WorkspacePerson, songMbid: string): CreditRoleKey {
  const credits = person.bySong.get(songMbid)
  if (credits === undefined || credits.length === 0) return 'other'
  return credits.map((credit) => credit.role).sort((a, b) => roleOrder(a) - roleOrder(b))[0]!
}

/** The distinct roles a person has on one song, in the order of the roles. */
export function rolesOnSong(person: WorkspacePerson, songMbid: string): CreditRoleKey[] {
  const credits = person.bySong.get(songMbid) ?? []
  return [...new Set(credits.map((credit) => credit.role))].sort((a, b) => roleOrder(a) - roleOrder(b))
}

export interface NoteRow {
  role: CreditRoleKey
  people: { person: WorkspacePerson; details: string[] }[]
}

/**
 * The rows of a song's liner-notes card (FR-NOTES-01): one for each role the song has credits in, in the order of the
 * roles, each naming its people once with their details ("drums, glockenspiel") collected after the name.
 */
export function noteRows(ws: Workspace, songMbid: string): NoteRow[] {
  const song = ws.songById.get(songMbid)
  if (song === undefined) return []

  const rows: NoteRow[] = []
  for (const role of creditRoles) {
    const row: NoteRow = { role, people: [] }
    const seen = new Map<string, { person: WorkspacePerson; details: string[] }>()
    for (const credit of song.credits) {
      if (credit.role !== role) continue
      const person = ws.personById.get(credit.personMbid)
      if (person === undefined) continue
      const known = seen.get(person.mbid)
      if (known !== undefined) {
        if (credit.detail !== '' && !known.details.includes(credit.detail)) known.details.push(credit.detail)
        continue
      }
      const entry = { person, details: credit.detail === '' ? [] : [credit.detail] }
      seen.set(person.mbid, entry)
      row.people.push(entry)
    }
    if (row.people.length > 0) rows.push(row)
  }
  return rows
}

export interface Headline {
  /** The people who connect the most songs (every one that ties for the most), the first three. */
  names: string[]
  /** How many more tie, beyond `names`. */
  more: number
  /** How many songs each of them connects. */
  connects: number
}

/** The strip's headline when there are connectors: who connects the most songs. Null when nobody connects two. */
export function headlineOf(ws: Workspace): Headline | null {
  const most = Math.max(0, ...ws.connectors.map((person) => person.songs.length))
  if (most < 2) return null
  const top = ws.connectors.filter((person) => person.songs.length === most)
  return { names: top.slice(0, 3).map((person) => person.name), more: Math.max(0, top.length - 3), connects: most }
}

/** The song that the orbit centres on when nothing else is chosen: the one that is loading, else the latest added. */
export function defaultSong(ws: Workspace): WorkspaceSong | null {
  const loading = [...ws.songs].reverse().find((song) => song.creditsStatus === 'loading')
  return loading ?? ws.songs.at(-1) ?? null
}
