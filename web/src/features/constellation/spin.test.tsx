import { fireEvent, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { preloadConstellation, preloadGraphView } from '../../test/lazyChunks.ts'
import { resetPreviewPlaybackForTests } from '../preview/previewPlayback.ts'
import { FakeGraphHub } from '../../test/fakeGraphHub.ts'
import { renderAt } from '../../test/renderApp.tsx'
import { server } from '../../test/server.ts'
import { sampleSnapshot } from '../../test/workspaceFixtures.ts'

const graphId = '7c1e0000-0000-4000-8000-000000000000'

// The constellation's record of the playing song turns while it plays and only then (FR-WAVE-01, NFR-MOTION-01): the
// orbit has the same rule, and the stylesheet stills the turn with reduced motion.
describe('the playing song in the constellation', () => {
  beforeAll(async () => {
    await Promise.all([preloadGraphView(), preloadConstellation()])
  })

  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
      queueMicrotask(() => this.dispatchEvent(new Event('playing')))
      return Promise.resolve()
    })
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement) {
      this.dispatchEvent(new Event('pause'))
    })
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:spin', revokeObjectURL: () => undefined }))
    server.use(http.get('https://cdnt-preview.dzcdn.net/*', () => new HttpResponse(new Uint8Array([1]), { headers: { 'Content-Type': 'audio/mpeg' } })))
  })

  afterEach(() => {
    resetPreviewPlaybackForTests()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('FR_WAVE_01 only the record whose preview is playing is marked as turning, and it is unmarked when it stops', async () => {
    localStorage.setItem('nodeable.graph', JSON.stringify({ id: graphId, token: 'token-for-the-test' }))
    const snapshot = sampleSnapshot()
    snapshot.songs = snapshot.songs.map((song) => (song.mbid === 'song-redbone' ? { ...song, hasPreview: true } : song))
    server.use(
      http.get(`/api/v1/graphs/${graphId}`, () => HttpResponse.json(snapshot)),
      http.get('/api/v1/recordings/song-redbone/preview', () =>
        HttpResponse.json({ url: 'https://cdnt-preview.dzcdn.net/a.mp3?hdnea=exp=1791969375~hmac=00', expiresAt: null }),
      ),
    )
    const { container } = renderAt('/graph?view=constellation', { graphConnection: () => new FakeGraphHub() })
    await screen.findByRole('group', { name: /constellation/i })
    expect(container.querySelectorAll('.nd.is-spinning')).toHaveLength(0)

    fireEvent.click(await screen.findByRole('button', { name: 'Play the preview of Redbone' }))

    await waitFor(() => expect(container.querySelectorAll('.nd.is-spinning')).toHaveLength(1))
    expect(container.querySelector('.nd.is-spinning')?.getAttribute('aria-label')).toContain('Redbone')

    fireEvent.click(screen.getByRole('button', { name: 'Pause the preview of Redbone' }))
    await waitFor(() => expect(container.querySelectorAll('.nd.is-spinning')).toHaveLength(0))
  })
})
