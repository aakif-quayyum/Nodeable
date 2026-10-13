import { describe, expect, it } from 'vitest'
import { creditRoles, type CreditRoleKey } from '../../app/creditRoles.ts'
import { credit, person, sampleSnapshot, snapshotOf, song } from '../../test/workspaceFixtures.ts'
import { buildWorkspace, headlineOf, noteRows, primaryRole, rolesOnSong } from './workspaceModel.ts'

const allRoles: ReadonlySet<CreditRoleKey> = new Set(creditRoles)
const nothing = { roles: allRoles, removed: new Set<string>(), hidden: new Set<string>() }

describe('workspace model', () => {
  it('FR_HUB_02 orders people by the songs they are on, then by name, and marks two songs as a connector', () => {
    const ws = buildWorkspace(sampleSnapshot(), nothing)

    expect(ws.people.map((p) => p.name)).toEqual(['Donald Glover', 'Ludwig Göransson', 'Riley Mackin', 'William Earl Collins'])
    expect(ws.connectors.map((p) => [p.name, p.songs.length])).toEqual([
      ['Donald Glover', 2],
      ['Ludwig Göransson', 2],
      ['Riley Mackin', 2],
    ])
  })

  it('FR_VIEW_01 groups a song’s people by their main role on it, then by who was credited first', () => {
    const ws = buildWorkspace(sampleSnapshot(), nothing)

    expect(ws.peopleBySong.get('song-redbone')!.map((p) => p.name)).toEqual([
      'Donald Glover',
      'Ludwig Göransson',
      'William Earl Collins',
      'Riley Mackin',
    ])
    const donald = ws.personById.get('person-donald')!
    expect(primaryRole(donald, 'song-redbone')).toBe('producer')
    expect(rolesOnSong(donald, 'song-redbone')).toEqual(['producer', 'songwriter', 'instrument'])
    expect(donald.mainRole).toBe('songwriter')
  })

  it('FR_HUB_03 works connectors out again from the credits that remain when a role is off', () => {
    const noMixing = new Set(creditRoles.filter((role) => role !== 'mixing'))
    const ws = buildWorkspace(sampleSnapshot(), { ...nothing, roles: noMixing })

    expect(ws.people.map((p) => p.name)).not.toContain('Riley Mackin')
    expect(ws.connectors.map((p) => p.name)).toEqual(['Donald Glover', 'Ludwig Göransson'])
    expect(ws.creditCount).toBe(9)
  })

  it('FR_GRAPH_06 leaves a song with a pending removal, and the people only on it, out of every view', () => {
    const snapshot = snapshotOf({
      songs: [song('a', 'A'), song('b', 'B')],
      people: [person('x', 'Only On A'), person('y', 'On Both')],
      credits: [credit('a', 'x', 'producer'), credit('a', 'y', 'producer'), credit('b', 'y', 'songwriter')],
    })

    const ws = buildWorkspace(snapshot, { ...nothing, removed: new Set(['song-a']) })

    expect(ws.songs.map((s) => s.title)).toEqual(['B'])
    expect(ws.people.map((p) => p.name)).toEqual(['On Both'])
    expect(ws.connectors).toEqual([])
    expect(ws.creditCount).toBe(1)
  })

  it('FR_VIEW_03 leaves a hidden person out of the views and the counts, and still lists them as hidden', () => {
    const ws = buildWorkspace(sampleSnapshot(), { ...nothing, hidden: new Set(['person-donald']) })

    expect(ws.people.map((p) => p.name)).not.toContain('Donald Glover')
    expect(ws.hiddenPeople).toEqual([{ mbid: 'person-donald', name: 'Donald Glover' }])
    expect(ws.songById.get('song-redbone')!.credits.some((c) => c.personMbid === 'person-donald')).toBe(false)
  })

  it('FR_GRAPH_04 judges the incomplete badge from every credit, not from the filters or the hidden people', () => {
    const snapshot = snapshotOf({
      songs: [song('a', 'A'), song('b', 'B'), song('c', 'C', { creditsStatus: 'loading' })],
      people: [person('x', 'X')],
      credits: [credit('a', 'x', 'producer'), credit('b', 'x', 'mixing')],
    })

    const filtered = buildWorkspace(snapshot, { ...nothing, roles: new Set<CreditRoleKey>(['mixing']), hidden: new Set(['person-x']) })

    expect(filtered.songById.get('song-a')!.incomplete).toBe(false)
    expect(filtered.songById.get('song-b')!.incomplete).toBe(true)
    // A song that is still loading is not judged.
    expect(filtered.songById.get('song-c')!.incomplete).toBe(false)
  })

  it('FR_NOTES_01 builds a card’s rows in role order, each person once with their details after the name', () => {
    const ws = buildWorkspace(sampleSnapshot(), nothing)

    const rows = noteRows(ws, 'song-redbone')

    expect(rows.map((row) => row.role)).toEqual(['producer', 'songwriter', 'mixing', 'instrument'])
    const instrument = rows.find((row) => row.role === 'instrument')!
    expect(instrument.people.map((entry) => [entry.person.name, entry.details])).toEqual([['Donald Glover', ['drums', 'glockenspiel']]])
  })

  it('FR_HUB_01 names every person who ties for the most songs, three at most', () => {
    const ws = buildWorkspace(sampleSnapshot(), nothing)

    expect(headlineOf(ws)).toEqual({ names: ['Donald Glover', 'Ludwig Göransson', 'Riley Mackin'], more: 0, connects: 2 })

    const alone = buildWorkspace(snapshotOf({ songs: [song('a', 'A')], people: [person('x', 'X')], credits: [credit('a', 'x', 'producer')] }), nothing)
    expect(headlineOf(alone)).toBeNull()
  })

  it('FR_GRAPH_04 counts every credit a song has before the role filters and the hidden people take any away', () => {
    const snapshot = sampleSnapshot()
    const filtered = buildWorkspace(snapshot, { roles: new Set(['mixing']), removed: new Set(), hidden: new Set(['person-riley']) })

    // Redbone has eight credits in all; with only mixing on and the one mixer hidden, none are shown.
    const redbone = filtered.songById.get('song-redbone')!
    expect(redbone.credits).toHaveLength(0)
    expect(redbone.totalCredits).toBe(8)
    // Telegraph Ave. has none at all, which is a different thing from "all filtered out".
    expect(filtered.songById.get('song-tg')!.totalCredits).toBe(0)
  })
})
