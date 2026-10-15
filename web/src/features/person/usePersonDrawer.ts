import { useCallback } from 'react'
import { useSearchParams } from 'react-router'

const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Which person's drawer is open (FR-PERSON-01): the address (`?person=<mbid>`), as the view and the centre are, so a
 * drawer can be reloaded and shared and the browser's back button closes it. A value that is not an MBID is ignored
 * rather than sent to the Api.
 */
export function usePersonDrawer(): { personMbid: string | null; open: (mbid: string) => void; close: () => void } {
  const [params, setParams] = useSearchParams()
  const value = params.get('person')
  const personMbid = value !== null && guid.test(value) ? value : null

  const open = useCallback(
    (mbid: string) => {
      setParams((current) => {
        const copy = new URLSearchParams(current)
        copy.set('person', mbid)
        return copy
      })
    },
    [setParams],
  )

  const close = useCallback(() => {
    setParams((current) => {
      const copy = new URLSearchParams(current)
      copy.delete('person')
      return copy
    })
  }, [setParams])

  return { personMbid, open, close }
}
