import { describe, expect, it } from 'vitest'
import { computeFund, computeWallets, settle } from './engine'
import { validateMemberName } from './names'
import type { CurrencyPurchase, Expense, Trip } from './types'

/**
 * Verification scenarios — not unit tests.
 *
 * engine.test.ts checks individual rules in isolation ("does a refund reduce
 * consumption"). This file checks whole, named trip narratives end to end,
 * the way a reviewer manually re-derives numbers by hand to see if they
 * match the engine. Each scenario is a permanent regression: if the engine
 * changes and one of these numbers moves, that's a real behavior change to
 * review deliberately, not an accident to discover from a user's bug report.
 *
 * Add a new scenario here whenever a real trip surfaces a case worth
 * pinning down — that's more valuable than adding more synthetic unit tests.
 */

const M = (id: string, name: string) => ({ id, tripId: 't1', name, createdAt: 0 })

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

describe('scenario: Mahabaleshwar — fund covers one member\'s big personal spend', () => {
  const trip: Trip = {
    id: 't1', name: 'Mahabaleshwar', destination: 'Mahabaleshwar', baseCurrency: 'INR',
    startDate: '2026-01-10', endDate: '2026-01-14', createdAt: 0, engineVersion: 1,
  }
  const members = [M('ayaz', 'Ayaz'), M('adnan', 'Adnan'), M('wajid', 'Wajid'), M('arbaaz', 'Arbaaz'), M('faiz', 'Faiz')]
  // Five friends each put ₹3,000 into a shared fund (₹15,000 total).
  const contributions = members.map((m) => ({ id: `c-${m.id}`, tripId: 't1', memberId: m.id, amountMinor: 300_00, at: 0 }))
  // Ayaz pays the ₹11,000 hotel bill out of his own pocket, split evenly across all five.
  const expenses = [
    exp({ id: 'hotel', title: 'Hotel', amountMinor: 1_100_00, source: 'personal', payerId: 'ayaz', participants: members.map((m) => m.id) }),
  ]
  const data = { trip, members, contributions, purchases: [], expenses, reimbursements: [], settlementRecords: [] }

  it('everyone\'s share of the hotel bill is ₹2,200', () => {
    const shares = settle(data).balances.map((b) => b.shareMinor)
    expect(shares.every((s) => s === 220_00)).toBe(true)
  })

  it('Ayaz is owed ₹11,800 back: his ₹3,000 contribution plus ₹8,800 net-paid-in for the hotel', () => {
    const ayaz = settle(data).balances.find((b) => b.memberId === 'ayaz')!
    expect(ayaz.paidMinor).toBe(1_400_00) // ₹3,000 contribution + ₹11,000 personal payment
    expect(ayaz.balanceMinor).toBe(1_180_00)
  })

  it('the four other friends are each owed ₹800 back — their unused share of the fund', () => {
    const others = settle(data).balances.filter((b) => b.memberId !== 'ayaz')
    expect(others.every((b) => b.balanceMinor === 80_00)).toBe(true)
  })

  it('the fund (₹15,000, none of it spent directly) has exactly enough cash to cover every payout', () => {
    const s = settle(data)
    expect(s.fundRemainingMinor).toBe(1_500_00)
    const totalOwed = s.balances.filter((b) => b.balanceMinor > 0).reduce((sum, b) => sum + b.balanceMinor, 0)
    expect(totalOwed).toBe(1_500_00)
    // So every transfer comes straight from the fund — no one has to pay a friend directly.
    expect(s.transfers.every((tr) => tr.fromMemberId === 'FUND')).toBe(true)
  })
})

describe('scenario: foreign-currency wallet survives a partial refund', () => {
  const trip: Trip = {
    id: 't1', name: 'Umrah', destination: 'Makkah', baseCurrency: 'INR',
    startDate: '2026-02-01', endDate: '2026-02-10', createdAt: 0, engineVersion: 1,
  }
  const members = [M('a', 'Adnan')]
  // The fund buys 1,000 SAR for ₹23,500.
  const purchases: CurrencyPurchase[] = [{ id: 'p', tripId: 't1', code: 'SAR', foreignMinor: 1_000_00, baseMinor: 23_500_00, source: 'fund', at: 0 }]
  const expenses = [
    // 300 SAR spent from the wallet...
    exp({ id: 'e', currency: 'SAR', amountMinor: 300_00, source: 'wallet', participants: ['a'] }),
    // ...150 SAR of it refunded.
    exp({ id: 'r', currency: 'SAR', amountMinor: 150_00, source: 'wallet', participants: ['a'], isRefund: true, refundOf: 'e' }),
  ]
  const data = { trip, members, contributions: [], purchases, expenses, reimbursements: [], settlementRecords: [] }

  it('exactly 850 SAR remains in the wallet', () => {
    const [wallet] = computeWallets(data)
    expect(wallet.remainingForeignMinor).toBe(850_00)
  })

  it('the refund is linked back to the original expense, not a floating credit', () => {
    expect(expenses[1].refundOf).toBe('e')
  })

  it('the fund itself is untouched by the refund — it only ever paid for the SAR purchase', () => {
    const wallets = computeWallets(data)
    const fund = computeFund(data, wallets)
    expect(fund.spentOnForexMinor).toBe(23_500_00)
  })
})

describe('scenario: an amount typed into a name field cannot become a person', () => {
  it('rejects bare numbers and currency-looking strings', () => {
    for (const bad of ['5000', ' 5000 ', '₹5,000', '1,666.67', '15', '+500', '-500']) {
      expect(validateMemberName(bad)).toBeTruthy()
    }
  })

  it('still accepts real names that happen to contain digits', () => {
    for (const ok of ['Ayaz', 'Adnan', 'R2', 'Ayaz 2', "O'Brien", 'Wajid Jr']) {
      expect(validateMemberName(ok)).toBeNull()
    }
  })

  it('rejects an empty name and a duplicate of someone already on the trip', () => {
    expect(validateMemberName('   ')).toBeTruthy()
    expect(validateMemberName('adnan', ['Adnan', 'Ayaz'])).toBeTruthy()
    expect(validateMemberName('Wajid', ['Adnan', 'Ayaz'])).toBeNull()
  })
})
