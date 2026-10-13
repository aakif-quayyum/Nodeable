import { useSearchParams } from 'react-router'

/**
 * The add-a-song sheet is part of the address (`?sheet=add`), like the search inside it: the back button closes it,
 * and a reload brings it back with its search.
 */
export function useAddSheet() {
  const [params, setParams] = useSearchParams()

  function withSheet(open: boolean) {
    const next = new URLSearchParams(params)
    if (open) next.set('sheet', 'add')
    else next.delete('sheet')
    return next
  }

  return {
    open: params.get('sheet') === 'add',
    openSheet: () => setParams(withSheet(true)),
    closeSheet: () => setParams(withSheet(false)),
  }
}
