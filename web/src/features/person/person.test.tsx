import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { Providers } from '../../app/providers.tsx'
import { FakeGraphHub } from '../../test/fakeGraphHub.ts'
import { createQueryClient } from '../../app/queryClient.ts'
import { renderAt } from '../../test/renderApp.tsx'
import { server } from '../../test/server.ts'
import { credit, person, sampleSnapshot, snapshotOf, song } from '../../test/workspaceFixtures.ts'
import { creditRoles } from '../../app/creditRoles.ts'
import { buildWorkspace, type WorkspaceOptions } from '../graph/workspaceModel.ts'
import { PersonDrawer } from './PersonDrawer.tsx'
import { yearsText } from './personFormat.ts'

const everything: WorkspaceOptions = { roles: new Set(creditRoles), removed: new Set(), hidden: new Set() }
const donald = '1ba01bce-7f32-4d72-a5d9-34930b191656'
const graphId = '7c1e0000-0000-4000-8000-000000000000'

const profile = {
  mbid: donald,
  name: 'Donald Glover',
  type: 'Person',
  disambiguation: 'US actor, writer and musician',
  roles: [
    { role: 'songwriter', recordings: 3 },
    { role: 'producer', recordings: 1 },
  ],
  recordingCount: 3,
  creditCount: 4,
  firstYear: 2013,
  lastYear: 2016,
}

const recordingsPage = (page: number, ids: string[], total: number, pageSize = 20) => ({
  page,
  pageSize,
  total,
  items: ids.map((id, index) => ({
    mbid: id,
    title: `Song ${id}`,
    artist: 'Childish Gambino',
    year: 2016 - index,
    roles: [{ role: 'songwriter', detail: '' }, ...(index === 0 ? [{ role: 'instrument', detail: 'drums' }] : [])],
  })),
})

function serve(options: { page1?: unknown; page2?: unknown; profile?: unknown; status?: number } = {}) {
  server.use(
    http.get(`/api/v1/people/${donald}`, () =>
      options.status === undefined ? HttpResponse.json(options.profile ?? profile) : HttpResponse.json({ status: options.status }, { status: options.status }),
    ),
    http.get(`/api/v1/people/${donald}/recordings`, ({ request }) => {
      const page = new URL(request.url).searchParams.get('page')
      return HttpResponse.json(page === '2' ? (options.page2 ?? recordingsPage(2, [], 3)) : (options.page1 ?? recordingsPage(1, ['song-redbone', 'song-x'], 2)))
    }),
  )
}

function drawer(props: { personMbid?: string | null; onClose?: () => void; onCentre?: (mbid: string) => void } = {}) {
  const workspace = buildWorkspace(sampleSnapshot(), everything)
  return render(
    <Providers queryClient={createQueryClient()}>
      <PersonDrawer
        personMbid={props.personMbid === undefined ? donald : props.personMbid}
        workspace={workspace}
        onClose={props.onClose ?? (() => undefined)}
        onCentre={props.onCentre ?? (() => undefined)}
      />
    </Providers>,
  )
}

describe('PersonDrawer (FR-PERSON-01)', () => {
  it('FR_PERSON_01 shows who the person is, their roles on stored recordings and their years, labelled as partial', async () => {
    serve()
    drawer()

    expect(await screen.findByRole('heading', { name: 'Donald Glover' })).toBeInTheDocument()
    expect(screen.getByText('Person · US actor, writer and musician')).toBeInTheDocument()

    const roles = screen.getByRole('region', { name: 'Roles' })
    expect(within(roles).getByText('Songwriter')).toBeInTheDocument()
    expect(within(roles).getByText('3 recordings')).toBeInTheDocument()
    expect(within(roles).getByText('1 recording')).toBeInTheDocument()

    const years = screen.getByRole('region', { name: 'Active years' })
    expect(within(years).getByText('2013 to 2016')).toBeInTheDocument()
    expect(within(years).getByText(/Partial: from the 3 recordings stored so far/)).toBeInTheDocument()
  })

  it('FR_PERSON_01 lists the credited recordings with their roles, and marks the ones that are in the graph', async () => {
    serve()
    drawer()

    expect(await screen.findByText('Song song-redbone')).toBeInTheDocument()
    expect(screen.getByText('Songwriter, Instrument · drums')).toBeInTheDocument()
    expect(screen.getByText('Credited recordings (3)')).toBeInTheDocument()
  })

  it('FR_PERSON_01 asks for the next page only when "Show more" is pressed', async () => {
    const pages: string[] = []
    server.use(
      http.get(`/api/v1/people/${donald}`, () => HttpResponse.json(profile)),
      http.get(`/api/v1/people/${donald}/recordings`, ({ request }) => {
        const page = new URL(request.url).searchParams.get('page') ?? '?'
        pages.push(page)
        // Two to a page, so three recordings are two pages (the Api's own page is 20).
        return HttpResponse.json(page === '2' ? recordingsPage(2, ['third'], 3, 2) : recordingsPage(1, ['first', 'second'], 3, 2))
      }),
    )
    drawer()
    await screen.findByText('Song first')
    expect(pages).toEqual(['1'])

    fireEvent.click(screen.getByRole('button', { name: /Show more \(1 left\)/ }))

    expect(await screen.findByText('Song third')).toBeInTheDocument()
    expect(pages).toEqual(['1', '2'])
    expect(screen.queryByRole('button', { name: /Show more/ })).not.toBeInTheDocument()
  })

  it('FR_PERSON_01 a person Nodeable has not stored says so, in words', async () => {
    serve({ status: 404 })
    drawer()

    expect(await screen.findByText(/has not stored this person yet/)).toBeInTheDocument()
  })

  it('FR_PERSON_01 a person who is in the graph can be put at the centre from the drawer, and a link opens MusicBrainz', async () => {
    serve()
    const onCentre = vi.fn()
    const workspace = buildWorkspace(
      snapshotOf({
        songs: [song('redbone', 'Redbone')],
        people: [{ ...person('donald', 'Donald Glover'), mbid: donald }],
        credits: [{ ...credit('redbone', 'donald', 'producer'), personMbid: donald }],
      }),
      everything,
    )
    render(
      <Providers queryClient={createQueryClient()}>
        <PersonDrawer personMbid={donald} workspace={workspace} onClose={() => undefined} onCentre={onCentre} />
      </Providers>,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Put at the centre' }))
    expect(onCentre).toHaveBeenCalledWith(donald)

    const link = screen.getByRole('link', { name: /Open on MusicBrainz/ })
    expect(link).toHaveAttribute('href', `https://musicbrainz.org/artist/${donald}`)
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })

  it('FR_PERSON_01 the close button closes it, and nothing is asked while it is closed', async () => {
    let asked = 0
    server.use(
      http.get(`/api/v1/people/${donald}`, () => {
        asked++
        return HttpResponse.json(profile)
      }),
      http.get(`/api/v1/people/${donald}/recordings`, () => HttpResponse.json(recordingsPage(1, [], 0))),
    )
    const onClose = vi.fn()
    drawer({ personMbid: null, onClose })
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(asked).toBe(0)

    drawer({ onClose })
    fireEvent.click(await screen.findByRole('button', { name: 'Close details' }))
    expect(onClose).toHaveBeenCalled()
  })
})

describe('yearsText', () => {
  it('FR_PERSON_01 says one year once, a span as "a to b", and nothing without dates', () => {
    expect(yearsText(2013, 2013)).toBe('2013')
    expect(yearsText(2013, 2016)).toBe('2013 to 2016')
    expect(yearsText(null, null)).toBeNull()
    expect(yearsText(2013, undefined)).toBeNull()
  })
})

describe('the drawer in the graph (FR-PERSON-01, D2)', () => {
  function guidSnapshot() {
    return snapshotOf({
      songs: [song('redbone', 'Redbone')],
      people: [{ ...person('donald', 'Donald Glover'), mbid: donald }],
      credits: [{ ...credit('redbone', 'donald', 'producer'), personMbid: donald }],
    })
  }

  function serveGraph() {
    localStorage.setItem('nodeable.graph', JSON.stringify({ id: graphId, token: 'token-for-the-test' }))
    server.use(http.get(`/api/v1/graphs/${graphId}`, () => HttpResponse.json(guidSnapshot())))
    serve()
  }

  it('FR_PERSON_01 an address with ?person= opens the drawer, so it can be reloaded and shared', async () => {
    serveGraph()
    renderAt(`/graph?person=${donald}`, { graphConnection: () => new FakeGraphHub() })

    expect(await screen.findByRole('heading', { name: 'Donald Glover' })).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('FR_PERSON_01 a value that is not an MBID is ignored and nothing is asked', async () => {
    serveGraph()
    renderAt('/graph?person=not-an-mbid', { graphConnection: () => new FakeGraphHub() })
    await screen.findByRole('group', { name: /Credits graph/ })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('FR_PERSON_01 the Details button beside a name in the liner notes opens the drawer; the name still centres', async () => {
    serveGraph()
    renderAt('/graph', { graphConnection: () => new FakeGraphHub() })
    await screen.findByRole('group', { name: /Credits graph/ })

    fireEvent.click(await screen.findByRole('button', { name: 'Details for Donald Glover' }))

    expect(await screen.findByRole('heading', { name: 'Donald Glover' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
  })

  it('FR_PERSON_01 Enter on a person in the orbit opens their drawer', async () => {
    serveGraph()
    renderAt('/graph', { graphConnection: () => new FakeGraphHub() })
    const group = await screen.findByRole('group', { name: /Credits graph/ })
    const node = await within(group).findByRole('button', { name: /Donald Glover/ })

    fireEvent.keyDown(node, { key: 'Enter' })

    expect(await screen.findByRole('heading', { name: 'Donald Glover' })).toBeInTheDocument()
  })

  it('FR_PERSON_01 Space on a person in the orbit still puts them at the centre, without the drawer', async () => {
    serveGraph()
    renderAt('/graph', { graphConnection: () => new FakeGraphHub() })
    const group = await screen.findByRole('group', { name: /Credits graph/ })
    const node = await within(group).findByRole('button', { name: /Donald Glover/ })

    fireEvent.keyDown(node, { key: ' ' })

    await waitFor(() => expect(within(group).getByRole('img', { name: /Donald Glover, the centre of this view/ })).toBeInTheDocument())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
