import { formatMoney } from './money'
import type { TripData } from './engine'
import { computeWallets, expenseBaseValue } from './engine'
import type { ID } from './types'

/**
 * The generalized replacement for the earlier "Financial Timeline".
 *
 * The timeline must not know about tables. Each source registers a pure
 * projector — `(data) => ActivityEvent[]` — and the feed is just those
 * projectors merged and sorted. Adding a future module (Documents,
 * Checklist, Trip Closed/Archived) means writing one projector and pushing
 * it onto `PROJECTORS` below. Nothing else in this file, or in the UI that
 * renders the feed, needs to change.
 *
 * Note on why this isn't `Entity.toActivityEvent()`: entities here are plain
 * data interfaces stored directly in IndexedDB (see core/types.ts), not
 * classes. That's what keeps this module I/O-free and testable without a
 * database. A projector function gets the same decoupling — the feed still
 * doesn't know how an Expense is shaped internally — without turning data
 * records into objects with behavior.
 */

export type ActivityKind =
  | 'trip_created'
  | 'contribution'
  | 'purchase'
  | 'expense'
  | 'refund'
  | 'reimbursement'
  | 'settlement'
  | 'trip_closed'

/**
 * Reserved for when their modules exist: 'document', 'checklist',
 * 'trip_archived'. Not added to the union yet — an unemitted kind with no
 * projector is dead code and silently breaks the exhaustive `ICONS` map in
 * Activity.tsx. Add each alongside its module's projector, not before.
 */

/** Where tapping this event should take you. Detail screens per kind are
 * future work — today every kind routes to the tab that already manages it. */
export type ActivityRoute = 'expenses' | 'money' | 'settle'

export interface ActivityEvent {
  kind: ActivityKind
  id: ID
  at: number
  /** Signed, in trip base currency, from the pot's point of view. */
  amountMinor: number
  title: string
  detail: string
  route: ActivityRoute
  /** For refunds: the id/title of the expense being refunded, so the UI can
   * visually connect the two instead of showing an unexplained credit. */
  linkedId?: ID
  linkedTitle?: string
  /** True when this event came from a non-default choice (custom split, a
   * note, an adjusted payer) rather than the equal-split default. */
  adjusted?: boolean
}

type Projector = (data: TripData, code: string, name: (id: ID | 'FUND') => string) => ActivityEvent[]

const live = <T extends { deletedAt?: number }>(rows: T[]) => rows.filter((r) => !r.deletedAt)

const projectContributions: Projector = (data, code, name) =>
  live(data.contributions).map((c) => ({
    kind: 'contribution', id: c.id, at: c.at, amountMinor: c.amountMinor, route: 'money',
    title: 'Contribution',
    detail: `${name(c.memberId)} added ${formatMoney(c.amountMinor, code)} to the fund`,
  }))

const projectPurchases: Projector = (data, code, name) =>
  live(data.purchases).map((p) => ({
    kind: 'purchase', id: p.id, at: p.at, amountMinor: -p.baseMinor, route: 'money',
    title: `Bought ${formatMoney(p.foreignMinor, p.code)}`,
    detail: `${p.source === 'fund' ? 'From the trip fund' : `${name(p.payerId ?? '')} paid personally`} · ${formatMoney(p.baseMinor, code)}`,
  }))

const projectExpenses: Projector = (data, code) => {
  const wallets = computeWallets(data)
  const byId = new Map(data.expenses.map((x) => [x.id, x]))
  return live(data.expenses).map((e) => {
    const value = expenseBaseValue(e, data.trip, wallets)
    const original = e.isRefund && e.refundOf ? byId.get(e.refundOf) : undefined
    return {
      kind: e.isRefund ? 'refund' : 'expense', id: e.id, at: e.at, amountMinor: -value, route: 'expenses',
      title: e.title,
      detail: original
        ? `Refund for ${original.title} · ${formatMoney(Math.abs(value), code)}`
        : `${e.category} · ${formatMoney(Math.abs(value), code)}${e.isRefund ? ' refunded' : ''}${e.advanced ? ' · adjusted' : ''}`,
      linkedId: original?.id,
      linkedTitle: original?.title,
      adjusted: e.advanced,
    }
  })
}

const projectReimbursements: Projector = (data, code, name) =>
  live(data.reimbursements).map((r) => ({
    kind: 'reimbursement', id: r.id, at: r.at, amountMinor: -r.amountMinor, route: 'settle',
    title: 'Reimbursement',
    detail: `${name(r.fromMemberId)} → ${name(r.toMemberId)} · ${formatMoney(r.amountMinor, code)}`,
  }))

const projectSettlements: Projector = (data, code, name) =>
  live(data.settlementRecords).map((s) => ({
    kind: 'settlement', id: s.id, at: s.at, amountMinor: -s.amountMinor, route: 'settle',
    title: 'Settled up',
    detail: `${name(s.fromMemberId)} → ${name(s.toMemberId)} · ${formatMoney(s.amountMinor, code)}`,
  }))

const projectTripLifecycle: Projector = (data) => {
  const events: ActivityEvent[] = [
    {
      kind: 'trip_created', id: `${data.trip.id}-created`, at: data.trip.createdAt, amountMinor: 0, route: 'money',
      title: 'Trip created', detail: data.trip.destination || data.trip.name,
    },
  ]
  if (data.trip.closedAt) {
    events.push({
      kind: 'trip_closed', id: `${data.trip.id}-closed`, at: data.trip.closedAt, amountMinor: 0, route: 'settle',
      title: 'Settled and closed', detail: 'The settlement is frozen from this point',
    })
  }
  return events
}

/**
 * Register a future module's projector here — e.g.:
 *   PROJECTORS.push((data) => data.documents.map(docToActivityEvent))
 * The feed renderer never needs to change.
 */
export const PROJECTORS: Projector[] = [
  projectTripLifecycle,
  projectContributions,
  projectPurchases,
  projectExpenses,
  projectReimbursements,
  projectSettlements,
]

export function buildActivity(data: TripData): ActivityEvent[] {
  const code = data.trip.baseCurrency
  const name = (id: ID | 'FUND') =>
    id === 'FUND' ? 'the trip fund' : data.members.find((m) => m.id === id)?.name ?? 'someone'

  return PROJECTORS.flatMap((p) => p(data, code, name)).sort((a, b) => b.at - a.at)
}
