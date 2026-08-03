import { ArrowRight, Check, Lock, Share2, Unlock } from 'lucide-react'
import { formatMoney } from '../core/money'
import type { Transfer } from '../core/types'
import { closeTrip, db, reopenTrip, uid } from '../db/db'
import type { TripView } from '../db/useTrip'
import { Empty, Section } from '../ui/kit'

/**
 * Deliberately free of "you owe", leaderboards, and biggest-spender framing.
 * The screen states actions, not verdicts.
 *
 * Marking a transfer done writes a SettlementRecord — a real, persisted fact
 * — rather than a component-local checkbox. This is what makes the confirmed
 * transfer disappear from the recommended list on next load (netted out in
 * `settle()`) and what lets it show up on the Activity feed.
 *
 * Once a trip is closed, `t.settlement` is the FROZEN snapshot, not a live
 * recomputation — the reproducibility guarantee described in engine.ts. This
 * screen disables further mutation of a frozen settlement; "Reopen" is the
 * one explicit, human-initiated way back to live computation.
 */
export default function Settle({ t }: { t: TripView }) {
  const code = t.trip.baseCurrency
  const { transfers, potMinor, fundRemainingMinor, walletRemainingBaseMinor, frozen } = t.settlement

  const key = (tr: Transfer, i: number) => `${i}-${tr.fromMemberId}-${tr.toMemberId}-${tr.amountMinor}`

  async function markDone(tr: Transfer) {
    if (frozen) return
    await db.settlementRecords.add({
      id: uid(),
      tripId: t.trip.id,
      fromMemberId: tr.fromMemberId,
      toMemberId: tr.toMemberId,
      amountMinor: tr.amountMinor,
      at: Date.now(),
    })
  }

  function copy() {
    const text = transfers
      .map((tr) => `${t.memberName(tr.fromMemberId)} → ${t.memberName(tr.toMemberId)}: ${formatMoney(tr.amountMinor, code)}`)
      .join('\n')
    navigator.clipboard?.writeText(`${t.trip.name} — settling up\n\n${text}`)
    alert('Transfers copied.')
  }

  return (
    <>
      <Section>
        <div className="card p-5 flex items-center gap-4">
          <span className="w-10 h-10 rounded-full bg-surface-sunk flex items-center justify-center shrink-0 text-ink-soft">
            {frozen ? <Lock size={17} /> : <Unlock size={17} />}
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-[15px]">{frozen ? 'Settlement is closed' : 'Trip is still open'}</p>
            <p className="text-[12px] text-ink-mute mt-0.5">
              {frozen
                ? 'This settlement is frozen and won\u2019t change even if the app updates later.'
                : 'Close the trip once everyone has settled up, to lock this in.'}
            </p>
          </div>
          <button
            className="btn-quiet px-4 py-2.5 text-[13px] shrink-0"
            onClick={async () => (frozen ? reopenTrip(t.trip.id) : closeTrip(t.trip.id))}
          >
            {frozen ? 'Reopen' : 'Close trip'}
          </button>
        </div>
      </Section>

      {potMinor !== 0 && (
        <Section title="Cash still held">
          <div className="card p-5">
            <p className="tnum text-[28px] font-semibold tracking-[-0.02em]">
              {formatMoney(potMinor, code)}
            </p>
            <p className="text-[13px] text-ink-mute mt-2 leading-relaxed tnum">
              {formatMoney(fundRemainingMinor, code)} left in the fund
              {walletRemainingBaseMinor !== 0 &&
                ` · ${formatMoney(walletRemainingBaseMinor, code)} of unspent foreign cash`}
            </p>
          </div>
        </Section>
      )}

      <Section
        title="Recommended transfers"
        action={
          transfers.length > 0 ? (
            <button onClick={copy} className="text-[13px] font-semibold flex items-center gap-1">
              <Share2 size={14} /> Copy
            </button>
          ) : undefined
        }
      >
        {transfers.length === 0 ? (
          <Empty
            title="Nothing to move"
            hint="Everyone has put in exactly what they used. Add expenses and contributions and this will fill in."
          />
        ) : (
          <ul className="space-y-3">
            {transfers.map((tr, i) => (
              <li key={key(tr, i)}>
                <button
                  onClick={() => markDone(tr)}
                  disabled={frozen}
                  className="card w-full text-left p-5 row-press flex items-center gap-4 disabled:active:scale-100"
                >  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-[15px] font-medium">
                      <span className="truncate">{t.memberName(tr.fromMemberId)}</span>
                      <ArrowRight size={15} className="text-ink-mute shrink-0" />
                      <span className="truncate">{t.memberName(tr.toMemberId)}</span>
                    </div>
                    <p className="text-[12px] text-ink-mute mt-1">
                      {tr.kind === 'fund_return'
                        ? 'returning what they put in'
                        : tr.kind === 'fund_payout'
                          ? 'paid out of the trip fund'
                          : 'direct transfer'}
                    </p>
                  </div>
                  <span className="tnum font-semibold text-[17px] shrink-0">
                    {formatMoney(tr.amountMinor, code)}
                  </span>
                  <span
                    aria-label="Mark as paid"
                    className="w-6 h-6 rounded-full border border-surface-line flex items-center justify-center shrink-0 active:bg-ink active:border-ink active:text-white"
                  >
                    <Check size={14} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Where each person stands">
        <ul className="card divide-y divide-surface-line/70 overflow-hidden">
          {t.settlement.balances
            .slice()
            .sort((a, b) => t.memberName(a.memberId).localeCompare(t.memberName(b.memberId)))
            .map((b) => (
              <li key={b.memberId} className="flex items-center justify-between px-5 py-4">
                <div>
                  <p className="font-medium text-[15px]">{t.memberName(b.memberId)}</p>
                  <p className="text-[12px] text-ink-mute tnum mt-0.5">
                    put in {formatMoney(b.paidMinor, code)} · used {formatMoney(b.shareMinor, code)}
                  </p>
                </div>
                <span
                  className={`tnum font-semibold ${
                    b.balanceMinor < 0 ? 'text-signal-neg' : b.balanceMinor > 0 ? 'text-signal-pos' : 'text-ink-mute'
                  }`}
                >
                  {formatMoney(b.balanceMinor, code, { sign: true })}
                </span>
              </li>
            ))}
        </ul>
        {/* Names are sorted alphabetically on purpose: no ranking, no leaderboard. */}
      </Section>
    </>
  )
}
