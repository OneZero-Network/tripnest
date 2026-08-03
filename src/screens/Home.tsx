import { ArrowRight, Bell, Check, Plus, Scale, Wallet } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { formatMoney } from '../core/money'
import type { TripView } from '../db/useTrip'
import { Avatar, Section } from '../ui/kit'

/**
 * Home answers exactly one question: **are we okay?**
 *
 * The brief listed seven things Home should show. Giving all seven equal
 * weight would recreate the overloaded Money screen this redesign exists to
 * fix. So: one number dominates (total spent), the fund sits inside that same
 * hero as its context, and the rest are compressed into a glance-able strip
 * or a tap away. Hierarchy is primary → secondary → supporting → actions.
 */
export default function Home({ t, onAdd }: { t: TripView; onAdd: () => void }) {
  const nav = useNavigate()
  const { id } = useParams()
  const code = t.trip.baseCurrency

  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const todays = t.activity.filter(
    (e) => e.at >= startOfToday.getTime() && (e.kind === 'expense' || e.kind === 'refund'),
  )
  const todaysTotal = todays.reduce((s, e) => s + Math.abs(e.amountMinor), 0)

  const owed = t.settlement.transfers.length
  const settledUp = owed === 0

  const dayIndex = Math.max(
    1,
    Math.round((Date.now() - new Date(t.trip.startDate).getTime()) / 86_400_000) + 1,
  )
  const totalDays = t.trip.endDate
    ? Math.max(
        1,
        Math.round(
          (new Date(t.trip.endDate).getTime() - new Date(t.trip.startDate).getTime()) / 86_400_000,
        ) + 1,
      )
    : undefined

  return (
    <>
      {/* Identity first, in one short line — who, where, which day. Kept
          light on purpose: it's context, not the headline. The headline
          below is the money, because that's the reason this app exists. */}
      <Section>
        <p className="text-[13px] text-ink-mute px-1 flex items-center gap-1.5 flex-wrap">
          {t.trip.destination && <span className="font-medium text-ink-soft">{t.trip.destination}</span>}
          {totalDays && (
            <>
              <span>·</span>
              <span>Day {Math.min(dayIndex, totalDays)} of {totalDays}</span>
            </>
          )}
          <span>·</span>
          <span>{t.members.length} {t.members.length === 1 ? 'traveller' : 'travellers'}</span>
        </p>
      </Section>

      {/* PRIMARY — the one number that answers "are we okay?" */}
      <Section>
        <div className="rounded-xl3 bg-gradient-to-br from-brand to-brand-dark text-white p-6 shadow-hero">
          <p className="text-[12px] font-semibold uppercase tracking-[0.09em] text-white/70">
            Total spent
          </p>
          <p className="tnum text-[44px] leading-none font-semibold tracking-[-0.035em] mt-2.5">
            {formatMoney(t.summary.totalSpentBaseMinor, code)}
          </p>

          {t.usesFund && (
            <button
              onClick={() => nav(`/trip/${id}/money`)}
              className="mt-5 w-full bg-white/15 backdrop-blur rounded-2xl p-4 text-left active:scale-[0.98] transition"
            >
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-[12px] text-white/75 font-medium">Trip fund left</p>
                  <p className="text-[10.5px] text-white/55 -mt-0.5">Shared cash, not personal spend</p>
                  <p className="tnum text-[26px] font-semibold tracking-[-0.02em] mt-0.5">
                    {formatMoney(t.fund.remainingMinor, code)}
                  </p>
                </div>
                <p className="tnum text-[12.5px] text-white/70 pb-1.5">
                  of {formatMoney(t.fund.inMinor, code)}
                </p>
              </div>
              <div className="h-1.5 bg-white/25 rounded-full mt-3 overflow-hidden">
                <div
                  className="h-full bg-white rounded-full transition-all"
                  style={{
                    width: `${t.fund.inMinor > 0 ? Math.min(100, Math.max(0, (t.fund.remainingMinor / t.fund.inMinor) * 100)) : 0}%`,
                  }}
                />
              </div>
            </button>
          )}
        </div>
      </Section>

      {/* ACTIONS — moved right after the headline number. Feedback: this
          required scrolling all the way down to reach, on a screen whose
          whole point is fast recording. The three actions here are the ones
          someone taps mid-trip, not end-of-trip, so they belong near the top. */}
      <Section title="Quick actions">
        <div className="grid grid-cols-3 gap-2.5">
          <button
            onClick={onAdd}
            className="bg-brand-deep text-white rounded-2xl py-4 flex flex-col items-center gap-1.5 active:scale-[0.97] transition"
          >
            <Plus size={19} />
            <span className="text-[12.5px] font-semibold">Add expense</span>
          </button>
          <button
            onClick={() => nav(`/trip/${id}/money`)}
            className="card py-4 flex flex-col items-center gap-1.5 row-press text-ink-soft"
          >
            <Wallet size={19} />
            <span className="text-[12.5px] font-semibold">Add money</span>
          </button>
          <button
            onClick={() => nav(`/trip/${id}/settle`)}
            className="card py-4 flex flex-col items-center gap-1.5 row-press text-ink-soft"
          >
            <Scale size={19} />
            <span className="text-[12.5px] font-semibold">Settle up</span>
          </button>
        </div>
      </Section>

      {/* SECONDARY — what happened today */}
      <Section
        title="Today's spending"
        action={
          <button
            onClick={() => nav(`/trip/${id}/activity`)}
            className="text-[13px] font-semibold text-brand-deep flex items-center gap-1"
          >
            View all <ArrowRight size={13} />
          </button>
        }
      >
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-surface-line/70">
            <p className="tnum text-[24px] font-semibold tracking-[-0.02em]">
              {formatMoney(todaysTotal, code)}
            </p>
            <p className="text-[12.5px] text-ink-mute mt-0.5">
              {todays.length === 0
                ? 'Nothing recorded yet today'
                : `${todays.length} ${todays.length === 1 ? 'entry' : 'entries'} today`}
            </p>
          </div>
          {todays.slice(0, 3).map((e) => (
            <div key={e.id} className="flex items-center gap-3 px-5 py-3.5 border-b border-surface-line/50 last:border-0">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-[14.5px] truncate">{e.title}</p>
                <p className="text-[12px] text-ink-mute mt-0.5 truncate">{e.detail}</p>
              </div>
              <span className="tnum font-semibold text-[14.5px] shrink-0">
                {formatMoney(Math.abs(e.amountMinor), code)}
              </span>
            </div>
          ))}
        </div>
      </Section>

      {/* SUPPORTING — settlement status, stated plainly either way */}
      <Section>
        <button
          onClick={() => nav(`/trip/${id}/settle`)}
          className="card w-full text-left p-5 row-press flex items-center gap-4"
        >
          <span
            className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
              settledUp ? 'bg-brand-wash text-brand-deep' : 'bg-accent-wash text-accent'
            }`}
          >
            {settledUp ? <Check size={18} /> : <Scale size={18} />}
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-[15px]">
              {settledUp ? 'Everyone is settled up' : `${owed} transfer${owed === 1 ? '' : 's'} to settle`}
            </p>
            <p className="text-[12.5px] text-ink-mute mt-0.5">
              {settledUp ? 'Nobody owes anybody right now' : 'Tap to see who should pay whom'}
            </p>
          </div>
          <ArrowRight size={17} className="text-ink-mute shrink-0" />
        </button>
      </Section>

      {/* SUPPORTING — who's here */}
      <Section
        title={`Travelling together (${t.members.length})`}
        action={
          <button
            onClick={() => nav(`/trip/${id}/people`)}
            className="text-[13px] font-semibold text-brand-deep flex items-center gap-1"
          >
            Manage <ArrowRight size={13} />
          </button>
        }
      >
        <button
          onClick={() => nav(`/trip/${id}/people`)}
          className="card w-full p-5 flex items-center gap-2.5 row-press overflow-x-auto"
        >
          {t.members.map((m) => (
            <span key={m.id} className="flex flex-col items-center gap-1.5 shrink-0 w-16">
              <Avatar name={m.name} size={40} />
              <span className="text-[11.5px] text-ink-soft truncate max-w-full">{m.name}</span>
            </span>
          ))}
        </button>
      </Section>
    </>
  )
}

export function HomeBell() {
  return <Bell size={19} />
}
