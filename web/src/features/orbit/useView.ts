import { useCallback } from 'react'
import { useSearchParams } from 'react-router'

export type GraphViewKind = 'orbit' | 'constellation'

/**
 * Which view the stage shows: the orbit or the constellation (FR-VIEW-02). It is the address (`?view=constellation`,
 * and no parameter for the orbit), as the centre is, so a view can be reloaded and shared.
 */
export function useView(): [GraphViewKind, (view: GraphViewKind) => void] {
  const [params, setParams] = useSearchParams()
  const view: GraphViewKind = params.get('view') === 'constellation' ? 'constellation' : 'orbit'

  const setView = useCallback(
    (next: GraphViewKind) => {
      setParams((current) => {
        const copy = new URLSearchParams(current)
        if (next === 'constellation') copy.set('view', 'constellation')
        else copy.delete('view')
        return copy
      })
    },
    [setParams],
  )

  return [view, setView]
}
