import { useLiveQuery } from 'dexie-react-hooks'
import { db, loadTripData } from './db'
import { computeFund, computeWallets, getSettlement, summarise } from '../core/engine'
import { buildActivity } from '../core/activity'
import { activeModules } from '../core/modules'
import type { ID } from '../core/types'

export function useTrips() {
  return useLiveQuery(async () => {
    const trips = await db.trips.toArray()
    return trips.sort((a, b) => b.createdAt - a.createdAt)
  }, [])
}

/** Everything a trip screen needs, recomputed whenever any row changes. */
export function useTrip(tripId: ID | undefined) {
  return useLiveQuery(async () => {
    if (!tripId) return undefined
    const data = await loadTripData(tripId)
    if (!data) return null
    const wallets = computeWallets(data)
    const modules = activeModules(data)
    return {
      ...data,
      wallets,
      fund: computeFund(data, wallets),
      settlement: getSettlement(data),
      summary: summarise(data),
      activity: buildActivity(data),
      memberName: (id: string) =>
        id === 'FUND' ? 'Trip Fund' : (data.members.find((m) => m.id === id)?.name ?? 'Unknown'),
      modules,
      /** Kept for existing screens; both now read from the same registry
       * that Documents/Checklist will register into later. */
      usesFund: modules.has('fund'),
      usesForex: modules.has('wallet'),
    }
  }, [tripId])
}

export type TripView = NonNullable<Awaited<ReturnType<typeof useTrip>>>
