import { describe, expect, it } from 'vitest'
import { settle, computeWallets, computeFund, summarise, type TripData } from './engine'
import { splitByWeights, splitEvenly, toMinor, formatMoney } from './money'
import type { Expense, Trip } from './types'

const trip: Trip = {
  id: 't1',
  name: 'Riyadh',
  destination: 'Riyadh',
  baseCurrency: 'INR',
  startDate: '2026-01-10',
  endDate: '2026-01-14',
  createdAt: 0,
  engineVersion: 1,
}

const M = (id: string, name: string) => ({ id, tripId: 't1', name, createdAt: 0 })

function blank(): TripData {
  return {
    trip, members: [], contributions: [], purchases: [], expenses: [],
    reimbursements: [], settlementRecords: [],
  }
}

const exp = (o: Partial<Expense> & Pick<Expense, 'id' | 'amountMinor' | 'source'>): Expense => ({
  tripId: 't1',
  title: o.title ?? 'x',
  category: o.category ?? 'Other',
  currency: o.currency ?? 'INR',
  splitMode: o.splitMode ?? 'equal',
  participants: o.participants ?? [],
  at: 0,
  ...o,
})

describe('money primitives', () => {
  it('parses decimal strings without float drift', () => {
    expect(toMinor('1,234.56', 'INR')).toBe(123456)
    expect(toMinor('0.1', 'INR')).toBe(10)
    expect(toMinor('999', 'JPY')).toBe(999)
    expect(toMinor('1.005', 'INR')).toBe(101) // rounds half up
  })

  it('splits without losing a single paisa', () => {
    const s = splitEvenly(1000, ['a', 'b', 'c'])
    expect(Object.values(s).reduce((x, y) => x + y, 0)).toBe(1000)
    const w = splitByWeights(1000, { a: 1, b: 1, c: 1 })
    expect(Object.values(w).reduce((x, y) => x + y, 0)).toBe(1000)
    const odd = splitByWeights(10001, { a: 3, b: 5, c: 7, d: 11 })
    expect(Object.values(odd).reduce((x, y) => x + y, 0)).toBe(10001)
  })

  it('formats with the right symbol and precision', () => {
    expect(formatMoney(123456, 'INR')).toContain('₹')
    expect(formatMoney(-500, 'INR')).toMatch(/^−/)
  })
})

describe('the vision-doc SAR scenario', () => {
  // Trip fund buys 1,000 SAR for ₹23,500. Later Adnan personally buys
  // 500 SAR for ₹12,000. Both land in ONE shared wallet.
  const d = blank()
  d.members = [M('ayaz', 'Ayaz'), M('adnan', 'Adnan'), M('sara', 'Sara')]
  d.contributions = [
    { id: 'c1', tripId: 't1', memberId: 'ayaz', amountMinor: toMinor('20000', 'INR'), at: 0 },
    { id: 'c2', tripId: 't1', memberId: 'sara', amountMinor: toMinor('20000', 'INR'), at: 0 },
  ]
  d.purchases = [
    {
      id: 'p1', tripId: 't1', code: 'SAR',
      foreignMinor: toMinor('1000', 'SAR'), baseMinor: toMinor('23500', 'INR'),
      source: 'fund', at: 0,
    },
    {
      id: 'p2', tripId: 't1', code: 'SAR',
      foreignMinor: toMinor('500', 'SAR'), baseMinor: toMinor('12000', 'INR'),
      source: 'personal', payerId: 'adnan', at: 0,
    },
  ]
  d.expenses = [
    exp({ id: 'e1', title: 'Hotel', category: 'Stay', currency: 'SAR', amountMinor: toMinor('900', 'SAR'), source: 'wallet', participants: ['ayaz', 'adnan', 'sara'] }),
    exp({ id: 'e2', title: 'Airport cab', currency: 'INR', amountMinor: toMinor('3000', 'INR'), source: 'personal', payerId: 'ayaz', participants: ['ayaz', 'adnan', 'sara'] }),
  ]

  it('merges both purchases into a single blended wallet', () => {
    const [w] = computeWallets(d)
    expect(w.code).toBe('SAR')
    expect(w.purchasedForeignMinor).toBe(toMinor('1500', 'SAR'))
    expect(w.purchasedBaseMinor).toBe(toMinor('35500', 'INR'))
    expect(w.remainingForeignMinor).toBe(toMinor('600', 'SAR'))
    // blended rate = 35500/1500 = ₹23.666.../SAR
    expect(w.spentBaseMinor + w.remainingBaseMinor).toBe(w.purchasedBaseMinor)
  })

  it('keeps the accounting identity exact', () => {
    const s = settle(d)
    const sum = s.balances.reduce((x, b) => x + b.balanceMinor, 0)
    expect(sum).toBe(s.potMinor)
    expect(s.warnings).toEqual([])
  })

  it('credits the member who bought currency personally', () => {
    const s = settle(d)
    const adnan = s.balances.find((b) => b.memberId === 'adnan')!
    // Adnan paid ₹12,000 into the pot via forex and contributed nothing else.
    expect(adnan.paidMinor).toBe(toMinor('12000', 'INR'))
    // He is owed his forex back minus his share of consumption.
    expect(adnan.balanceMinor).toBeGreaterThan(0)
  })

  it('every transfer is positive and they net out exactly', () => {
    const s = settle(d)
    for (const t of s.transfers) expect(t.amountMinor).toBeGreaterThan(0)
    const received: Record<string, number> = {}
    for (const t of s.transfers) {
      received[t.toMemberId] = (received[t.toMemberId] ?? 0) + t.amountMinor
      if (t.fromMemberId !== 'FUND') {
        received[t.fromMemberId] = (received[t.fromMemberId] ?? 0) - t.amountMinor
      }
    }
    for (const b of s.balances) {
      expect(received[b.memberId] ?? 0).toBe(Math.max(0, b.balanceMinor) - Math.max(0, -b.balanceMinor))
    }
  })
})

describe('settlement shapes', () => {
  it('returns the unspent fund to contributors when nobody is short', () => {
    const d = blank()
    d.members = [M('a', 'A'), M('b', 'B')]
    d.contributions = [
      { id: 'c1', tripId: 't1', memberId: 'a', amountMinor: 500000, at: 0 },
      { id: 'c2', tripId: 't1', memberId: 'b', amountMinor: 500000, at: 0 },
    ]
    d.expenses = [exp({ id: 'e', amountMinor: 400000, source: 'fund', participants: ['a', 'b'] })]
    const s = settle(d)
    expect(s.fundRemainingMinor).toBe(600000)
    expect(s.transfers.every((t) => t.fromMemberId === 'FUND' && t.kind === 'fund_return')).toBe(true)
    expect(s.transfers.reduce((x, t) => x + t.amountMinor, 0)).toBe(600000)
  })

  it('produces peer transfers when someone under-paid', () => {
    const d = blank()
    d.members = [M('a', 'A'), M('b', 'B')]
    d.expenses = [exp({ id: 'e', amountMinor: 100000, source: 'personal', payerId: 'a', participants: ['a', 'b'] })]
    const s = settle(d)
    expect(s.transfers).toEqual([
      { kind: 'peer', fromMemberId: 'b', toMemberId: 'a', amountMinor: 50000 },
    ])
  })

  it('ignores soft-deleted rows so undo is a no-op restore', () => {
    const d = blank()
    d.members = [M('a', 'A'), M('b', 'B')]
    d.expenses = [
      exp({ id: 'e', amountMinor: 100000, source: 'personal', payerId: 'a', participants: ['a', 'b'], deletedAt: 1 }),
    ]
    expect(settle(d).transfers).toEqual([])
  })

  it('handles an odd amount split three ways with zero drift', () => {
    const d = blank()
    d.members = [M('a', 'A'), M('b', 'B'), M('c', 'C')]
    d.expenses = [exp({ id: 'e', amountMinor: 100, source: 'personal', payerId: 'a', participants: ['a', 'b', 'c'] })]
    const s = settle(d)
    const total = s.balances.reduce((x, b) => x + b.shareMinor, 0)
    expect(total).toBe(100)
    expect(s.balances.reduce((x, b) => x + b.balanceMinor, 0)).toBe(0)
  })

  it('warns instead of silently swallowing an overdrawn wallet', () => {
    const d = blank()
    d.members = [M('a', 'A')]
    d.purchases = [{ id: 'p', tripId: 't1', code: 'SAR', foreignMinor: 10000, baseMinor: 235000, source: 'fund', at: 0 }]
    d.expenses = [exp({ id: 'e', currency: 'SAR', amountMinor: 20000, source: 'wallet', participants: ['a'] })]
    expect(settle(d).warnings.join(' ')).toMatch(/more sar was spent/i)
  })
})

describe('refunds', () => {
  it('reduces consumption without deleting the original expense', () => {
    const d = blank()
    d.members = [M('a', 'A'), M('b', 'B')]
    d.expenses = [
      exp({ id: 'e', amountMinor: 100000, source: 'personal', payerId: 'a', participants: ['a', 'b'] }),
      exp({ id: 'r', amountMinor: 20000, source: 'personal', payerId: 'a', participants: ['a', 'b'], isRefund: true, refundOf: 'e' }),
    ]
    const s = settle(d)
    // net consumption is 80000, split 40000/40000; a paid 100000 - refund isn't
    // a "payment" by a, so a's paid stays 100000 but shared drops.
    const b = s.balances.find((x) => x.memberId === 'b')!
    expect(b.shareMinor).toBe(40000)
    expect(s.warnings).toEqual([])
  })

  it('returns spent foreign currency to the wallet on refund', () => {
    const d = blank()
    d.members = [M('a', 'A')]
    d.purchases = [{ id: 'p', tripId: 't1', code: 'SAR', foreignMinor: 100000, baseMinor: 2350000, source: 'fund', at: 0 }]
    d.expenses = [
      exp({ id: 'e', currency: 'SAR', amountMinor: 30000, source: 'wallet', participants: ['a'] }),
      exp({ id: 'r', currency: 'SAR', amountMinor: 10000, source: 'wallet', participants: ['a'], isRefund: true }),
    ]
    const [w] = computeWallets(d)
    expect(w.remainingForeignMinor).toBe(100000 - 30000 + 10000)
  })
})

describe('reimbursements', () => {
  it('an early reimbursement reduces what is still owed at final settlement', () => {
    const d = blank()
    d.members = [M('a', 'A'), M('b', 'B')]
    d.expenses = [exp({ id: 'e', amountMinor: 100000, source: 'personal', payerId: 'a', participants: ['a', 'b'] })]
    // Without any reimbursement, b owes a 50000.
    const before = settle(d).transfers
    expect(before).toEqual([{ kind: 'peer', fromMemberId: 'b', toMemberId: 'a', amountMinor: 50000 }])

    // a already reimbursed... no wait, b pays a directly mid-trip.
    d.reimbursements = [{ id: 'r', tripId: 't1', fromMemberId: 'b', toMemberId: 'a', amountMinor: 30000, at: 0 }]
    const after = settle(d).transfers
    expect(after).toEqual([{ kind: 'peer', fromMemberId: 'b', toMemberId: 'a', amountMinor: 20000 }])
  })

  it('a reimbursement paid from FUND reduces the fund balance', () => {
    const d = blank()
    d.members = [M('a', 'A')]
    d.contributions = [{ id: 'c', tripId: 't1', memberId: 'a', amountMinor: 100000, at: 0 }]
    d.reimbursements = [{ id: 'r', tripId: 't1', fromMemberId: 'FUND', toMemberId: 'a', amountMinor: 20000, at: 0 }]
    const s = settle(d)
    expect(s.fundRemainingMinor).toBe(80000)
  })
})

describe('settlement records', () => {
  it('a confirmed transfer stops being recommended once fully paid', () => {
    const d = blank()
    d.members = [M('a', 'A'), M('b', 'B')]
    d.expenses = [exp({ id: 'e', amountMinor: 100000, source: 'personal', payerId: 'a', participants: ['a', 'b'] })]
    d.settlementRecords = [{ id: 's', tripId: 't1', fromMemberId: 'b', toMemberId: 'a', amountMinor: 50000, at: 0 }]
    expect(settle(d).transfers).toEqual([])
  })

  it('a partial settlement record leaves the remainder recommended', () => {
    const d = blank()
    d.members = [M('a', 'A'), M('b', 'B')]
    d.expenses = [exp({ id: 'e', amountMinor: 100000, source: 'personal', payerId: 'a', participants: ['a', 'b'] })]
    d.settlementRecords = [{ id: 's', tripId: 't1', fromMemberId: 'b', toMemberId: 'a', amountMinor: 20000, at: 0 }]
    expect(settle(d).transfers).toEqual([
      { kind: 'peer', fromMemberId: 'b', toMemberId: 'a', amountMinor: 30000 },
    ])
  })
})

describe('activity feed', () => {
  it('merges every projector chronologically, newest first', async () => {
    const { buildActivity } = await import('./activity')
    const d = blank()
    d.members = [M('a', 'A'), M('b', 'B')]
    d.contributions = [{ id: 'c', tripId: 't1', memberId: 'a', amountMinor: 100000, at: 1 }]
    d.purchases = [{ id: 'p', tripId: 't1', code: 'SAR', foreignMinor: 10000, baseMinor: 235000, source: 'fund', at: 2 }]
    d.expenses = [exp({ id: 'e', amountMinor: 30000, source: 'fund', participants: ['a'], at: 3 })]
    d.reimbursements = [{ id: 'r', tripId: 't1', fromMemberId: 'FUND', toMemberId: 'b', amountMinor: 5000, at: 4 }]
    d.settlementRecords = [{ id: 's', tripId: 't1', fromMemberId: 'b', toMemberId: 'a', amountMinor: 1000, at: 5 }]

    const feed = buildActivity(d)
    expect(feed.map((e) => e.kind)).toEqual(['settlement', 'reimbursement', 'expense', 'purchase', 'contribution', 'trip_created'])
    expect(feed.every((e) => e.detail.length > 0 && e.route)).toBe(true)
  })

  it('adding a new projector requires no change to existing ones', async () => {
    const { PROJECTORS, buildActivity } = await import('./activity')
    const before = PROJECTORS.length
    PROJECTORS.push(() => [
      { kind: 'expense', id: 'custom', at: 999, amountMinor: 0, title: 'Custom module event', detail: 'x', route: 'expenses' },
    ])
    const d = blank()
    const feed = buildActivity(d)
    expect(feed[0].title).toBe('Custom module event')
    PROJECTORS.length = before // restore for other tests in this file
  })
})

describe('engine versioning and freeze', () => {
  it('an open trip computes live and reports the running engine version', async () => {
    const { getSettlement, ENGINE_VERSION } = await import('./engine')
    const d = blank()
    d.members = [M('a', 'A'), M('b', 'B')]
    d.expenses = [exp({ id: 'e', amountMinor: 100000, source: 'personal', payerId: 'a', participants: ['a', 'b'] })]
    const s = getSettlement(d)
    expect(s.frozen).toBe(false)
    expect(s.engineVersion).toBe(ENGINE_VERSION)
    expect(s.transfers).toEqual([{ kind: 'peer', fromMemberId: 'b', toMemberId: 'a', amountMinor: 50000 }])
  })

  it('a closed trip returns its frozen snapshot verbatim, ignoring live data changes', async () => {
    const { getSettlement } = await import('./engine')
    const d = blank()
    d.members = [M('a', 'A'), M('b', 'B')]
    d.expenses = [exp({ id: 'e', amountMinor: 100000, source: 'personal', payerId: 'a', participants: ['a', 'b'] })]

    const frozen = getSettlement(d)
    d.trip = {
      ...d.trip,
      closedAt: 123,
      closedSettlement: { ...frozen, engineVersion: 1, frozenAt: 123 },
    }

    // Simulate a later engine version changing the math: add a new expense
    // that would change the live result if it were recomputed.
    d.expenses.push(exp({ id: 'e2', amountMinor: 999999, source: 'personal', payerId: 'b', participants: ['a', 'b'] }))

    const result = getSettlement(d)
    expect(result.frozen).toBe(true)
    expect(result.transfers).toEqual(frozen.transfers) // unchanged, despite new data
  })
})

describe('summaries', () => {
  it('ranks categories and computes a per-day rate', () => {
    const d = blank()
    d.members = [M('a', 'A')]
    d.expenses = [
      exp({ id: '1', category: 'Food', amountMinor: 30000, source: 'personal', payerId: 'a', participants: ['a'] }),
      exp({ id: '2', category: 'Stay', amountMinor: 70000, source: 'personal', payerId: 'a', participants: ['a'] }),
    ]
    const s = summarise(d)
    expect(s.totalSpentBaseMinor).toBe(100000)
    expect(s.byCategory[0].category).toBe('Stay')
    expect(s.days).toBe(5)
    expect(s.perDayBaseMinor).toBe(20000)
  })

  it('reports fund drawdown across expenses and forex', () => {
    const d = blank()
    d.members = [M('a', 'A')]
    d.contributions = [{ id: 'c', tripId: 't1', memberId: 'a', amountMinor: 1000000, at: 0 }]
    d.purchases = [{ id: 'p', tripId: 't1', code: 'AED', foreignMinor: 100000, baseMinor: 235000, source: 'fund', at: 0 }]
    d.expenses = [exp({ id: 'e', amountMinor: 100000, source: 'fund', participants: ['a'] })]
    const f = computeFund(d, computeWallets(d))
    expect(f.remainingMinor).toBe(1000000 - 235000 - 100000)
  })
})
