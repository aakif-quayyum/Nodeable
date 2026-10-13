import { useSyncExternalStore } from 'react'

const query = '(prefers-reduced-motion: reduce)'

/** True when the person has asked their system for less motion (NFR-MOTION-01). Safe to call where there is no window. */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches
}

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => undefined

  const list = window.matchMedia(query)
  list.addEventListener('change', onChange)
  return () => list.removeEventListener('change', onChange)
}

/**
 * Whether animations should be replaced by their end state. Unlike reading the media query once at load, this follows
 * the setting while the page is open: a person who switches "reduce motion" on gets the still version at once.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, prefersReducedMotion, () => false)
}
