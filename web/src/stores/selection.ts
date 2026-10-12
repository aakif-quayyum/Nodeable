import { create } from 'zustand'

interface SelectionState {
  /** The node the person clicked: `song:<mbid>` or `person:<mbid>`. */
  selectedId: string | null
  select: (id: string | null) => void
}

// UI state that several components read, kept out of the server data: the canvas writes it, the panel and the list
// read it. Zustand is a store with no provider, reducers or action types: a hook returned by `create`.
export const useSelection = create<SelectionState>((set) => ({
  selectedId: null,
  select: (id) => set({ selectedId: id }),
}))
