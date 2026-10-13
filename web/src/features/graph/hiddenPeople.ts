import { useSyncExternalStore } from 'react'

/**
 * The people a person has hidden from the views (FR-VIEW-03), for the browser session: kept in `sessionStorage` under
 * the graph's id, so a reload keeps them and closing the tab forgets them. They are never sent to the server.
 *
 * Storage can throw (a private window, blocked site data), so the answer is also kept in memory and the feature works
 * for the life of the page without it.
 */
const storageKey = (graphId: string) => `nodeable.hidden.${graphId}`

const listeners = new Set<() => void>()
const memory = new Map<string, ReadonlySet<string>>()
const empty: ReadonlySet<string> = new Set()

function parse(raw: string | null): ReadonlySet<string> {
  if (raw === null) return empty
  try {
    const value: unknown = JSON.parse(raw)
    if (Array.isArray(value)) return new Set(value.filter((entry): entry is string => typeof entry === 'string'))
  } catch {
    // Not JSON: nobody is hidden.
  }
  return empty
}

function read(graphId: string): ReadonlySet<string> {
  const known = memory.get(graphId)
  if (known !== undefined) return known

  let raw: string | null = null
  try {
    raw = sessionStorage.getItem(storageKey(graphId))
  } catch {
    // No storage: start with nobody hidden.
  }
  const loaded = parse(raw)
  memory.set(graphId, loaded)
  return loaded
}

function write(graphId: string, next: ReadonlySet<string>): void {
  memory.set(graphId, next)
  try {
    if (next.size === 0) sessionStorage.removeItem(storageKey(graphId))
    else sessionStorage.setItem(storageKey(graphId), JSON.stringify([...next]))
  } catch {
    // See `read`: the memory copy is what the page uses.
  }
  listeners.forEach((listener) => listener())
}

export function hidePerson(graphId: string, personMbid: string): void {
  write(graphId, new Set([...read(graphId), personMbid]))
}

export function showPerson(graphId: string, personMbid: string): void {
  const next = new Set(read(graphId))
  next.delete(personMbid)
  write(graphId, next)
}

export function showEveryone(graphId: string): void {
  write(graphId, empty)
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The MBIDs hidden in this graph. The same set object is returned until it changes, as `useSyncExternalStore` requires. */
export function useHiddenPeople(graphId: string): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, () => read(graphId), () => empty)
}

/** Forgets what is held in memory, so the next read comes from storage again. For tests. */
export function resetHiddenPeopleForTests(): void {
  memory.clear()
}
