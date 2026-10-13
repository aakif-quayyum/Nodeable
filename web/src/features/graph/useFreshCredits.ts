import { useEffect, useState } from 'react'
import { useReducedMotion } from '../../motion/useReducedMotion.ts'
import type { GraphSnapshot } from './graphEvents.ts'

/** How long a new credit stays highlighted in the liner notes (spec section 12). */
export const freshMs = 1600

/** The key of a credit as the liner notes show it: a person in a role on a song (the detail is not part of who). */
export const creditKey = (songMbid: string, personMbid: string, role: string) => `${songMbid}|${personMbid}|${role}`

const keysOf = (snapshot: GraphSnapshot) => new Set(snapshot.credits.map((credit) => creditKey(credit.songMbid, credit.personMbid, credit.role)))

/**
 * The credits that have just arrived (FR-NOTES-01, FR-GRAPH-02): what the snapshot has now that the last one did not,
 * for 1.6 seconds, as keys the liner notes look names and rows up in. The first snapshot is not "new" (a graph that is
 * opened is not a graph that is arriving), and with reduced motion nothing is flagged: the still version is no highlight
 * (the live chip already says "n new").
 *
 * What changed is found while rendering, by comparing the snapshot with the one this component last saw, as
 * `useExiting` does, so a credit is never on the page for a frame without its flag.
 */
export function useFreshCredits(snapshot: GraphSnapshot | undefined): ReadonlySet<string> {
  const reduced = useReducedMotion()
  const [state, setState] = useState<{ seen: GraphSnapshot | undefined; known: ReadonlySet<string> | null; fresh: ReadonlySet<string> }>({
    seen: undefined,
    known: null,
    fresh: new Set(),
  })

  let current = state
  if (snapshot !== state.seen && snapshot !== undefined) {
    const known = keysOf(snapshot)
    let fresh = state.fresh
    if (state.known !== null && !reduced) {
      const added = [...known].filter((key) => !state.known!.has(key))
      if (added.length > 0) fresh = new Set([...state.fresh, ...added])
    }
    current = { seen: snapshot, known, fresh }
    setState(current)
  }

  const flagged = current.fresh
  useEffect(() => {
    if (flagged.size === 0) return
    const timer = setTimeout(() => setState((now) => ({ ...now, fresh: new Set() })), freshMs)
    return () => clearTimeout(timer)
  }, [flagged])

  return flagged
}
