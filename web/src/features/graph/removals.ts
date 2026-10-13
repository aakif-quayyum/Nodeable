import { create } from 'zustand'

/** How long a removal can be undone (FR-GRAPH-06). The request is sent when this has passed. */
export const undoWindowMs = 6000

let windowMs = undoWindowMs

/** Shortens the undo window, so a test can see the request being sent without waiting six seconds. */
export function setUndoWindowForTests(ms: number): void {
  windowMs = ms
}

/** Forgets every waiting removal and the notice, and restores the window. For tests. */
export function resetRemovalsForTests(): void {
  for (const timer of timers.values()) clearTimeout(timer)
  timers.clear()
  commits.clear()
  windowMs = undoWindowMs
  useRemovals.setState({ pending: [], failed: null })
}

export interface PendingRemoval {
  mbid: string
  title: string
  artist: string
}

interface RemovalState {
  /** In the order they were removed; the last one is the one the undo bar offers. */
  pending: readonly PendingRemoval[]
  /** The title of a song whose removal the Api refused, until the person dismisses the notice. */
  failed: string | null
  dismissFailure: () => void
}

export const useRemovals = create<RemovalState>((set) => ({
  pending: [],
  failed: null,
  dismissFailure: () => set({ failed: null }),
}))

// What to do when a song's time is up, and the timer that does it. Kept outside the store: a store holds what the
// screen shows, and a function or a timer handle is not that.
const commits = new Map<string, () => Promise<void>>()
const timers = new Map<string, ReturnType<typeof setTimeout>>()

async function commit(mbid: string): Promise<void> {
  const send = commits.get(mbid)
  const song = useRemovals.getState().pending.find((entry) => entry.mbid === mbid)
  clearTimeout(timers.get(mbid))
  timers.delete(mbid)
  commits.delete(mbid)
  if (send === undefined) return

  try {
    await send()
  } catch {
    // The Api refused: the song comes back (it is no longer pending) and the person is told.
    useRemovals.setState({ failed: song?.title ?? 'That song' })
  } finally {
    useRemovals.setState((state) => ({ pending: state.pending.filter((entry) => entry.mbid !== mbid) }))
  }
}

/**
 * Takes a song out of the views now and sends the removal when the undo window is over (FR-GRAPH-06). Until then the
 * server still has the song, so an undo is nothing to take back.
 */
export function scheduleRemoval(song: PendingRemoval, send: () => Promise<void>): void {
  if (commits.has(song.mbid)) return
  commits.set(song.mbid, send)
  useRemovals.setState((state) => ({ pending: [...state.pending, song] }))
  timers.set(song.mbid, setTimeout(() => void commit(song.mbid), windowMs))
}

/** Puts a song back: its time is cancelled and it is in the views again. */
export function undoRemoval(mbid: string): void {
  clearTimeout(timers.get(mbid))
  timers.delete(mbid)
  commits.delete(mbid)
  useRemovals.setState((state) => ({ pending: state.pending.filter((entry) => entry.mbid !== mbid) }))
}

/** Sends every waiting removal now: the person is leaving the workspace, so waiting out the undo would lose them. */
export function flushRemovals(): void {
  for (const mbid of [...commits.keys()]) void commit(mbid)
}
