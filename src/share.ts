import { formatMoney } from './core/money'
import type { TripView } from './db/useTrip'

/**
 * The offline-honest alternative to a "live dashboard".
 *
 * A live web dashboard requires a backend, a trip identity, and sync — the
 * three things the one-operator model exists to avoid. A snapshot pasted into
 * the group chat delivers ~90% of the value at 0% of the infrastructure.
 * Replace this with a real dashboard only once you've decided to own a server.
 */
export function buildShareText(t: TripView): string {
  const code = t.trip.baseCurrency
  const L: string[] = []
  const money = (v: number, c = code) => formatMoney(v, c)

  L.push(`${t.trip.name}${t.trip.destination ? ` · ${t.trip.destination}` : ''}`)
  L.push(`${t.trip.startDate}${t.trip.endDate ? ` – ${t.trip.endDate}` : ''}`)
  L.push('')
  L.push(`Spent so far: ${money(t.summary.totalSpentBaseMinor)}`)
  L.push(`Per day: ${money(t.summary.perDayBaseMinor)} over ${t.summary.days} days`)

  if (t.usesFund) {
    L.push('')
    L.push(`Trip fund: ${money(t.fund.remainingMinor)} left of ${money(t.fund.inMinor)}`)
  }

  for (const w of t.wallets) {
    L.push('')
    L.push(
      `${w.code} wallet: ${money(w.remainingForeignMinor, w.code)} left ` +
        `(worth ${money(w.remainingBaseMinor)})`,
    )
    L.push(`  bought ${money(w.purchasedForeignMinor, w.code)} for ${money(w.purchasedBaseMinor)}`)
  }

  if (t.summary.byCategory.length) {
    L.push('')
    L.push('Where it went')
    for (const c of t.summary.byCategory.slice(0, 6)) {
      L.push(`  ${c.category}: ${money(c.amountMinor)}`)
    }
  }

  if (t.settlement.transfers.length) {
    L.push('')
    L.push('Suggested transfers')
    for (const tr of t.settlement.transfers) {
      L.push(`  ${t.memberName(tr.fromMemberId)} → ${t.memberName(tr.toMemberId)}: ${money(tr.amountMinor)}`)
    }
  }

  L.push('')
  L.push('Sent from TripNest')
  return L.join('\n')
}
