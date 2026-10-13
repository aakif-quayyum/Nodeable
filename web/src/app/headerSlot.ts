import { createContext, use } from 'react'

/**
 * The place in the app bar where a page can put its own controls (the workspace's "Find in your graph" and its
 * Orbit / Constellation toggle, FR-GRAPH-05, FR-VIEW-02). The shell owns the element; a page renders into it with a
 * portal, so its controls sit in the bar but read the page's own state. `null` until the element is mounted.
 */
// LEARN: LG-03R portal-header | A React portal renders a component's output into a DOM node somewhere else in the page while the component stays where it is in the React tree: the find box and the view toggle sit in the app bar's markup but belong to the page that has the data, so they need no store and no props through the shell
export const HeaderSlot = createContext<HTMLElement | null>(null)

export function useHeaderSlot(): HTMLElement | null {
  return use(HeaderSlot)
}
