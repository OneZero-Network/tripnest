import type { TripData } from '../core/engine'

/**
 * The Adaptive Workspace pattern, generalized.
 *
 * A module is a section of the app that should stay invisible until the trip
 * actually needs it. Fund and Wallet were the first two, hardcoded as
 * `usesFund` / `usesForex` booleans. That doesn't scale: every future module
 * (Documents, Checklist, ...) would need its own bespoke boolean threaded
 * through useTrip, Dashboard, and Money by hand.
 *
 * Instead, a module is a `{ id, isActive(data) }` pair registered once here.
 * Activating on real data (not a settings toggle) is the whole point: the
 * interface grows with the trip, not with a menu the user has to configure.
 *
 * Cost is NOT uniform across modules — worth remembering before adding one.
 * Fund/Wallet are pure reveals of data already stored (free). A module like
 * Documents additionally needs file storage, permissions, and encryption-at-
 * rest for anything sensitive (a passport scan) — registering it here is the
 * easy 5% of that work, not a substitute for the rest.
 */
export interface ModuleDef {
  id: string
  label: string
  isActive: (data: TripData) => boolean
}

const live = <T extends { deletedAt?: number }>(rows: T[]) => rows.some((r) => !r.deletedAt)

export const MODULES: ModuleDef[] = [
  {
    id: 'fund',
    label: 'Trip fund',
    isActive: (d) => live(d.contributions),
  },
  {
    id: 'wallet',
    label: 'Foreign currency wallet',
    isActive: (d) => live(d.purchases),
  },
  {
    id: 'reimbursements',
    label: 'Reimbursements',
    isActive: (d) => live(d.reimbursements),
  },
  // Future modules register here, e.g.:
  // { id: 'documents', label: 'Documents', isActive: (d) => hasDocuments(d.trip.id) },
  // { id: 'checklist', label: 'Checklist', isActive: (d) => hasChecklistItems(d.trip.id) },
]

export function activeModules(data: TripData): Set<string> {
  return new Set(MODULES.filter((m) => m.isActive(data)).map((m) => m.id))
}
