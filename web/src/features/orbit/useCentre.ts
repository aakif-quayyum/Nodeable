import { useCallback, useLayoutEffect } from 'react'
import { useSearchParams } from 'react-router'
import { create } from 'zustand'
import type { Workspace } from '../graph/workspaceModel.ts'
import { focusParam, parseFocus, rootRef, type NodeRef } from './orbitLayout.ts'

interface TrailState {
  /** The centres the person has been through after the whole graph (which is always the first crumb), the last of which is the centre. */
  trail: readonly NodeRef[]
  visit: (ref: NodeRef) => void
}

const sameRef = (a: NodeRef, b: NodeRef) => a.type === b.type && a.id === b.id

// UI state that the breadcrumbs, the orbit and the cards all read, with no server involved (spec section 12). Visiting a
// place already on the trail goes back to it, as the prototype's trail does: the trail is a path, not a history. The
// whole graph is not on the trail: it is the start of every path, so visiting it empties the trail.
export const useTrail = create<TrailState>((set) => ({
  trail: [],
  visit: (ref) =>
    set((state) => {
      if (ref.type === 'graph') return state.trail.length === 0 ? state : { trail: [] }
      const at = state.trail.findIndex((entry) => sameRef(entry, ref))
      if (state.trail.length > 0 && at === state.trail.length - 1) return state
      return { trail: at >= 0 ? state.trail.slice(0, at + 1) : [...state.trail, ref] }
    }),
}))

export interface Centre {
  /** What the orbit is centred on, or null while there is nothing in the graph. */
  centre: NodeRef | null
  /** The whole graph, then the centres visited that still exist, ending with the centre itself. */
  crumbs: NodeRef[]
  /** Makes a node the centre. It is an address change (`?focus=`), so the back button goes back through the centres. */
  goTo: (ref: NodeRef) => void
}

const exists = (workspace: Workspace, ref: NodeRef) =>
  ref.type === 'graph' ? true : ref.type === 'song' ? workspace.songById.has(ref.id) : workspace.personById.has(ref.id)

/**
 * The orbit's centre (FR-VIEW-01, FR-VIEW-04). The address is the source of truth (`?focus=song:<mbid>`), so a view can
 * be reloaded, bookmarked and stepped through with the back button. With no focus the centre is the whole graph. When
 * the address names something that is not in the graph (a song that was removed, a person who is hidden), the centre is
 * the last place on the trail that still exists, and failing that the whole graph.
 */
export function useCentre(workspace: Workspace | null): Centre {
  const [params, setParams] = useSearchParams()
  const trail = useTrail((state) => state.trail)
  const visit = useTrail((state) => state.visit)

  const focus = parseFocus(params.get('focus'))
  const alive = workspace === null ? [] : trail.filter((ref) => exists(workspace, ref))

  let centre: NodeRef | null = null
  if (workspace !== null) {
    if (focus === null && params.get('focus') === null) centre = rootRef
    else if (focus !== null && exists(workspace, focus)) centre = focus
    else centre = alive.at(-1) ?? rootRef
  }

  // The trail follows the centre, whichever way the centre changed (a click, the back button, a removal). The effect
  // depends on the centre's two fields, not on the object, which is a new one on every render.
  const type = centre?.type
  const id = centre?.id
  useLayoutEffect(() => {
    if (type !== undefined && id !== undefined) visit({ type, id })
  }, [type, id, visit])

  const goTo = useCallback(
    (ref: NodeRef) => {
      setParams((current) => {
        const next = new URLSearchParams(current)
        if (ref.type === 'graph') next.delete('focus')
        else next.set('focus', focusParam(ref))
        // Choosing a centre is a thing to see in the orbit, whichever view it was chosen from (FR-VIEW-02).
        next.delete('view')
        next.delete('sheet')
        return next
      })
    },
    [setParams],
  )

  const crumbs: NodeRef[] =
    centre === null ? [] : [rootRef, ...alive, ...(centre.type === 'graph' || alive.some((ref) => sameRef(ref, centre)) ? [] : [centre])]
  return { centre, crumbs, goTo }
}
