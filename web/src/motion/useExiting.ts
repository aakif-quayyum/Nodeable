import { useEffect, useState } from 'react'
import { useReducedMotion } from './useReducedMotion.ts'

export interface Presence<T> {
  item: T
  /** True while the item has left the list and is playing its exit. */
  leaving: boolean
}

/**
 * Keeps an item that has just left a list in it for `ms` milliseconds, so it can play an exit animation before it is
 * removed (FR-GRAPH-06). A leaving item stays at the place it had. With reduced motion nothing lingers: the item is gone
 * at once, which is the still version of the exit.
 */
export function useExiting<T>(items: readonly T[], keyOf: (item: T) => string, ms = 260): Presence<T>[] {
  const reduced = useReducedMotion()
  const [state, setState] = useState<{ items: readonly T[]; leaving: { item: T; index: number }[] }>({ items, leaving: [] })

  let current = state
  if (state.items !== items) {
    // Compared while rendering, not in an effect: the item is never missing from the page for a frame.
    const keys = new Set(items.map(keyOf))
    const leaving = reduced
      ? []
      : [
          ...state.leaving.filter(({ item }) => !keys.has(keyOf(item))),
          ...state.items
            .map((item, index) => ({ item, index }))
            .filter(({ item }) => !keys.has(keyOf(item)) && !state.leaving.some((entry) => keyOf(entry.item) === keyOf(item))),
        ]
    current = { items, leaving }
    setState(current)
  }

  const lingering = current.leaving
  useEffect(() => {
    if (lingering.length === 0) return
    const timer = setTimeout(() => setState((now) => ({ ...now, leaving: [] })), ms)
    return () => clearTimeout(timer)
  }, [lingering, ms])

  const list: Presence<T>[] = items.map((item) => ({ item, leaving: false }))
  for (const { item, index } of [...lingering].sort((a, b) => a.index - b.index)) {
    list.splice(Math.min(index, list.length), 0, { item, leaving: true })
  }
  return list
}
