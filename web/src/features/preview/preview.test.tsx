import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { Providers } from '../../app/providers.tsx'
import { server } from '../../test/server.ts'
import { PreviewControl, type PreviewSong } from './PreviewControl.tsx'
import { clock, deezerSearchUrl } from './previewFormat.ts'
import { resetPreviewPlaybackForTests, usePlayingSong } from './previewPlayback.ts'

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

const audioHost = 'https://cdnt-preview.dzcdn.net/*'

/** A clip of 3,200 samples: a quiet half, then a loud one, in two channels, 30 seconds long as a Deezer preview is. */
function fakeClip() {
  const left = new Float32Array(3200)
  const right = new Float32Array(3200)
  for (let i = 0; i < 3200; i++) {
    const loud = i >= 1600
    left[i] = (loud ? 0.8 : 0.2) * Math.sin(i)
    right[i] = left[i] ?? 0
  }
  return { numberOfChannels: 2, duration: 30, getChannelData: (channel: number) => (channel === 0 ? left : right) }
}

/** Makes `new OfflineAudioContext(...).decodeAudioData(bytes)` answer with `clip`, or fail when it is null. */
function stubWebAudio(clip: ReturnType<typeof fakeClip> | null) {
  class FakeOffline {
    decodeAudioData() {
      return clip === null ? Promise.reject(new Error('not decodable')) : Promise.resolve(clip)
    }
  }
  vi.stubGlobal('OfflineAudioContext', FakeOffline)
}

beforeEach(() => {
  server.use(http.get(audioHost, () => new HttpResponse(new Uint8Array([73, 68, 51, 4, 0]), { headers: { 'Content-Type': 'audio/mpeg' } })))
  let made = 0
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => `blob:preview-${++made}`, revokeObjectURL: () => undefined }))
  stubWebAudio(null)
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
  vi.unstubAllGlobals()
})

describe('PreviewControl', () => {
  it('FR_PREVIEW_01 asks the Api for the address when play is pressed, plays it, and offers pause', async () => {
    servePreview(redbone.mbid)
    show(redbone)

    fireEvent.click(play('Redbone'))

    await waitFor(() => expect(pause('Redbone')).toBeInTheDocument())
    // The bytes were fetched once to be decoded and are played from that fetch (no second download).
    const element = playSpy.mock.contexts[0] as HTMLAudioElement
    expect(element.src).toBe('blob:preview-1')
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
    // The audio host refuses the first address (an expired signature), so it is played directly and fails; the second works.
    server.use(http.get(audioHost, ({ request }) => (request.url.includes('n1') ? new HttpResponse(null, { status: 403 }) : new HttpResponse(new Uint8Array([1]), { headers: { 'Content-Type': 'audio/mpeg' } }))))
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

describe('the waveform (FR-WAVE-01)', () => {
  const slider = () => screen.getByRole('slider', { name: 'Preview position of Redbone' })

  it('FR_WAVE_01 draws 160 bars from the decoded audio and plays the same bytes', async () => {
    stubWebAudio(fakeClip())
    servePreview(redbone.mbid)
    const { container } = show(redbone)

    fireEvent.click(play('Redbone'))

    await waitFor(() => expect(slider()).toBeInTheDocument())
    expect(container.querySelectorAll('svg rect')).toHaveLength(160)
    expect(slider()).toHaveAttribute('aria-valuemax', '30')
    expect(slider()).toHaveAttribute('aria-valuetext', '0:00 of 0:30')
    const element = playSpy.mock.contexts[0] as HTMLAudioElement
    expect(element.src).toBe('blob:preview-1')
  })

  it('FR_WAVE_01 the arrow keys, Page keys, Home and End seek, and the audio element is what moves', async () => {
    stubWebAudio(fakeClip())
    servePreview(redbone.mbid)
    show(redbone)
    fireEvent.click(play('Redbone'))
    await waitFor(() => expect(slider()).toBeInTheDocument())
    const element = playSpy.mock.contexts[0] as HTMLAudioElement

    fireEvent.keyDown(slider(), { key: 'ArrowRight' })
    expect(element.currentTime).toBe(1)
    fireEvent.keyDown(slider(), { key: 'PageUp' })
    expect(element.currentTime).toBe(6)
    fireEvent.keyDown(slider(), { key: 'ArrowLeft' })
    expect(element.currentTime).toBe(5)
    fireEvent.keyDown(slider(), { key: 'End' })
    expect(element.currentTime).toBe(30)
    fireEvent.keyDown(slider(), { key: 'Home' })
    expect(element.currentTime).toBe(0)
    expect(slider()).toHaveAttribute('aria-valuetext', '0:00 of 0:30')
  })

  it('FR_WAVE_01 a click on the waveform seeks to that point', async () => {
    stubWebAudio(fakeClip())
    servePreview(redbone.mbid)
    show(redbone)
    fireEvent.click(play('Redbone'))
    await waitFor(() => expect(slider()).toBeInTheDocument())
    const element = playSpy.mock.contexts[0] as HTMLAudioElement
    vi.spyOn(slider(), 'getBoundingClientRect').mockReturnValue({ left: 100, width: 400, top: 0, height: 44, right: 500, bottom: 44, x: 100, y: 0, toJSON: () => ({}) })
    // jsdom has no pointer capture.
    slider().setPointerCapture = () => undefined

    fireEvent.pointerDown(slider(), { clientX: 300, pointerId: 1 })

    expect(element.currentTime).toBe(15)
    expect(slider()).toHaveAttribute('aria-valuetext', '0:15 of 0:30')
  })

  it('FR_WAVE_01 audio that cannot be decoded plays with a progress bar and no waveform', async () => {
    stubWebAudio(null)
    servePreview(redbone.mbid)
    show(redbone)

    fireEvent.click(play('Redbone'))

    await waitFor(() => expect(pause('Redbone')).toBeInTheDocument())
    expect(screen.queryByRole('slider')).not.toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Preview position of Redbone' })).toBeInTheDocument()
    expect((playSpy.mock.contexts[0] as HTMLAudioElement).src).toBe('blob:preview-1')
  })

  it('FR_WAVE_01 audio that cannot be fetched from the page plays from its own address, without a waveform', async () => {
    stubWebAudio(fakeClip())
    server.use(http.get(audioHost, () => HttpResponse.error()))
    servePreview(redbone.mbid)
    show(redbone)

    fireEvent.click(play('Redbone'))

    await waitFor(() => expect(pause('Redbone')).toBeInTheDocument())
    expect(screen.queryByRole('slider')).not.toBeInTheDocument()
    expect((playSpy.mock.contexts[0] as HTMLAudioElement).src).toBe(previewUrl('one'))
  })

  it('NFR_MOTION_01 the draw-in of the waveform is declared only for no-preference, so reduced motion simply shows the bars', async () => {
    stubWebAudio(fakeClip())
    servePreview(redbone.mbid)
    show(redbone)
    fireEvent.click(play('Redbone'))
    await waitFor(() => expect(slider()).toBeInTheDocument())

    const unguarded: string[] = []
    const visit = (rules: CSSRuleList, guarded: boolean) => {
      for (const rule of Array.from(rules)) {
        const nested = (rule as CSSGroupingRule).cssRules
        if ('media' in rule && nested !== undefined) {
          visit(nested, guarded || /prefers-reduced-motion:\s*(?:no-preference|reduce)/.test((rule as CSSMediaRule).media.mediaText))
        } else if (!guarded && 'selectorText' in rule) {
          const css = (rule as CSSStyleRule).cssText
          if (/(?:^|[;{\s])animation[\w-]*\s*:/.test(css) && !/-Mui[A-Z]/.test((rule as CSSStyleRule).selectorText)) unguarded.push(css.slice(0, 120))
        }
      }
    }
    for (const sheet of Array.from(document.styleSheets)) visit(sheet.cssRules, false)

    expect(unguarded).toEqual([])
  })

  it('NFR_MOTION_01 the song whose preview is playing is the one the orbit spins, and it stops with the sound', async () => {
    servePreview(redbone.mbid)
    function Probe() {
      return <output aria-label="playing song">{usePlayingSong() ?? 'none'}</output>
    }
    render(
      <Providers>
        <PreviewControl song={redbone} />
        <Probe />
      </Providers>,
    )
    expect(screen.getByLabelText('playing song')).toHaveTextContent('none')

    fireEvent.click(play('Redbone'))
    await waitFor(() => expect(screen.getByLabelText('playing song')).toHaveTextContent(redbone.mbid))

    fireEvent.click(pause('Redbone'))
    await waitFor(() => expect(screen.getByLabelText('playing song')).toHaveTextContent('none'))
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
