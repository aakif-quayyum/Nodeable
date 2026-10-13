import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import type { ReactElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import type { components } from '../../api/schema'
import { Providers } from '../../app/providers.tsx'
import { useRoleFilters } from '../../stores/roleFilters.ts'
import { useSelection } from '../../stores/selection.ts'
import { FakeGraphHub } from '../../test/fakeGraphHub.ts'
import { renderAt } from '../../test/renderApp.tsx'
import { server } from '../../test/server.ts'
import { setViewportWidth } from '../../test/viewport.ts'
import type { DerivedGraph, PersonNode } from '../graph/graphModel.ts'
import { filterCredits, hubsOf } from '../graph/graphModel.ts'
import { HubBar } from './HubBar.tsx'

type Snapshot = components['schemas']['GraphSnapshot']

const graphId = '7c1e0000-0000-4000-8000-000000000000'
const token = 'token-for-the-test'
const redbone = '7408f11c-6c4e-41e5-b81b-6a15bf6cb268'
const america = 'dc316772-0ef2-4b31-9ee5-c0b3cf1a1c1e'
const donald = { mbid: '1ba09d36-5d9d-4a23-8b52-2f2e4d5b1b11', name: 'Donald Glover' }
const ludwig = { mbid: '9a7f3a5e-1d0f-4d1a-93f2-6e0a91b6f4c2', name: 'Ludwig Göransson' }

// Donald Glover is a songwriter on Redbone and a vocalist on both; Ludwig Göransson produced both.
function twoSongs(): Snapshot {
  return {
    id: graphId,
    name: 'Untitled graph',
    seq: 5,
    songs: [
      { mbid: redbone, title: 'Redbone', artist: 'Childish Gambino', year: 2016, creditsStatus: 'complete', addedAt: '2026-10-12T09:09:45Z' },
      { mbid: america, title: 'This Is America', artist: 'Childish Gambino', year: 2018, creditsStatus: 'complete', addedAt: '2026-10-12T09:10:00Z' },
    ],
    people: [donald, ludwig],
    credits: [
      { songMbid: redbone, personMbid: donald.mbid, role: 'songwriter', detail: '', level: 'recording' },
      { songMbid: redbone, personMbid: donald.mbid, role: 'vocal', detail: '', level: 'recording' },
      { songMbid: america, personMbid: donald.mbid, role: 'vocal', detail: '', level: 'recording' },
      { songMbid: redbone, personMbid: ludwig.mbid, role: 'producer', detail: '', level: 'recording' },
      { songMbid: america, personMbid: ludwig.mbid, role: 'producer', detail: '', level: 'recording' },
    ],
    hubs: [],
    crawl: { queued: 0, done: 0, failed: 0, etaSeconds: 0 },
  }
}

function open(snapshot: Snapshot = twoSongs()) {
  localStorage.setItem('nodeable.graph', JSON.stringify({ id: graphId, token }))
  server.use(http.get(`/api/v1/graphs/${graphId}`, () => HttpResponse.json(snapshot)))
  return renderAt('/graph', { graphConnection: () => new FakeGraphHub() })
}

const person = (id: string, name: string, songs: number, roles: PersonNode['roles'] = ['producer']): PersonNode => ({
  kind: 'person',
  id: `person:${id}`,
  mbid: id,
  name,
  songs,
  roles,
  isHub: songs >= 2,
  r: 6,
})

afterEach(() => {
  useRoleFilters.getState().reset()
  useSelection.setState({ selectedId: null })
})

describe('filterCredits and hubsOf', () => {
  it('FR_HUB_03 returns the same snapshot when every role is on', () => {
    const snapshot = twoSongs()

    expect(filterCredits(snapshot, useRoleFilters.getState().active)).toBe(snapshot)
  })

  it('FR_HUB_03 keeps only the credits of the roles that are on, and leaves the songs alone', () => {
    const snapshot = twoSongs()
    const withoutVocals = new Set(useRoleFilters.getState().active)
    withoutVocals.delete('vocal')

    const filtered = filterCredits(snapshot, withoutVocals)

    expect(filtered.credits.map((credit) => credit.role).sort()).toEqual(['producer', 'producer', 'songwriter'])
    expect(filtered.songs).toBe(snapshot.songs)
  })

  it('FR_HUB_02 lists only people credited on two or more songs, most songs first', () => {
    const graph: DerivedGraph = {
      nodes: [person('a', 'A', 1), person('b', 'B', 3), person('c', 'C', 2)],
      links: [],
      songCount: 3,
      personCount: 3,
    }

    expect(hubsOf(graph).map((hub) => hub.name)).toEqual(['B', 'C'])
  })
})

describe('role filter store', () => {
  it('FR_HUB_03 starts with every role on, other included, and toggles one at a time', () => {
    const { active, toggle } = useRoleFilters.getState()
    expect([...active].sort()).toEqual(['engineering', 'instrument', 'mixing', 'other', 'producer', 'songwriter', 'vocal'])

    toggle('other')
    expect(useRoleFilters.getState().active.has('other')).toBe(false)
    expect(useRoleFilters.getState().active).not.toBe(active)

    toggle('other')
    expect(useRoleFilters.getState().active.has('other')).toBe(true)
  })
})

describe('HubBar', () => {
  it('FR_HUB_02 shows a row per hub with the number of songs as text and a bar as long as the count', () => {
    const hubs = [person('b', 'B', 4), person('c', 'C', 2)]
    const { container } = renderBar(hubs)

    const rows = screen.getAllByRole('listitem')
    expect(within(rows[0]!).getByText('B')).toBeInTheDocument()
    expect(within(rows[0]!).getByText('4 songs')).toBeInTheDocument()
    expect(within(rows[1]!).getByText('2 songs')).toBeInTheDocument()
    const bars = [...container.querySelectorAll<HTMLElement>('.bar')].map((bar) => bar.style.width || getComputedStyle(bar).width)
    expect(bars).toHaveLength(2)
  })

  it('FR_HUB_02 selects the hub that is clicked and marks the selected one as pressed', async () => {
    const chosen: string[] = []
    renderBar([person('b', 'B', 4), person('c', 'C', 2)], 'person:c', (id) => chosen.push(id))

    expect(screen.getByRole('button', { name: /^C/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /^B/ })).toHaveAttribute('aria-pressed', 'false')

    await userEvent.click(screen.getByRole('button', { name: /^B/ }))
    expect(chosen).toEqual(['person:b'])
  })
})

function renderBar(hubs: PersonNode[], selectedId: string | null = null, onSelect: (id: string) => void = () => undefined) {
  // HubBar is a plain component with no providers of its own beyond the theme, so it is rendered through the app's.
  return renderBarInApp(<HubBar hubs={hubs} selectedId={selectedId} onSelect={onSelect} />)
}

function renderBarInApp(element: ReactElement) {
  return render(<Providers>{element}</Providers>)
}

describe('hubs panel and role filters in the graph view', () => {
  it('FR_HUB_02 lists the people credited on two songs, in the left panel on a wide screen', async () => {
    setViewportWidth(1280)
    open()

    const panel = await screen.findByRole('complementary', { name: 'Hubs and role filters' })
    const hubs = within(await within(panel).findByRole('region', { name: 'Your hubs' })).getAllByRole('listitem')

    expect(hubs).toHaveLength(2)
    expect(hubs[0]).toHaveTextContent(/Donald Glover.*2 songs/)
    expect(hubs[1]).toHaveTextContent(/Ludwig Göransson.*2 songs/)
  })

  it('FR_HUB_03 recomputes the hubs from the credits of the roles that are on', async () => {
    setViewportWidth(1280)
    const user = userEvent.setup()
    open()

    const panel = await screen.findByRole('complementary', { name: 'Hubs and role filters' })
    await within(panel).findByRole('region', { name: 'Your hubs' })

    // Producer off: Ludwig Göransson has no credits left; Donald Glover is still on both songs through his vocals.
    await user.click(within(panel).getByRole('button', { name: 'Producer' }))
    const hubs = within(within(panel).getByRole('region', { name: 'Your hubs' })).getAllByRole('listitem')
    expect(hubs).toHaveLength(1)
    expect(hubs[0]).toHaveTextContent('Donald Glover')

    // Vocal off as well: no one is on two songs any more.
    await user.click(within(panel).getByRole('button', { name: 'Vocal' }))
    expect(within(panel).getByText(/No one is credited on two songs yet/)).toBeInTheDocument()

    await user.click(within(panel).getByRole('button', { name: 'Show all' }))
    expect(within(within(panel).getByRole('region', { name: 'Your hubs' })).getAllByRole('listitem')).toHaveLength(2)
  })

  it('FR_HUB_03 has a chip for every role, all pressed, including other', async () => {
    setViewportWidth(1280)
    open()

    const panel = await screen.findByRole('complementary', { name: 'Hubs and role filters' })
    const filters = await within(panel).findByRole('region', { name: 'Roles' })
    const chips = within(filters).getAllByRole('button')

    expect(chips.map((chip) => chip.textContent)).toEqual([
      'Producer',
      'Songwriter',
      'Mixing',
      'Engineering',
      'Instrument',
      'Vocal',
      'Other',
    ])
    for (const chip of chips) {
      expect(chip).toHaveAttribute('aria-pressed', 'true')
    }
  })

  it('FR_HUB_03 filters the list view too, but not the credits incomplete badge', async () => {
    setViewportWidth(1280)
    const user = userEvent.setup()
    const snapshot = twoSongs()
    // A song with only a vocal credit has no producer or songwriter: incomplete, whatever the filters show.
    snapshot.songs = [snapshot.songs[0]!]
    snapshot.credits = [{ songMbid: redbone, personMbid: donald.mbid, role: 'vocal', detail: '', level: 'recording' }]
    open(snapshot)

    const panel = await screen.findByRole('complementary', { name: 'Hubs and role filters' })
    const table = await screen.findByRole('table', { name: 'Songs and their credits' })
    expect(within(table).getByText('Donald Glover — Vocal')).toBeInTheDocument()
    expect(within(table).getByText('Credits incomplete')).toBeInTheDocument()

    await user.click(within(panel).getByRole('button', { name: 'Vocal' }))

    expect(within(table).queryByText('Donald Glover — Vocal')).not.toBeInTheDocument()
    expect(within(table).getByText('Credits incomplete')).toBeInTheDocument()
  })

  it('NFR_A11Y_01 collapses the left panel with a button that says what it will do', async () => {
    setViewportWidth(1280)
    const user = userEvent.setup()
    open()

    const hide = await screen.findByRole('button', { name: 'Hide hubs and roles' })
    expect(hide).toHaveAttribute('aria-expanded', 'true')
    await user.click(hide)

    const show = screen.getByRole('button', { name: 'Show hubs and roles' })
    expect(show).toHaveAttribute('aria-expanded', 'false')
    // Role queries leave out content that is hidden from assistive technology, which is what `hidden` does.
    expect(screen.queryByRole('region', { name: 'Your hubs' })).not.toBeInTheDocument()
  })

  it('FR_HUB_02 puts the panels in a bottom sheet on a phone, opened by a button', async () => {
    setViewportWidth(390)
    const user = userEvent.setup()
    open()

    const button = await screen.findByRole('button', { name: 'Hubs and roles' })
    expect(screen.queryByRole('region', { name: 'Your hubs' })).not.toBeInTheDocument()

    await user.click(button)

    const sheet = await screen.findByRole('presentation')
    expect(within(sheet).getByRole('region', { name: 'Your hubs' })).toBeInTheDocument()
    expect(within(sheet).getByRole('region', { name: 'Roles' })).toBeInTheDocument()
  })

  it('FR_HUB_01 shows the details of the selected node in a right panel on a wide screen and in a sheet on a phone', async () => {
    setViewportWidth(1280)
    open()
    await screen.findByRole('complementary', { name: 'Hubs and role filters' })

    act(() => useSelection.getState().select(`person:${donald.mbid}`))
    expect(await screen.findByRole('region', { name: 'Details: Donald Glover' })).toBeInTheDocument()
  })
})
