import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import type { components } from '../../api/schema'
import { renderAt } from '../../test/renderApp.tsx'
import { server } from '../../test/server.ts'

type SearchResponse = components['schemas']['SearchResponse']
type SearchResult = components['schemas']['SearchResultItem']

const studioMbid = '7408f11c-6c4e-41e5-b81b-6a15bf6cb268'

// The shape of the real search for Redbone by Childish Gambino: one song with live and compilation copies folded
// behind it, and a radio edit that is a recording of its own.
const redbone: SearchResult = {
  mbid: studioMbid,
  title: 'Redbone',
  artist: 'Childish Gambino',
  firstReleaseTitle: 'Awaken, My Love!',
  year: 2016,
  score: 100,
  creditsStatus: null,
  versions: [
    {
      mbid: 'e493730c-06d8-40b6-9c9e-c86dcc85ca4b',
      title: 'Redbone',
      artist: 'Childish Gambino',
      firstReleaseTitle: 'Annie Mac Presents 2017',
      year: 2017,
      score: 100,
      kind: 'compilation',
      note: 'part of a “Annie Mac Presents 2017” DJ-mix',
      creditsStatus: null,
    },
    {
      mbid: 'b728e7b1-ab7d-437c-b807-6eb4f3ad8f01',
      title: 'redbone',
      artist: 'Childish Gambino',
      firstReleaseTitle: 'Live at Coachella',
      year: 2019,
      score: 100,
      kind: 'live',
      note: null,
      creditsStatus: null,
    },
  ],
}

const radioEdit: SearchResult = {
  mbid: 'b0de8952-adda-43e9-aeb9-e749c3422b72',
  title: 'Redbone (radio edit)',
  artist: 'Childish Gambino',
  firstReleaseTitle: 'Now 2017 Vol. 1',
  year: 2017,
  score: 89,
  creditsStatus: null,
  versions: [],
}

function respondWith(response: SearchResponse) {
  server.use(http.get('/api/v1/search/recordings', () => HttpResponse.json(response)))
}

describe('search', () => {
  it('FR_SEARCH_01 shows the results for the search in the address', async () => {
    respondWith({ source: 'musicBrainz', results: [redbone, radioEdit] })
    renderAt('/?q=Redbone&artist=Childish%20Gambino')

    expect(await screen.findByRole('heading', { level: 2, name: 'Results for “Redbone” by Childish Gambino' })).toBeInTheDocument()

    const list = await screen.findByRole('list', { name: 'Search results' })
    const rows = within(list).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(within(rows[0]!).getByText('Childish Gambino · Awaken, My Love! (2016)')).toBeInTheDocument()
    expect(within(rows[0]!).getByText('100% match')).toBeInTheDocument()
    expect(within(rows[1]!).getByText('Redbone (radio edit)')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('2 songs found')
  })

  it('FR_SEARCH_01 sends the title and the artist from the address to the Api', async () => {
    let requested: URL | undefined
    server.use(
      http.get('/api/v1/search/recordings', ({ request }) => {
        requested = new URL(request.url)
        return HttpResponse.json({ source: 'musicBrainz', results: [] })
      }),
    )
    renderAt('/?q=Redbone&artist=Childish%20Gambino')

    await screen.findByRole('status')

    expect(requested?.searchParams.get('q')).toBe('Redbone')
    expect(requested?.searchParams.get('artist')).toBe('Childish Gambino')
  })

  it('FR_SEARCH_02 folds duplicates behind the original and expands them on request', async () => {
    const user = userEvent.setup()
    respondWith({ source: 'musicBrainz', results: [redbone] })
    renderAt('/?q=Redbone')

    const toggle = await screen.findByRole('button', { name: 'Show 2 other versions' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('list', { name: 'Other versions of Redbone' })).not.toBeInTheDocument()

    await user.click(toggle)

    expect(screen.getByRole('button', { name: 'Hide 2 other versions' })).toHaveAttribute('aria-expanded', 'true')
    const versions = within(screen.getByRole('list', { name: 'Other versions of Redbone' })).getAllByRole('listitem')
    expect(versions).toHaveLength(2)
    expect(within(versions[0]!).getByText('Compilation')).toBeInTheDocument()
    expect(within(versions[0]!).getByText(/part of a “Annie Mac Presents 2017” DJ-mix/)).toBeInTheDocument()
    expect(within(versions[1]!).getByText('Live')).toBeInTheDocument()
  })

  it('FR_SEARCH_02 offers no expand control for a song with nothing folded behind it', async () => {
    respondWith({ source: 'musicBrainz', results: [radioEdit] })
    renderAt('/?q=Redbone')

    await screen.findByText('Redbone (radio edit)')

    expect(screen.queryByRole('button', { name: /other version/ })).not.toBeInTheDocument()
  })

  it('FR_SEARCH_01 the search form puts the search in the address and shows its results', async () => {
    const user = userEvent.setup()
    const requests: URL[] = []
    server.use(
      http.get('/api/v1/search/recordings', ({ request }) => {
        requests.push(new URL(request.url))
        return HttpResponse.json({ source: 'musicBrainz', results: [redbone] } satisfies SearchResponse)
      }),
    )
    renderAt('/')

    await user.type(screen.getByRole('textbox', { name: 'Song title' }), 'Redbone')
    await user.type(screen.getByRole('textbox', { name: 'Artist (optional)' }), 'Childish Gambino')
    await user.click(screen.getByRole('button', { name: 'Search' }))

    expect(await screen.findByRole('heading', { level: 2, name: 'Results for “Redbone” by Childish Gambino' })).toBeInTheDocument()
    expect(await screen.findByText('Childish Gambino · Awaken, My Love! (2016)')).toBeInTheDocument()
    expect(requests).toHaveLength(1)
    expect(requests[0]?.searchParams.get('artist')).toBe('Childish Gambino')
  })

  it('FR_SEARCH_01 submits with the Enter key from the title box', async () => {
    const user = userEvent.setup()
    respondWith({ source: 'musicBrainz', results: [radioEdit] })
    renderAt('/')

    await user.type(screen.getByRole('textbox', { name: 'Song title' }), 'Redbone{Enter}')

    expect(await screen.findByText('Redbone (radio edit)')).toBeInTheDocument()
  })

  it('FR_SEARCH_01 does not send a title shorter than two characters and says why', async () => {
    const user = userEvent.setup()
    let calls = 0
    server.use(
      http.get('/api/v1/search/recordings', () => {
        calls += 1
        return HttpResponse.json({ source: 'musicBrainz', results: [] })
      }),
    )
    renderAt('/')

    await user.type(screen.getByRole('textbox', { name: 'Song title' }), 'a')
    await user.click(screen.getByRole('button', { name: 'Search' }))

    expect(await screen.findByText('Type at least 2 characters of a song title.')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Song title' })).toBeInvalid()
    expect(calls).toBe(0)
  })

  it('FR_SEARCH_01 says when no song was found', async () => {
    respondWith({ source: 'musicBrainz', results: [] })
    renderAt('/?q=zzzzqx')

    expect(await screen.findByText('No songs found. Check the spelling, or try fewer words.')).toBeInTheDocument()
  })

  it('FR_SEARCH_01 leaves out a year that is not known instead of showing 0', async () => {
    respondWith({ source: 'musicBrainz', results: [{ ...radioEdit, year: null, firstReleaseTitle: null }] })
    renderAt('/?q=Redbone')

    expect(await screen.findByText('Childish Gambino')).toBeInTheDocument()
    expect(screen.queryByText(/\b0\b/)).not.toBeInTheDocument()
  })

  it('FR_SEARCH_01 shows what the cache already holds for a song', async () => {
    respondWith({
      source: 'musicBrainz',
      results: [
        { ...redbone, creditsStatus: 'complete', versions: [] },
        { ...radioEdit, creditsStatus: 'partial' },
        { ...radioEdit, mbid: 'c0de8952-adda-43e9-aeb9-e749c3422b72', title: 'Redbone (WBBL remix)', creditsStatus: 'none' },
      ],
    })
    renderAt('/?q=Redbone')

    expect(await screen.findByText('Credits cached')).toBeInTheDocument()
    expect(screen.getByText('Some credits cached')).toBeInTheDocument()
    expect(screen.getAllByText(/credits cached/i)).toHaveLength(2)
  })

  it('FR_SEARCH_01 tells the person when the answer came from songs Nodeable already knows', async () => {
    respondWith({ source: 'cache', results: [radioEdit] })
    renderAt('/?q=Redbone')

    expect(await screen.findByRole('status')).toHaveTextContent('1 song found, from songs Nodeable already knows')
  })

  it('NFR_RATE_01 explains a busy search and lets the person try again', async () => {
    const user = userEvent.setup()
    let calls = 0
    server.use(
      http.get('/api/v1/search/recordings', () => {
        calls += 1
        return calls === 1
          ? HttpResponse.json({ type: '/errors/rate-limited' }, { status: 429, headers: { 'Retry-After': '2' } })
          : HttpResponse.json({ source: 'musicBrainz', results: [radioEdit] } satisfies SearchResponse)
      }),
    )
    renderAt('/?q=Redbone')

    expect(await screen.findByRole('alert')).toHaveTextContent('Search is busy right now. Try again in a few seconds.')
    // The person decides when to ask again: nothing was retried behind their back.
    expect(calls).toBe(1)

    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('Redbone (radio edit)')).toBeInTheDocument()
    expect(calls).toBe(2)
  })

  it('NFR_RATE_03 explains that MusicBrainz is not answering', async () => {
    server.use(
      http.get('/api/v1/search/recordings', () =>
        HttpResponse.json({ type: '/errors/upstream-unavailable' }, { status: 503, headers: { 'Retry-After': '5' } }),
      ),
    )
    renderAt('/?q=Redbone')

    expect(await screen.findByRole('alert')).toHaveTextContent('MusicBrainz is not answering right now.')
  })

  it('NFR_A11Y_01 the search form is a labelled search landmark in the banner', async () => {
    renderAt('/')

    const search = await screen.findByRole('search', { name: 'Search for a song' })

    expect(within(screen.getByRole('banner')).getByRole('search', { name: 'Search for a song' })).toBe(search)
  })

  it('FR_SEARCH_01 fills the boxes from the address and follows it when it changes', async () => {
    const user = userEvent.setup()
    respondWith({ source: 'musicBrainz', results: [radioEdit] })
    renderAt('/?q=Redbone&artist=Childish%20Gambino')

    const title = await screen.findByRole('textbox', { name: 'Song title' })
    expect(title).toHaveValue('Redbone')
    expect(screen.getByRole('textbox', { name: 'Artist (optional)' })).toHaveValue('Childish Gambino')

    // A new search through the form changes the address; the boxes keep showing what was searched for.
    await user.clear(title)
    await user.type(title, 'Creep{Enter}')

    expect(await screen.findByRole('heading', { level: 2, name: /Results for “Creep”/ })).toBeInTheDocument()
  })
})
