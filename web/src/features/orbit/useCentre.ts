import { useCallback, useLayoutEffect } from 'react'
import { useSearchParams } from 'react-router'
import { create } from 'zustand'
import { defaultSong, type Workspace } from '../graph/workspaceModel.ts'
import { focusParam, parseFocus, type NodeRef } from './orbitLayout.ts'

interface TrailState {
  /** The centres the person has been through, the last of which is the centre. */
  trail: readonly NodeRef[]
  visit: (ref: NodeRef) => void
}

const sameRef = (a: NodeRef, b: NodeRef) => a.type === b.type && a.id === b.id

// UI state that the breadcrumbs, the orbit and the cards all read, with no server involved (spec section 12). Visiting a
// place already on the trail goes back to it, as the prototype's trail does: the trail is a path, not a history.
export const useTrail = create<TrailState>((set) => ({
  trail: [],
  visit: (ref) =>
    set((state) => {
      const at = state.trail.findIndex((entry) => sameRef(entry, ref))
      if (state.trail.length > 0 && at === state.trail.length - 1) return state
      return { trail: at >= 0 ? state.trail.slice(0, at + 1) : [...state.trail, ref] }
    }),
}))

export interface Centre {
  /** What the orbit is centred on, or null while there is nothing in the graph. */
  centre: NodeRef | null
  /** The centres visited that still exist, ending with the centre itself. */
  crumbs: NodeRef[]
  /** Makes a node the centre. It is an address change (`?focus=`), so the back button goes back through the centres. */
  goTo: (ref: NodeRef) => void
}

const exists = (workspace: Workspace, ref: NodeRef) =>
  ref.type === 'song' ? workspace.songById.has(ref.id) : workspace.personById.has(ref.id)

function choose(workspace: Workspace | null, focus: NodeRef | null, alive: readonly NodeRef[]): NodeRef | null {
  if (workspace === null) return null
  if (focus !== null && exists(workspace, focus)) return focus
  const last = alive.at(-1)
  if (last !== undefined) return last
  const song = defaultSong(workspace)
  return song === null ? null : { type: 'song', id: song.mbid }
}

/**
 * The orbit's centre (FR-VIEW-01). The address is the source of truth (`?focus=song:<mbid>`), so a view can be reloaded,
 * bookmarked and stepped through with the back button. When the address names nothing that is in the graph (no focus, a
 * song that was removed, a person who is hidden), the centre is the last place on the trail that still exists, and
 * failing that the song that is loading or was added last.
 */
export function useCentre(workspace: Workspace | null): Centre {
  const [params, setParams] = useSearchParams()
  const trail = useTrail((state) => state.trail)
  const visit = useTrail((state) => state.visit)

  const focus = parseFocus(params.get('focus'))
  const alive = workspace === null ? [] : trail.filter((ref) => exists(workspace, ref))

  const centre = choose(workspace, focus, alive)

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
        next.set('focus', focusParam(ref))
        next.delete('sheet')
        return next
      })
    },
    [setParams],
  )

  const crumbs = centre === null ? [] : alive.some((ref) => sameRef(ref, centre)) ? alive : [...alive, centre]
  return { centre, crumbs, goTo }
}
