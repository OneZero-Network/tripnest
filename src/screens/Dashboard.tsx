import { AlertTriangle, Share2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { TripView } from '../db/useTrip'
import { formatMoney, symbolFor } from '../core/money'
import { Section } from '../ui/kit'
import { buildShareText } from '../share'

export default function Dashboard({ t }: { t: TripView }) {
  const nav = useNavigate()
  const code = t.trip.baseCurrency
  const { summary, settlement, fund, wallets } = t

  async function share() {
    const text = buildShareText(t)
    if (navigator.share) {
      try {
        await navigator.share({ title: t.trip.name, text })
        return
      } catch {
        /* user dismissed */
      }
    }
    await navigator.clipboard?.writeText(text)
    alert('Trip summary copied. Paste it into your group chat.')
  }

  return (
    <>
      {settlement.warnings.length > 0 && (
        <Section>
          <div className="card p-4 border-signal-warn/30 bg-signal-warn/5">
            {settlement.warnings.map((w, i) => (
              <p key={i} className="text-[13px] text-signal-warn flex gap-2 leading-relaxed">
                <AlertTriangle size={15} className="shrink-0 mt-0.5" /> {w}
              </p>
            ))}
          </div>
        </Section>
      )}

      {/* The one number this screen exists to answer. */}
      <Section>
        <div className="card p-6">
          <p className="label">Spent so far</p>
          <p className="tnum text-[42px] leading-none font-semibold tracking-[-0.03em] mt-2">
            {formatMoney(summary.totalSpentBaseMinor, code)}
          </p>
          <p className="text-[13px] text-ink-mute mt-3 tnum">
            {formatMoney(summary.perDayBaseMinor, code)} a day · {summary.expenseCount} entries ·{' '}
            {summary.days} {summary.days === 1 ? 'day' : 'days'}
          </p>
          <button onClick={share} className="btn-quiet w-full mt-5 flex items-center justify-center gap-2">
            <Share2 size={16} /> Share the summary
          </button>
        </div>
      </Section>

      {t.usesFund && (
        <Section title="Trip fund">
          <button onClick={() => nav('money')} className="card w-full text-left p-5 row-press">
            <div className="flex justify-between items-baseline">
              <span className="text-[14px] text-ink-soft">Left in the fund</span>
              <span className={`tnum text-[22px] font-semibold ${fund.remainingMinor < 0 ? 'text-signal-neg' : ''}`}>
                {formatMoney(fund.remainingMinor, code)}
              </span>
            </div>
            <Bar
              used={fund.spentOnExpensesMinor + fund.spentOnForexMinor}
              total={fund.inMinor}
            />
            <p className="text-[12px] text-ink-mute mt-2.5 tnum">
              {formatMoney(fund.inMinor, code)} collected ·{' '}
              {formatMoney(fund.spentOnExpensesMinor + fund.spentOnForexMinor, code)} used
            </p>
          </button>
        </Section>
      )}

      {wallets.map((w) => (
        <Section key={w.code} title={`${w.code} wallet`}>
          <button onClick={() => nav('money')} className="card w-full text-left p-5 row-press">
            <div className="flex justify-between items-baseline">
              <span className="text-[14px] text-ink-soft">Cash remaining</span>
              <span className="tnum text-[22px] font-semibold">
                {formatMoney(w.remainingForeignMinor, w.code)}
              </span>
            </div>
            <Bar used={w.spentForeignMinor} total={w.purchasedForeignMinor} />
            <div className="mt-3 grid grid-cols-2 gap-y-1.5 text-[12px] text-ink-mute tnum">
              <span>Worth</span>
              <span className="text-right text-ink-soft font-medium">
                {formatMoney(w.remainingBaseMinor, code)}
              </span>
              <span>Bought</span>
              <span className="text-right">
                {formatMoney(w.purchasedForeignMinor, w.code)} for {formatMoney(w.purchasedBaseMinor, code)}
              </span>
              <span>Your rate</span>
              <span className="text-right">
                {symbolFor(code)}
                {w.blendedRate ? (w.blendedRate).toFixed(3) : '—'} per {symbolFor(w.code).trim()}1
              </span>
            </div>
          </button>
        </Section>
      ))}

      {summary.byCategory.length > 0 && (
        <Section title="Where it went">
          <div className="card p-5 space-y-3.5">
            {summary.byCategory.slice(0, 6).map((c) => {
              const pct = summary.totalSpentBaseMinor
                ? Math.round((c.amountMinor / summary.totalSpentBaseMinor) * 100)
                : 0
              return (
                <div key={c.category}>
                  <div className="flex justify-between text-[14px] mb-1.5">
                    <span className="text-ink-soft">{c.category}</span>
                    <span className="tnum font-medium">{formatMoney(c.amountMinor, code)}</span>
                  </div>
                  <div className="h-[3px] bg-surface-sunk rounded-full overflow-hidden">
                    <div className="h-full bg-ink/70 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </Section>
      )}
    </>
  )
}

function Bar({ used, total }: { used: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.max(0, (used / total) * 100)) : 0
  return (
    <div className="h-1.5 bg-surface-sunk rounded-full mt-4 overflow-hidden">
      <div
        className={`h-full rounded-full ${pct > 95 ? 'bg-signal-neg' : 'bg-ink/75'}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
