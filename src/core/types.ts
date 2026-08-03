/**
 * Domain model.
 *
 * MONEY RULE: every monetary value in this app is an INTEGER in minor units
 * (paise, cents, halalas). Floats never touch money. Conversion to display
 * happens only at the edge, in `money.ts`.
 */

export type ID = string

export type MoneySource = 'fund' | 'personal' | 'wallet'
export type SplitMode = 'equal' | 'exact' | 'shares'

export interface Trip {
  id: ID
  name: string
  destination: string
  /** ISO 4217 code the trip settles in, e.g. "INR". */
  baseCurrency: string
  startDate: string // yyyy-mm-dd
  endDate?: string
  createdAt: number
  closedAt?: number
  /**
   * The engine version active when this trip was created. Recorded so a
   * future engine change has an honest answer to "what rules made this
   * settlement" rather than an implicit assumption.
   */
  engineVersion: number
  /**
   * Set once, when the trip is closed. A frozen copy of the settlement as
   * computed at that moment. Closed trips read THIS, never a live
   * recomputation — so a rounding or wallet-logic change in a later engine
   * version cannot silently rewrite a settlement that already happened.
   * Reopening a trip clears this; re-closing recomputes and re-freezes it,
   * which is the explicit migration path the frozen-by-default rule requires.
   */
  closedSettlement?: FrozenSettlement
  /** Free-text notes that survive the trip. */
  notes?: string
}

export interface FrozenSettlement extends Settlement {
  engineVersion: number
  frozenAt: number
}

export interface Member {
  id: ID
  tripId: ID
  name: string
  /** The device owner. Exactly one member per trip is the operator. */
  isOperator?: boolean
  createdAt: number
}

/** Money paid INTO the shared trip fund by a member. */
export interface Contribution {
  id: ID
  tripId: ID
  memberId: ID
  amountMinor: number // base currency
  at: number
  note?: string
  deletedAt?: number
}

/** A purchase of foreign currency. Creates/refills the shared trip wallet. */
export interface CurrencyPurchase {
  id: ID
  tripId: ID
  code: string // foreign ISO code, e.g. "SAR"
  foreignMinor: number // how much foreign currency was received
  baseMinor: number // how much base currency it cost
  source: Extract<MoneySource, 'fund' | 'personal'>
  /** Required when source === 'personal'. Credited back at settlement. */
  payerId?: ID
  at: number
  deletedAt?: number
}

export interface Expense {
  id: ID
  tripId: ID
  title: string
  category: string
  /** Base code, or a foreign code held in the trip wallet. */
  currency: string
  amountMinor: number // in `currency`, always stored positive
  source: MoneySource
  /** Required when source === 'personal'. */
  payerId?: ID
  splitMode: SplitMode
  /** Member ids sharing this expense. Empty => nobody is charged (rare). */
  participants: ID[]
  /**
   * splitMode 'exact': minor units per member, must sum to amountMinor.
   * splitMode 'shares': arbitrary positive weights per member.
   */
  weights?: Record<ID, number>
  at: number
  note?: string
  deletedAt?: number
  /**
   * A refund against a real payment (hotel gave money back, an item was
   * returned). Stored as its own signed event rather than deleting or
   * negating the original expense, so both remain visible on the timeline
   * and category totals stay honest.
   */
  isRefund?: boolean
  /** Optional link to the expense this refund corresponds to. */
  refundOf?: ID
}

/**
 * Money handed to a member outside the final settlement — e.g. the operator
 * reimburses someone in cash mid-trip rather than waiting until the end.
 * Distinct from a Transfer (which is only ever a recommendation): a
 * Reimbursement is a fact that already happened and adjusts balances.
 */
export interface Reimbursement {
  id: ID
  tripId: ID
  fromMemberId: ID | 'FUND'
  toMemberId: ID
  amountMinor: number // base currency
  at: number
  note?: string
  deletedAt?: number
}

/**
 * A persisted record that a recommended transfer was actually carried out.
 * Recommended transfers themselves are never stored (they're derived), but
 * "this one happened" is a real fact and needs to survive a refresh, a
 * second device, or appearing on the Financial Timeline.
 */
export interface SettlementRecord {
  id: ID
  tripId: ID
  /** Identifies which recommended transfer this confirms. */
  fromMemberId: ID | 'FUND'
  toMemberId: ID
  amountMinor: number
  at: number
  deletedAt?: number
}

/** Append-only log so that every destructive action is reversible. */
export interface LogEntry {
  id: ID
  tripId: ID
  at: number
  action: string
  entity: string
  entityId: ID
  /** Snapshot sufficient to restore the row. */
  before?: unknown
}

export interface WalletState {
  code: string
  purchasedForeignMinor: number
  purchasedBaseMinor: number
  spentForeignMinor: number
  remainingForeignMinor: number
  /** Base value consumed, at the blended purchase rate. */
  spentBaseMinor: number
  remainingBaseMinor: number
  /** baseMinor per 1 foreign minor unit. Float — display/derivation only. */
  blendedRate: number
}

export interface MemberBalance {
  memberId: ID
  /** Contributions + personal expense payments + personal forex purchases. */
  paidMinor: number
  /** Their share of consumption. */
  shareMinor: number
  /** paid - share. Positive => owed money back. */
  balanceMinor: number
}

export type TransferKind = 'fund_return' | 'fund_payout' | 'peer'

export interface Transfer {
  kind: TransferKind
  /** 'FUND' means the pooled cash the operator still holds. */
  fromMemberId: ID | 'FUND'
  toMemberId: ID
  amountMinor: number
}

export interface Settlement {
  balances: MemberBalance[]
  /** Cash still physically held on behalf of the group (fund + unspent forex). */
  potMinor: number
  fundRemainingMinor: number
  walletRemainingBaseMinor: number
  transfers: Transfer[]
  /** Non-fatal problems the UI should surface rather than silently absorb. */
  warnings: string[]
}
