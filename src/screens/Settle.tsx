import { ArrowRight, Check, Lock, Share2, Unlock } from 'lucide-react'
import { formatMoney } from '../core/money'
import type { Transfer } from '../core/types'
import { closeTrip, db, reopenTrip, uid } from '../db/db'
import type { TripView } from '../db/useTrip'
import { Avatar, Section, Stat } from '../ui/kit'

/**
 * Settle answers one question: **what should happen next?**
 *
 * Deliberately free of "you owe", leaderboards, and biggest-spender framing.
 *
 * The old empty state said "Nothing to move", which is true but leaves people
 * wondering whether the calculation ran at all. A settlement screen has to
 * show its working: where every rupee went and why that adds up to nobody
 * owing anything. Trust is the product here.
 */
export default function Settle({ t }: { t: TripView }) {
  const code = t.trip.baseCurrency
  const { transfers, potMinor, fundRemainingMinor, walletRemainingBaseMinor, frozen } = t.settlement

  const personalPaid = t.settlement.balances.reduce((s, b) => s + b.paidMinor, 0) - t.fund.inMinor
  const settledUp = transfers.length === 0

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
      {/* PRIMARY — what should happen next, stated as a headline */}
      <Section>
        <div
          className={`rounded-xl3 p-6 ${
            settledUp
              ? 'bg-gradient-to-br from-brand to-brand-dark text-white shadow-hero'
              : 'card'
          }`}
        >
          <p
            className={`text-[12px] font-semibold uppercase tracking-[0.09em] ${
              settledUp ? 'text-white/70' : 'text-ink-mute'
            }`}
          >
            {settledUp ? 'All settled' : 'Still to settle'}
          </p>
          <p className="tnum text-[32px] leading-none font-semibold tracking-[-0.02em] mt-2.5">
            {settledUp
              ? 'Nobody owes'
              : formatMoney(transfers.reduce((s, tr) => s + tr.amountMinor, 0), code)}
          </p>
          <p className={`text-[13px] mt-2.5 leading-relaxed ${settledUp ? 'text-white/80' : 'text-ink-mute'}`}>
            {settledUp
              ? 'Every rupee is accounted for. What each person put in matches what they used.'
              : `${transfers.length} transfer${transfers.length === 1 ? '' : 's'} will square everyone up.`}
          </p>
        </div>
      </Section>

      {/* The arithmetic, always visible — this is what makes it believable. */}
      <Section title="How that adds up">
        <div className="card px-5 py-3">
          <Stat label="Total spent" value={formatMoney(t.summary.totalSpentBaseMinor, code)} strong />
          {t.usesFund && <Stat label="Contributed to the fund" value={formatMoney(t.fund.inMinor, code)} />}
          <Stat label="Paid out of pocket" value={formatMoney(personalPaid, code)} />
          {t.usesFund && (
            <Stat label="Trip fund remaining" value={formatMoney(fundRemainingMinor, code)} tone="mute" />
          )}
          {walletRemainingBaseMinor !== 0 && (
            <Stat
              label="Unspent foreign cash"
              value={formatMoney(walletRemainingBaseMinor, code)}
              tone="mute"
            />
          )}
          <div className="border-t border-surface-line/70 mt-1 pt-1">
            <Stat label="Cash still held for the group" value={formatMoney(potMinor, code)} strong />
          </div>
        </div>
        <p className="text-[12.5px] text-ink-mute mt-3 px-1 leading-relaxed">
          {settledUp
            ? 'Each person\u2019s share of the spending equals what they put in, so there is nothing left to move between people.'
            : 'Anyone who put in more than they used gets paid back \u2014 first from cash still held, then directly by anyone who used more than they put in.'}
        </p>
      </Section>

      {transfers.length > 0 && (
        <Section
          title="Recommended transfers"
          action={
            <button onClick={copy} className="text-[13px] font-semibold text-brand-deep flex items-center gap-1">
              <Share2 size={14} /> Copy
            </button>
          }
        >
          <ul className="space-y-2.5">
            {transfers.map((tr, i) => {
              const toBalance = t.settlement.balances.find((b) => b.memberId === tr.toMemberId)
              const fromBalance = t.settlement.balances.find((b) => b.memberId === tr.fromMemberId)
              const reason =
                tr.kind === 'fund_return'
                  ? `Put in ${formatMoney(toBalance?.paidMinor ?? 0, code)}, used ${formatMoney(toBalance?.shareMinor ?? 0, code)} — the fund owes them the rest`
                  : tr.kind === 'fund_payout'
                    ? `Spent ${formatMoney(fromBalance ? fromBalance.shareMinor - fromBalance.paidMinor : 0, code)} more than they put in, paid from the fund`
                    : `${t.memberName(tr.fromMemberId)} used ${formatMoney(fromBalance ? fromBalance.shareMinor - fromBalance.paidMinor : 0, code)} more than they put in`
              return (
                <li key={`${i}-${tr.fromMemberId}-${tr.toMemberId}-${tr.amountMinor}`}>
                  <button
                    onClick={() => markDone(tr)}
                    disabled={frozen}
                    className="card w-full text-left p-5 row-press flex items-center gap-3.5 disabled:active:scale-100"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-[15px] font-semibold">
                        <span className="truncate">{t.memberName(tr.fromMemberId)}</span>
                        <ArrowRight size={14} className="text-ink-mute shrink-0" />
                        <span className="truncate">{t.memberName(tr.toMemberId)}</span>
                      </div>
                      <p className="text-[12px] text-ink-mute mt-1">{reason}</p>
                    </div>
                    <span className="tnum font-semibold text-[17px] shrink-0">
                      {formatMoney(tr.amountMinor, code)}
                    </span>
                    <span className="w-7 h-7 rounded-full border border-surface-line flex items-center justify-center shrink-0 text-ink-mute">
                      <Check size={14} />
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
          {!frozen && (
            <p className="text-[12px] text-ink-mute mt-3 px-1">
              Tap a transfer once the money has actually moved.
            </p>
          )}
        </Section>
      )}

      <Section title="Where each person stands">
        <ul className="card divide-y divide-surface-line/70 overflow-hidden">
          {t.settlement.balances
            .slice()
            .sort((a, b) => t.memberName(a.memberId).localeCompare(t.memberName(b.memberId)))
            .map((b) => (
              <li key={b.memberId} className="flex items-center gap-3.5 px-5 py-4">
                <Avatar name={t.memberName(b.memberId)} size={36} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-[14.5px] truncate">{t.memberName(b.memberId)}</p>
                  <p className="text-[12px] text-ink-mute tnum mt-0.5">
                    put in {formatMoney(b.paidMinor, code)} · used {formatMoney(b.shareMinor, code)}
                  </p>
                </div>
                <span
                  className={`tnum font-semibold text-[14.5px] shrink-0 ${
                    b.balanceMinor < 0
                      ? 'text-signal-neg'
                      : b.balanceMinor > 0
                        ? 'text-signal-pos'
                        : 'text-ink-mute'
                  }`}
                >
                  {b.balanceMinor === 0 ? '—' : formatMoney(b.balanceMinor, code, { sign: true })}
                </span>
              </li>
            ))}
        </ul>
        {/* Alphabetical on purpose: no ranking, no leaderboard. */}
      </Section>

      {/* Closing the trip is the last action, so it sits last. */}
      <Section title="Closing the trip">
        <div className="card p-5 flex items-center gap-4">
          <span className="w-10 h-10 rounded-2xl bg-surface-sunk flex items-center justify-center shrink-0 text-ink-soft">
            {frozen ? <Lock size={17} /> : <Unlock size={17} />}
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-[14.5px]">
              {frozen ? 'Trip is closed' : 'Trip is open'}
            </p>
            <p className="text-[12px] text-ink-mute mt-0.5 leading-relaxed">
              {frozen
                ? 'These numbers are frozen and won\u2019t change, even if the app updates later.'
                : 'Close the trip once everyone has settled up, to lock these numbers in for good.'}
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
    </>
  )
}
