import { useSyncExternalStore } from 'react'
import { apiClient } from '../../api/client.ts'

/** What the player is doing for the one song it may be playing at a time. */
export type PlaybackPhase =
  /** Nothing is playing or loaded. */
  | 'idle'
  /** The preview address is being asked for, or the audio is starting. */
  | 'loading'
  | 'playing'
  | 'paused'
  /** Deezer or the Api could not answer just now (503, 429, a network error, or audio that would not load): try again. */
  | 'busy'
  /** The Api says this recording has no preview (404), which is different from "try again". */
  | 'unavailable'

export interface PlaybackState {
  /** The recording the state is about; null when nothing is loaded. */
  songMbid: string | null
  phase: PlaybackPhase
  /** Seconds played. */
  position: number
  /** Seconds in the preview, read from the audio itself (Deezer sends no length for the preview); 0 until known. */
  duration: number
}

const initial: PlaybackState = { songMbid: null, phase: 'idle', position: 0, duration: 0 }

let state: PlaybackState = initial
const listeners = new Set<() => void>()
let audio: HTMLAudioElement | null = null
// Every start takes a number; an answer that arrives for an older start (the person pressed another song) is dropped.
let startToken = 0

function set(next: Partial<PlaybackState>) {
  state = { ...state, ...next }
  listeners.forEach((listener) => listener())
}

function element(): HTMLAudioElement {
  if (audio !== null) return audio

  const created = new Audio()
  created.preload = 'none'
  // The state follows the element's own events, so it is true even when the browser pauses the audio (a phone call, the
  // media keys), and one clock — the element's — drives both the time shown and, from the next step, the waveform.
  created.addEventListener('playing', () => {
    retriedFor = null
    set({ phase: 'playing' })
  })
  created.addEventListener('pause', () => {
    // "pause" also fires when the audio ends; the "ended" handler below has the last word then.
    if (!created.ended && state.phase === 'playing') set({ phase: 'paused' })
  })
  created.addEventListener('timeupdate', () => set({ position: created.currentTime }))
  created.addEventListener('loadedmetadata', () => set({ duration: Number.isFinite(created.duration) ? created.duration : 0 }))
  created.addEventListener('ended', () => set({ phase: 'idle', position: 0 }))
  created.addEventListener('error', () => {
    if (state.songMbid !== null && state.phase !== 'idle') void retryOnce(state.songMbid)
  })
  audio = created
  return created
}

type Fetched = { kind: 'url'; url: string } | { kind: 'unavailable' } | { kind: 'busy' }

async function fetchPreview(songMbid: string): Promise<Fetched> {
  try {
    const { data, response } = await apiClient.GET('/api/v1/recordings/{mbid}/preview', { params: { path: { mbid: songMbid } } })
    if (data !== undefined) return { kind: 'url', url: data.url }
    return response.status === 404 ? { kind: 'unavailable' } : { kind: 'busy' }
  } catch {
    return { kind: 'busy' }
  }
}

async function begin(songMbid: string, token: number): Promise<boolean> {
  const fetched = await fetchPreview(songMbid)
  if (token !== startToken) return false

  if (fetched.kind !== 'url') {
    set({ songMbid, phase: fetched.kind === 'unavailable' ? 'unavailable' : 'busy', position: 0, duration: 0 })
    return false
  }

  const player = element()
  player.src = fetched.url
  try {
    await player.play()
    return true
  } catch {
    // Playing was refused (the browser wants a gesture) or the address would not load: say so instead of spinning.
    if (token === startToken) set({ phase: 'busy' })
    return false
  }
}

// A preview address is signed and lasts about 15 minutes (decision 0022). A song paused for longer than that fails when it
// is resumed, so one failure asks the Api for a fresh address and tries once more before it says "busy".
let retriedFor: string | null = null
async function retryOnce(songMbid: string) {
  if (retriedFor === songMbid) {
    retriedFor = null
    set({ phase: 'busy' })
    return
  }
  retriedFor = songMbid
  set({ songMbid, phase: 'loading' })
  const token = ++startToken
  await begin(songMbid, token)
}

/**
 * Plays or pauses the preview of a recording (FR-PREVIEW-01). Pressing a different song stops the one that is playing:
 * there is one audio element, so two previews can never play at once.
 */
export async function togglePreview(songMbid: string): Promise<void> {
  const player = element()

  if (state.songMbid === songMbid && state.phase === 'playing') {
    player.pause()
    return
  }
  if (state.songMbid === songMbid && state.phase === 'paused') {
    try {
      await player.play()
    } catch {
      set({ phase: 'busy' })
    }
    return
  }

  player.pause()
  retriedFor = null
  const token = ++startToken
  set({ songMbid, phase: 'loading', position: 0, duration: 0 })
  await begin(songMbid, token)
}

/** Stops the preview if it is the given song's (the song was removed, or its card left the page). */
export function stopPreview(songMbid: string): void {
  if (state.songMbid !== songMbid) return
  startToken++
  if (audio !== null) {
    audio.pause()
    audio.removeAttribute('src')
  }
  set(initial)
}

/** For tests: forgets the element and the state. */
export function resetPreviewPlaybackForTests(): void {
  startToken++
  retriedFor = null
  audio = null
  state = initial
  listeners.clear()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// LEARN: LG-04 external-store | useSyncExternalStore reads state that lives outside React (here one audio element and a plain object): React subscribes to it and re-renders on change, so two components can show the same playback without a context provider or a copy
export function usePreviewPlayback(): PlaybackState {
  return useSyncExternalStore(subscribe, () => state)
}
