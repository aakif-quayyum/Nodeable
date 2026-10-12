import { create } from 'zustand'
import { creditRoles, type CreditRoleKey } from '../app/creditRoles.ts'

interface RoleFilterState {
  /** The roles whose credits are shown. All of them, `other` included, are on until the person turns one off. */
  active: ReadonlySet<CreditRoleKey>
  toggle: (role: CreditRoleKey) => void
  /** Turns every role back on. */
  reset: () => void
}

const allRoles: ReadonlySet<CreditRoleKey> = new Set(creditRoles)

// The set is replaced, never changed in place: a component subscribed to `active` re-renders because it is a new
// object, the same rule as React state and as Redux reducers.
export const useRoleFilters = create<RoleFilterState>((set) => ({
  active: allRoles,
  toggle: (role) =>
    set((state) => {
      const next = new Set(state.active)
      if (next.has(role)) next.delete(role)
      else next.add(role)
      return { active: next }
    }),
  reset: () => set({ active: allRoles }),
}))
