import { useSyncExternalStore } from 'react'

/** The anonymous graph this browser owns: its id and the token that proves it (decision 0007). */
export interface GraphSession {
  id: string
  token: string
}

const storageKey = 'nodeable.graph'

const listeners = new Set<() => void>()

// Reading and writing storage can throw (private windows, blocked site data, a full quota), and what is stored can
// be anything a person or another version of the app left there, so every access is guarded and the result is checked.
function readRaw(): string | null {
  try {
    return localStorage.getItem(storageKey)
  } catch {
    return null
  }
}

// JSON.parse returns `any`; parsing into `unknown` and checking the fields with a type guard is what makes the value `GraphSession` for the compiler, so a stale or hand-edited entry becomes "no graph" instead of a crash later
function parse(raw: string | null): GraphSession | null {
  if (raw === null) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (
      typeof value === 'object' &&
      value !== null &&
      'id' in value &&
      'token' in value &&
      typeof value.id === 'string' &&
      typeof value.token === 'string' &&
      value.id.length > 0 &&
      value.token.length > 0
    ) {
      return { id: value.id, token: value.token }
    }
  } catch {
    // Not JSON: treated as no graph.
  }
  return null
}

let cachedRaw: string | null | undefined
let cachedSession: GraphSession | null = null

/**
 * The stored session. The same object is returned for as long as the stored text is the same: React compares
 * what a store returns with `Object.is`, so a new object on every call would re-render forever.
 */
export function readGraphSession(): GraphSession | null {
  const raw = readRaw()
  if (raw !== cachedRaw) {
    cachedRaw = raw
    cachedSession = parse(raw)
  }
  return cachedSession
}

function notify() {
  listeners.forEach((listener) => listener())
}

export function saveGraphSession(session: GraphSession): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(session))
  } catch {
    // Without storage the graph still works for this page; it is just not there after a reload.
  }
  notify()
}

export function clearGraphSession(): void {
  try {
    localStorage.removeItem(storageKey)
  } catch {
    // See saveGraphSession.
  }
  notify()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  // The `storage` event fires in the *other* tabs of the same origin, so a graph created in one tab shows in another.
  window.addEventListener('storage', listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', listener)
  }
}

/** The browser's graph, or null when it has none yet. */
export function useGraphSession(): GraphSession | null {
  // LEARN: LG-03 use-sync-external-store | `useSyncExternalStore` is React's hook for state that lives outside React (here localStorage): it takes a subscribe function and a getSnapshot function and re-renders when the snapshot changes, which `useState` plus an effect gets subtly wrong (tearing during concurrent rendering)
  return useSyncExternalStore(subscribe, readGraphSession, () => null)
}
