import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { Providers } from '../../app/providers.tsx'
import { server } from '../../test/server.ts'
import { PreviewControl, type PreviewSong } from './PreviewControl.tsx'
import { clock, deezerSearchUrl } from './previewFormat.ts'
import { resetPreviewPlaybackForTests } from './previewPlayback.ts'

const redbone: PreviewSong = {
  mbid: '7408f11c-6c4e-41e5-b81b-6a15bf6cb268',
  title: 'Redbone',
  artist: 'Childish Gambino',
  hasPreview: true,
  creditsStatus: 'complete',
}
const stay: PreviewSong = { ...redbone, mbid: 'ac5977af-d4dc-4636-b867-b02e15d2f6d8', title: 'Stay', artist: 'The Kid LAROI' }

const candidates = [
  {
    trackId: '350320101',
    title: 'Redbone',
    artist: 'Childish Gambino',
    album: 'Award Tour',
    durationSeconds: 326,
    coverMd5: '52a01335022b31b52b96106583ead686',
  },
  { trackId: '435821782', title: 'Redbone (Live)', artist: 'Childish Gambino', album: 'Best Of 2017', durationSeconds: 326, coverMd5: null },
]

const previewUrl = (id: string) => `https://cdnt-preview.dzcdn.net/api/1/1/a/b/${id}.mp3?hdnea=exp=1791969375~hmac=00`

function servePreview(mbid: string, id = 'one') {
  server.use(
    http.get(`/api/v1/recordings/${mbid}/preview`, () =>
      HttpResponse.json({ url: previewUrl(id), expiresAt: '2026-10-14T09:33:18+00:00' }),
    ),
  )
}

function show(...songs: PreviewSong[]) {
  return render(
    <Providers>
      {songs.map((song) => (
        <PreviewControl key={song.mbid} song={song} />
      ))}
    </Providers>,
  )
}

const play = (title: string) => screen.getByRole('button', { name: `Play the preview of ${title}` })
const pause = (title: string) => screen.getByRole('button', { name: `Pause the preview of ${title}` })

// jsdom has no media pipeline: play() and pause() are stood in for by the events a real element would send.
let playSpy: MockInstance<HTMLMediaElement['play']>
let pauseSpy: MockInstance<HTMLMediaElement['pause']>

beforeEach(() => {
  playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
    queueMicrotask(() => this.dispatchEvent(new Event('playing')))
    return Promise.resolve()
  })
  pauseSpy = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement) {
    this.dispatchEvent(new Event('pause'))
  })
})

afterEach(() => {
  resetPreviewPlaybackForTests()
  vi.restoreAllMocks()
})

describe('PreviewControl', () => {
  it('FR_PREVIEW_01 asks the Api for the address when play is pressed, plays it, and offers pause', async () => {
    servePreview(redbone.mbid)
    show(redbone)

    fireEvent.click(play('Redbone'))

    await waitFor(() => expect(pause('Redbone')).toBeInTheDocument())
    const element = playSpy.mock.contexts[0] as HTMLAudioElement
    expect(element.src).toBe(previewUrl('one'))
  })

  it('FR_PREVIEW_01 pause stops it and play carries on without asking for a new address', async () => {
    let asked = 0
    server.use(
      http.get(`/api/v1/recordings/${redbone.mbid}/preview`, () => {
        asked++
        return HttpResponse.json({ url: previewUrl('one'), expiresAt: null })
      }),
    )
    show(redbone)

    fireEvent.click(play('Redbone'))
    await waitFor(() => expect(pause('Redbone')).toBeInTheDocument())
    fireEvent.click(pause('Redbone'))
    await waitFor(() => expect(play('Redbone')).toBeInTheDocument())
    fireEvent.click(play('Redbone'))
    await waitFor(() => expect(pause('Redbone')).toBeInTheDocument())

    expect(asked).toBe(1)
  })

  it('FR_PREVIEW_01 playing a second song stops the first: there is one audio element', async () => {
    servePreview(redbone.mbid, 'one')
    servePreview(stay.mbid, 'two')
    show(redbone, stay)

    fireEvent.click(play('Redbone'))
    await waitFor(() => expect(pause('Redbone')).toBeInTheDocument())
    fireEvent.click(play('Stay'))

    await waitFor(() => expect(pause('Stay')).toBeInTheDocument())
    expect(play('Redbone')).toBeInTheDocument()
  })

  it('FR_PREVIEW_01 a recording the Api says has no preview is said so, not retried', async () => {
    server.use(
      http.get(`/api/v1/recordings/${redbone.mbid}/preview`, () =>
        HttpResponse.json({ type: '/errors/preview-not-found', status: 404 }, { status: 404 }),
      ),
    )
    show(redbone)

    fireEvent.click(play('Redbone'))

    expect(await screen.findAllByText('This song no longer has a preview.')).not.toHaveLength(0)
    expect(play('Redbone')).toBeDisabled()
  })

  it('FR_PREVIEW_01 a busy Deezer (503) says try again, and pressing play asks again', async () => {
    let calls = 0
    server.use(
      http.get(`/api/v1/recordings/${redbone.mbid}/preview`, () => {
        calls++
        return calls === 1
          ? HttpResponse.json({ status: 503 }, { status: 503, headers: { 'Retry-After': '5' } })
          : HttpResponse.json({ url: previewUrl('one'), expiresAt: null })
      }),
    )
    show(redbone)

    fireEvent.click(play('Redbone'))
    expect((await screen.findAllByText(/could not be loaded just now/)).length).toBeGreaterThan(0)

    fireEvent.click(play('Redbone'))
    await waitFor(() => expect(pause('Redbone')).toBeInTheDocument())
    expect(calls).toBe(2)
  })

  it('FR_PREVIEW_01 an address that expired while paused is replaced once, then it gives up', async () => {
    let calls = 0
    server.use(
      http.get(`/api/v1/recordings/${redbone.mbid}/preview`, () => {
        calls++
        return HttpResponse.json({ url: previewUrl(`n${calls}`), expiresAt: null })
      }),
    )
    // The audio fails to load the first time (an expired signature) and works the second time.
    playSpy.mockImplementation(function (this: HTMLMediaElement) {
      queueMicrotask(() => this.dispatchEvent(new Event(this.src.endsWith('n1.mp3?hdnea=exp=1791969375~hmac=00') ? 'error' : 'playing')))
      return Promise.resolve()
    })
    show(redbone)

    fireEvent.click(play('Redbone'))

    await waitFor(() => expect(pause('Redbone')).toBeInTheDocument())
    expect(calls).toBe(2)
  })

  it('FR_PREVIEW_01 a song without a preview offers to pick the right version, and no play button', () => {
    show({ ...redbone, hasPreview: false })

    expect(screen.getByRole('button', { name: 'Pick the right version' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Play the preview/ })).not.toBeInTheDocument()
  })

  it('FR_PREVIEW_01 the dialog lists the results with title, artist, album and length, and keeps the Deezer link as a last resort', async () => {
    server.use(http.get(`/api/v1/recordings/${redbone.mbid}/preview/candidates`, () => HttpResponse.json({ candidates })))
    show({ ...redbone, hasPreview: false })

    fireEvent.click(screen.getByRole('button', { name: 'Pick the right version' }))

    const list = await screen.findByRole('list', { name: 'Deezer results' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
    expect(within(list).getByText('Redbone')).toBeInTheDocument()
    expect(within(list).getByText('Award Tour · 5:26')).toBeInTheDocument()
    expect(within(list).getByRole('button', { name: /Use this version: Redbone by Childish Gambino, Award Tour · 5:26/ })).toBeInTheDocument()

    const link = screen.getByRole('link', { name: /Look for it on Deezer/ })
    expect(link).toHaveAttribute('href', 'https://www.deezer.com/search/Childish%20Gambino%20Redbone')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('FR_PREVIEW_01 opening the dialog asks Deezer for the list once, not on every render', async () => {
    let asked = 0
    server.use(
      http.get(`/api/v1/recordings/${redbone.mbid}/preview/candidates`, () => {
        asked++
        return HttpResponse.json({ candidates })
      }),
    )
    // StrictMode mounts, unmounts and mounts again in development, which is where a list asked for in a loop showed up.
    render(
      <StrictMode>
        <Providers>
          <PreviewControl song={{ ...redbone, hasPreview: false }} />
        </Providers>
      </StrictMode>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Pick the right version' }))
    await screen.findByRole('list', { name: 'Deezer results' })
    await new Promise((resolve) => setTimeout(resolve, 300))

    expect(asked).toBe(1)
  })

  it('FR_PREVIEW_01 choosing a result sends only its track id, then closes the dialog', async () => {
    let sent: unknown = null
    server.use(
      http.get(`/api/v1/recordings/${redbone.mbid}/preview/candidates`, () => HttpResponse.json({ candidates })),
      http.post(`/api/v1/recordings/${redbone.mbid}/preview/pick`, async ({ request }) => {
        sent = await request.json()
        return HttpResponse.json({ hasPreview: true, deezerCoverMd5: null })
      }),
    )
    show({ ...redbone, hasPreview: false })
    fireEvent.click(screen.getByRole('button', { name: 'Pick the right version' }))
    const choice = await screen.findByRole('button', { name: /Use this version: Redbone by Childish Gambino/ })

    fireEvent.click(choice)

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(sent).toEqual({ trackId: '350320101' })
  })

  it('FR_PREVIEW_01 a refused pick says why and leaves the dialog open', async () => {
    server.use(
      http.get(`/api/v1/recordings/${redbone.mbid}/preview/candidates`, () => HttpResponse.json({ candidates })),
      http.post(`/api/v1/recordings/${redbone.mbid}/preview/pick`, () => HttpResponse.json({ status: 429 }, { status: 429 })),
    )
    show({ ...redbone, hasPreview: false })
    fireEvent.click(screen.getByRole('button', { name: 'Pick the right version' }))
    fireEvent.click(await screen.findByRole('button', { name: /Use this version: Redbone by Childish Gambino/ }))

    expect(await screen.findByText(/Too many tries in a minute/)).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('FR_PREVIEW_01 a busy Deezer while listing says so, and an empty list says there is nothing to pick', async () => {
    server.use(http.get(`/api/v1/recordings/${redbone.mbid}/preview/candidates`, () => HttpResponse.json({ status: 503 }, { status: 503 })))
    const first = show({ ...redbone, hasPreview: false })
    fireEvent.click(screen.getByRole('button', { name: 'Pick the right version' }))
    expect(await screen.findByText(/Deezer could not be reached/)).toBeInTheDocument()
    first.unmount()

    server.use(http.get(`/api/v1/recordings/${redbone.mbid}/preview/candidates`, () => HttpResponse.json({ candidates: [] })))
    show({ ...redbone, hasPreview: false })
    fireEvent.click(screen.getByRole('button', { name: 'Pick the right version' }))
    expect(await screen.findByText(/no result with a preview/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Look for it on Deezer/ })).toBeInTheDocument()
  })

  it('FR_PREVIEW_01 a song still loading its credits shows nothing until it is settled', () => {
    show({ ...redbone, hasPreview: false, creditsStatus: 'loading' })

    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('FR_PREVIEW_01 a card that leaves the page stops its audio', async () => {
    servePreview(redbone.mbid)
    const { unmount } = show(redbone)

    fireEvent.click(play('Redbone'))
    await waitFor(() => expect(pause('Redbone')).toBeInTheDocument())
    const pauses = pauseSpy.mock.calls.length
    unmount()

    expect(pauseSpy.mock.calls.length).toBeGreaterThan(pauses)
  })
})

describe('previewFormat', () => {
  it('FR_PREVIEW_01 shows seconds as m:ss', () => {
    expect(clock(0)).toBe('0:00')
    expect(clock(12.9)).toBe('0:12')
    expect(clock(30)).toBe('0:30')
    expect(clock(75)).toBe('1:15')
    expect(clock(-3)).toBe('0:00')
  })

  it('FR_PREVIEW_01 the Deezer search link carries the artist and title, escaped', () => {
    expect(deezerSearchUrl({ title: "Don't Stop", artist: 'AC/DC & Co' })).toBe(
      "https://www.deezer.com/search/AC%2FDC%20%26%20Co%20Don't%20Stop",
    )
  })
})
