import { useSyncExternalStore } from 'react'
import { apiClient } from '../../api/client.ts'
import { decodePeaks } from './peaks.ts'

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
  /**
   * The waveform (FR-WAVE-01): peaks from 0 to 1, computed once from the decoded audio before the first frame, or null
   * when the audio could not be fetched or decoded, in which case the player works without one.
   */
  peaks: readonly number[] | null
}

const initial: PlaybackState = { songMbid: null, phase: 'idle', position: 0, duration: 0, peaks: null }

let state: PlaybackState = initial
const listeners = new Set<() => void>()
let audio: HTMLAudioElement | null = null
// Every start takes a number; an answer that arrives for an older start (the person pressed another song) is dropped.
let startToken = 0
// The address of the bytes being played, when they were fetched to be decoded: they are released when another preview starts.
let objectUrl: string | null = null

function releaseObjectUrl() {
  if (objectUrl !== null) {
    URL.revokeObjectURL(objectUrl)
    objectUrl = null
  }
}

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
    set({ songMbid, phase: fetched.kind === 'unavailable' ? 'unavailable' : 'busy', position: 0, duration: 0, peaks: null })
    return false
  }

  // LEARN: LG-04 one-fetch | The page fetches the preview once, decodes those bytes for the waveform and plays the same bytes from a Blob address, so there is one download, and when the fetch or the decode fails it plays the signed address as it would without a waveform
  let source = fetched.url
  let peaks: readonly number[] | null = null
  let length = 0
  try {
    const response = await fetch(fetched.url, { credentials: 'omit' })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const bytes = await response.arrayBuffer()
    if (token !== startToken) return false

    releaseObjectUrl()
    objectUrl = URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' }))
    source = objectUrl
    try {
      const decoded = await decodePeaks(bytes)
      peaks = decoded.peaks
      length = decoded.duration
    } catch {
      // Not decodable here: the bytes still play, just without a waveform.
    }
  } catch {
    // Not readable from this page (a CORS header gone, an expired address, no network): play the address directly.
    if (token !== startToken) return false
  }
  if (token !== startToken) return false
  set({ peaks, duration: length })

  const player = element()
  player.src = source
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
  set({ songMbid, phase: 'loading', position: 0, duration: 0, peaks: null })
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
  releaseObjectUrl()
  set(initial)
}

/**
 * Moves the playhead of the song that is loaded to `seconds` (clamped to the clip). The audio element is the one clock:
 * the time, the bar and the waveform's playhead all read from it, so they cannot disagree.
 */
export function seekPreview(songMbid: string, seconds: number): void {
  if (audio === null || state.songMbid !== songMbid) return
  const limit = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : state.duration
  const next = Math.min(Math.max(0, seconds), limit > 0 ? limit : seconds)
  audio.currentTime = next
  set({ position: next })
}

/** The element's own time, for a playhead that moves every frame; the state's `position` is updated about four times a second. */
export function playbackTime(): number {
  return audio?.currentTime ?? 0
}

/** True while this recording's preview is playing; only the two songs whose answer changes are drawn again. */
export function useIsPlaying(songMbid: string): boolean {
  return useSyncExternalStore(subscribe, () => state.phase === 'playing' && state.songMbid === songMbid)
}

/** The recording that is playing right now, or null. It changes only when playing starts or stops, not as time passes. */
export function usePlayingSong(): string | null {
  return useSyncExternalStore(subscribe, () => (state.phase === 'playing' ? state.songMbid : null))
}

/** For tests: forgets the element and the state. */
export function resetPreviewPlaybackForTests(): void {
  startToken++
  retriedFor = null
  releaseObjectUrl()
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
