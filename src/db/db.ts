import Dexie, { type Table } from 'dexie'
import type {
  Contribution,
  CurrencyPurchase,
  Expense,
  ID,
  LogEntry,
  Member,
  Reimbursement,
  SettlementRecord,
  Trip,
} from '../core/types'
import type { TripData } from '../core/engine'
import { ENGINE_VERSION, getSettlement } from '../core/engine'

/**
 * Local-first storage. IndexedDB via Dexie. No network, no login.
 *
 * Every destructive action writes a LogEntry with a `before` snapshot, which
 * is what makes "every important action is reversible" true rather than
 * aspirational.
 */
class TripNestDB extends Dexie {
  trips!: Table<Trip, ID>
  members!: Table<Member, ID>
  contributions!: Table<Contribution, ID>
  purchases!: Table<CurrencyPurchase, ID>
  expenses!: Table<Expense, ID>
  reimbursements!: Table<Reimbursement, ID>
  settlementRecords!: Table<SettlementRecord, ID>
  log!: Table<LogEntry, ID>

  constructor() {
    super('tripnest')
    this.version(1).stores({
      trips: 'id, createdAt, closedAt',
      members: 'id, tripId',
      contributions: 'id, tripId, memberId, at',
      purchases: 'id, tripId, code, at',
      expenses: 'id, tripId, at, category, currency',
      log: 'id, tripId, at',
    })
    // Additive only: existing tables and rows are untouched. Powers the
    // Financial Timeline (reimbursements + confirmed settlements).
    this.version(2).stores({
      reimbursements: 'id, tripId, at',
      settlementRecords: 'id, tripId, at',
    })
  }
}

export const db = new TripNestDB()

export const uid = (): ID =>
  (globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`)

export async function loadTripData(tripId: ID): Promise<TripData | null> {
  const trip = await db.trips.get(tripId)
  if (!trip) return null
  const [members, contributions, purchases, expenses, reimbursements, settlementRecords] = await Promise.all([
    db.members.where('tripId').equals(tripId).toArray(),
    db.contributions.where('tripId').equals(tripId).toArray(),
    db.purchases.where('tripId').equals(tripId).toArray(),
    db.expenses.where('tripId').equals(tripId).toArray(),
    db.reimbursements.where('tripId').equals(tripId).toArray(),
    db.settlementRecords.where('tripId').equals(tripId).toArray(),
  ])
  members.sort((a, b) => a.createdAt - b.createdAt)
  expenses.sort((a, b) => b.at - a.at)
  return { trip, members, contributions, purchases, expenses, reimbursements, settlementRecords }
}

type SoftDeletable = 'expenses' | 'contributions' | 'purchases' | 'reimbursements' | 'settlementRecords'

/**
 * Freezes the trip's settlement at today's engine version. From this point,
 * `getSettlement()` returns this exact snapshot forever, regardless of any
 * later engine change — that's the whole reproducibility guarantee.
 */
export async function closeTrip(tripId: ID) {
  const data = await loadTripData(tripId)
  if (!data) return
  const { engineVersion: _v, frozen: _f, ...settlement } = getSettlement(data)
  await db.trips.update(tripId, {
    closedAt: Date.now(),
    closedSettlement: { ...settlement, engineVersion: ENGINE_VERSION, frozenAt: Date.now() },
  })
}

/**
 * The explicit migration path: clears the frozen snapshot so the trip goes
 * back to live computation. Re-closing re-freezes under whatever engine
 * version is running then. Never automatic — a person has to choose this.
 */
export async function reopenTrip(tripId: ID) {
  await db.trips.update(tripId, { closedAt: undefined, closedSettlement: undefined })
}

/** Soft-delete a row and record enough to bring it back. */
export async function softDelete(table: SoftDeletable, id: ID) {
  const row = await (db[table] as Table<any, ID>).get(id)
  if (!row || row.deletedAt) return
  const now = Date.now()
  await db.transaction('rw', db[table] as Table<any, ID>, db.log, async () => {
    await (db[table] as Table<any, ID>).update(id, { deletedAt: now })
    await db.log.add({
      id: uid(),
      tripId: row.tripId,
      at: now,
      action: 'delete',
      entity: table,
      entityId: id,
      before: row,
    })
  })
}

export async function undoDelete(table: SoftDeletable, id: ID) {
  await (db[table] as Table<any, ID>).update(id, { deletedAt: undefined })
}

/* ── Export / import: the antidote to "no cloud means no recovery". ── */

export async function exportTrip(tripId: ID) {
  const data = await loadTripData(tripId)
  if (!data) throw new Error('Trip not found')
  return {
    format: 'tripnest.v1',
    exportedAt: new Date().toISOString(),
    ...data,
  }
}

export async function exportEverything() {
  const trips = await db.trips.toArray()
  const bundles = await Promise.all(trips.map((t) => exportTrip(t.id)))
  return { format: 'tripnest.backup.v1', exportedAt: new Date().toISOString(), trips: bundles }
}

export async function importBundle(raw: unknown) {
  const anyRaw = raw as any
  const bundles: any[] =
    anyRaw?.format === 'tripnest.backup.v1' ? anyRaw.trips : [anyRaw]

  for (const b of bundles) {
    if (!b?.trip?.id) throw new Error('This file is not a TripNest export.')
    await db.transaction(
      'rw',
      [db.trips, db.members, db.contributions, db.purchases, db.expenses,
        db.reimbursements, db.settlementRecords],
      async () => {
        await db.trips.put(b.trip)
        await db.members.bulkPut(b.members ?? [])
        await db.contributions.bulkPut(b.contributions ?? [])
        await db.purchases.bulkPut(b.purchases ?? [])
        await db.expenses.bulkPut(b.expenses ?? [])
        await db.reimbursements.bulkPut(b.reimbursements ?? [])
        await db.settlementRecords.bulkPut(b.settlementRecords ?? [])
      },
    )
  }
  return bundles.length
}

export function downloadJSON(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
