/**
 * The financial engine.
 *
 * Everything here is a PURE function of the trip's rows. Nothing reads the DB,
 * nothing writes. That is deliberate: this is the part of TripNest that is
 * expensive to get wrong, so it is testable in isolation and has no I/O.
 *
 * ── The accounting identity this file guarantees ──────────────────────────
 *   Σ(paid) − Σ(share)  ==  fundRemaining + Σ(walletRemainingBase)  ==  pot
 * If that ever fails, there is a bug. `settle()` asserts it and warns.
 */

import { formatMoney, splitByWeights, splitEvenly } from './money'
import type {
  Contribution,
  CurrencyPurchase,
  Expense,
  ID,
  Member,
  MemberBalance,
  Reimbursement,
  Settlement,
  SettlementRecord,
  Transfer,
  Trip,
  WalletState,
} from './types'

export interface TripData {
  trip: Trip
  members: Member[]
  contributions: Contribution[]
  purchases: CurrencyPurchase[]
  expenses: Expense[]
  reimbursements: Reimbursement[]
  settlementRecords: SettlementRecord[]
}

const live = <T extends { deletedAt?: number }>(rows: T[]) => rows.filter((r) => !r.deletedAt)

/* ───────────────────────────── wallets ───────────────────────────── */

/**
 * One shared wallet per foreign currency, regardless of who topped it up.
 * The blended purchase rate is what every foreign expense is valued at —
 * not today's FX rate. This is the whole point of the product.
 */
export function computeWallets(data: TripData): WalletState[] {
  const purchases = live(data.purchases)
  const expenses = live(data.expenses)
  const codes = Array.from(new Set(purchases.map((p) => p.code.toUpperCase()))).sort()

  return codes.map((code) => {
    const mine = purchases.filter((p) => p.code.toUpperCase() === code)
    const purchasedForeignMinor = mine.reduce((s, p) => s + p.foreignMinor, 0)
    const purchasedBaseMinor = mine.reduce((s, p) => s + p.baseMinor, 0)
    const spentForeignMinor = expenses
      .filter((e) => e.currency.toUpperCase() === code)
      .reduce((s, e) => s + (e.isRefund ? -e.amountMinor : e.amountMinor), 0)

    const blendedRate = purchasedForeignMinor > 0 ? purchasedBaseMinor / purchasedForeignMinor : 0
    const remainingForeignMinor = purchasedForeignMinor - spentForeignMinor
    // Value the REMAINDER at the blended rate and derive spend by subtraction,
    // so that spent + remaining always reconciles exactly to what was paid.
    const remainingBaseMinor = Math.round(remainingForeignMinor * blendedRate)
    const spentBaseMinor = purchasedBaseMinor - remainingBaseMinor

    return {
      code,
      purchasedForeignMinor,
      purchasedBaseMinor,
      spentForeignMinor,
      remainingForeignMinor,
      spentBaseMinor,
      remainingBaseMinor,
      blendedRate,
    }
  })
}

/**
 * Value one expense in the trip's base currency. Refunds come back negative:
 * they reduce consumption rather than being deleted or double-counted, so
 * both the original charge and the money returning stay visible.
 */
export function expenseBaseValue(e: Expense, trip: Trip, wallets: WalletState[]): number {
  const sign = e.isRefund ? -1 : 1
  if (e.currency.toUpperCase() === trip.baseCurrency.toUpperCase()) return sign * e.amountMinor
  const w = wallets.find((x) => x.code === e.currency.toUpperCase())
  if (!w || w.purchasedForeignMinor === 0) return 0
  return sign * Math.round(e.amountMinor * w.blendedRate)
}

/** Per-member share of a single expense, in base currency, remainder-safe. */
export function allocateExpense(e: Expense, baseValue: number): Record<ID, number> {
  const participants = e.participants.filter(Boolean)
  if (participants.length === 0) return {}

  if (e.splitMode === 'exact' && e.weights) {
    // 'exact' weights are already base-currency minor units for base expenses.
    // For foreign expenses we rescale them proportionally into base value.
    const declared = participants.reduce((s, id) => s + (e.weights![id] ?? 0), 0)
    if (declared === baseValue) {
      const out: Record<ID, number> = {}
      for (const id of participants) out[id] = e.weights![id] ?? 0
      return out
    }
    const w: Record<ID, number> = {}
    for (const id of participants) w[id] = e.weights![id] ?? 0
    return splitByWeights(baseValue, w)
  }

  if (e.splitMode === 'shares' && e.weights) {
    const w: Record<ID, number> = {}
    for (const id of participants) w[id] = e.weights![id] ?? 0
    if (Object.values(w).every((v) => v <= 0)) return splitEvenly(baseValue, participants)
    return splitByWeights(baseValue, w)
  }

  return splitEvenly(baseValue, participants)
}

/* ───────────────────────────── the fund ───────────────────────────── */

export interface FundState {
  inMinor: number
  spentOnExpensesMinor: number
  spentOnForexMinor: number
  remainingMinor: number
}

export function computeFund(data: TripData, wallets: WalletState[]): FundState {
  const inMinor = live(data.contributions).reduce((s, c) => s + c.amountMinor, 0)
  const spentOnExpensesMinor = live(data.expenses)
    .filter((e) => e.source === 'fund')
    .reduce((s, e) => s + expenseBaseValue(e, data.trip, wallets), 0)
  const spentOnForexMinor = live(data.purchases)
    .filter((p) => p.source === 'fund')
    .reduce((s, p) => s + p.baseMinor, 0)
  const reimbursedFromFundMinor = live(data.reimbursements)
    .filter((r) => r.fromMemberId === 'FUND')
    .reduce((s, r) => s + r.amountMinor, 0)
  return {
    inMinor,
    spentOnExpensesMinor,
    spentOnForexMinor,
    remainingMinor: inMinor - spentOnExpensesMinor - spentOnForexMinor - reimbursedFromFundMinor,
  }
}

/* ───────────────────────────── balances ───────────────────────────── */

export function computeBalances(data: TripData, wallets: WalletState[]): MemberBalance[] {
  const paid: Record<ID, number> = {}
  const share: Record<ID, number> = {}
  for (const m of data.members) {
    paid[m.id] = 0
    share[m.id] = 0
  }
  const bump = (map: Record<ID, number>, id: ID | undefined, v: number) => {
    if (!id) return
    map[id] = (map[id] ?? 0) + v
  }

  for (const c of live(data.contributions)) bump(paid, c.memberId, c.amountMinor)

  // A personal forex top-up is money that member put into the group pot.
  for (const p of live(data.purchases)) {
    if (p.source === 'personal') bump(paid, p.payerId, p.baseMinor)
  }

  for (const e of live(data.expenses)) {
    const value = expenseBaseValue(e, data.trip, wallets)
    // 'fund' and 'wallet' expenses were already paid for upstream
    // (by contributions and by forex purchases respectively).
    if (e.source === 'personal') bump(paid, e.payerId, value)
    const alloc = allocateExpense(e, value)
    for (const [id, amt] of Object.entries(alloc)) bump(share, id, amt)
  }

  // A reimbursement already handed someone money outside the final
  // settlement — it's an early, partial settlement. The recipient is now
  // owed that much less, so their "paid" credit is reduced by what they
  // already received. If a peer (not FUND) supplied that cash, they're
  // credited the same amount, so the two sides net to zero and the
  // accounting identity holds. A FUND payout needs no offsetting credit:
  // computeFund() already shrinks the pot by the same amount.
  for (const r of live(data.reimbursements)) {
    bump(paid, r.toMemberId, -r.amountMinor)
    if (r.fromMemberId !== 'FUND') bump(paid, r.fromMemberId, r.amountMinor)
  }

  return data.members.map((m) => ({
    memberId: m.id,
    paidMinor: paid[m.id] ?? 0,
    shareMinor: share[m.id] ?? 0,
    balanceMinor: (paid[m.id] ?? 0) - (share[m.id] ?? 0),
  }))
}

/* ───────────────────────────── settlement ───────────────────────────── */

/**
 * Produce the minimum set of recommended transfers.
 *
 * Cash still held on behalf of the group (unspent fund + unspent forex) is a
 * payer in its own right, so the output reads as:
 *     Trip Fund → Ayaz
 *     Adnan → Ayaz
 * and never as "you owe".
 */
export function settle(data: TripData): Settlement {
  const wallets = computeWallets(data)
  const fund = computeFund(data, wallets)
  const balances = computeBalances(data, wallets)
  const warnings: string[] = []

  const walletRemainingBaseMinor = wallets.reduce((s, w) => s + w.remainingBaseMinor, 0)
  const potMinor = fund.remainingMinor + walletRemainingBaseMinor
  const sumBalances = balances.reduce((s, b) => s + b.balanceMinor, 0)

  if (sumBalances !== potMinor) {
    warnings.push(
      `Accounting drift of ${sumBalances - potMinor} minor units. Some expenses may be unassigned to participants.`,
    )
  }
  for (const w of wallets) {
    if (w.remainingForeignMinor < 0) {
      warnings.push(`More ${w.code} was spent than was ever bought. Add the missing purchase.`)
    }
  }
  if (fund.remainingMinor < 0) {
    warnings.push('The trip fund is overdrawn. Record the missing contribution.')
  }

  const contributed = new Set(live(data.contributions).map((c) => c.memberId))
  const creditors = balances
    .filter((b) => b.balanceMinor > 0)
    .map((b) => ({ id: b.memberId, amt: b.balanceMinor }))
    .sort((a, b) => b.amt - a.amt || a.id.localeCompare(b.id))
  const debtors = balances
    .filter((b) => b.balanceMinor < 0)
    .map((b) => ({ id: b.memberId, amt: -b.balanceMinor }))
    .sort((a, b) => b.amt - a.amt || a.id.localeCompare(b.id))

  const transfers: Transfer[] = []

  // 1. Hand back the pot the operator is physically holding.
  let pot = Math.max(0, potMinor)
  for (const c of creditors) {
    if (pot <= 0) break
    const amt = Math.min(pot, c.amt)
    if (amt <= 0) continue
    transfers.push({
      kind: contributed.has(c.id) ? 'fund_return' : 'fund_payout',
      fromMemberId: 'FUND',
      toMemberId: c.id,
      amountMinor: amt,
    })
    c.amt -= amt
    pot -= amt
  }

  // 2. Whatever creditors are still short is covered peer to peer.
  let di = 0
  for (const c of creditors) {
    while (c.amt > 0 && di < debtors.length) {
      const d = debtors[di]
      if (d.amt <= 0) {
        di++
        continue
      }
      const amt = Math.min(c.amt, d.amt)
      transfers.push({ kind: 'peer', fromMemberId: d.id, toMemberId: c.id, amountMinor: amt })
      c.amt -= amt
      d.amt -= amt
      if (d.amt === 0) di++
    }
  }

  // Recorded settlements already moved cash between these same parties.
  // Net them against the freshly recommended list so a confirmed transfer
  // doesn't keep reappearing after the operator marks it done.
  const doneKey = (fromId: ID | 'FUND', toId: ID) => `${fromId}::${toId}`
  const settledSoFar = new Map<string, number>()
  for (const r of live(data.settlementRecords)) {
    const k = doneKey(r.fromMemberId, r.toMemberId)
    settledSoFar.set(k, (settledSoFar.get(k) ?? 0) + r.amountMinor)
  }

  const netTransfers: Transfer[] = []
  for (const t of transfers) {
    const k = doneKey(t.fromMemberId, t.toMemberId)
    const already = settledSoFar.get(k) ?? 0
    const remaining = t.amountMinor - already
    settledSoFar.set(k, Math.max(0, already - t.amountMinor))
    if (remaining > 0) netTransfers.push({ ...t, amountMinor: remaining })
  }

  return {
    balances,
    potMinor,
    fundRemainingMinor: fund.remainingMinor,
    walletRemainingBaseMinor,
    transfers: netTransfers,
    warnings,
  }
}

/**
 * ENGINE FROZEN — see README "Engine freeze" before touching this file,
 * money.ts, or activity.ts. Bump this only for a deliberate, reviewed change
 * to rounding, wallet, or settlement logic — and read `getSettlement` first:
 * it exists specifically so a version bump can't silently change a closed
 * trip's historical settlement.
 */
export const ENGINE_VERSION = 1

/**
 * The reproducibility guarantee: a closed trip's settlement is whatever was
 * frozen into `trip.closedSettlement` at close time — never recomputed live.
 * An open trip is computed live under whichever engine version is currently
 * running, which is the only case where "current rules" is the right answer.
 */
export function getSettlement(data: TripData): Settlement & { engineVersion: number; frozen: boolean } {
  if (data.trip.closedSettlement) {
    const { engineVersion, frozenAt: _frozenAt, ...settlement } = data.trip.closedSettlement
    return { ...settlement, engineVersion, frozen: true }
  }
  return { ...settle(data), engineVersion: ENGINE_VERSION, frozen: false }
}

/* ───────────────────────────── summaries ───────────────────────────── */

export interface TripSummary {
  totalSpentBaseMinor: number
  byCategory: { category: string; amountMinor: number }[]
  perDayBaseMinor: number
  days: number
  expenseCount: number
}

export function summarise(data: TripData): TripSummary {
  const wallets = computeWallets(data)
  const expenses = live(data.expenses)
  const totalSpentBaseMinor = expenses.reduce((s, e) => s + expenseBaseValue(e, data.trip, wallets), 0)

  const cat: Record<string, number> = {}
  for (const e of expenses) {
    const k = e.category || 'Other'
    cat[k] = (cat[k] ?? 0) + expenseBaseValue(e, data.trip, wallets)
  }

  const start = Date.parse(data.trip.startDate)
  const end = data.trip.endDate ? Date.parse(data.trip.endDate) : Date.now()
  const days = Math.max(1, Math.round((end - start) / 86_400_000) + 1)

  return {
    totalSpentBaseMinor,
    byCategory: Object.entries(cat)
      .map(([category, amountMinor]) => ({ category, amountMinor }))
      .sort((a, b) => b.amountMinor - a.amountMinor),
    perDayBaseMinor: Math.round(totalSpentBaseMinor / days),
    days,
    expenseCount: expenses.length,
  }
}
