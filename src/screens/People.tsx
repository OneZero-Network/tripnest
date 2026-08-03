import { Check, Plus, UserPlus, Users } from 'lucide-react'
import { useState } from 'react'
import { expenseBaseValue } from '../core/engine'
import { formatMoney } from '../core/money'
import { validateMemberName } from '../core/names'
import { db, uid } from '../db/db'
import type { TripView } from '../db/useTrip'
import { Avatar, Empty, Field, Section, Sheet, Stat } from '../ui/kit'
import { AddContribution } from './Money'

/**
 * People answers one question: **who is travelling, and where does each of
 * them stand?**
 *
 * Members used to be a section buried inside Money, which is why nobody could
 * find "where do I add members?". They're a first-class concept, so they get a
 * first-class screen, and tapping a person opens everything about that person
 * in one place rather than scattering it across Money and Settle.
 */
export default function People({ t }: { t: TripView }) {
  const code = t.trip.baseCurrency
  const [adding, setAdding] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [contribFor, setContribFor] = useState<string | null>(null)

  const balanceOf = (id: string) => t.settlement.balances.find((b) => b.memberId === id)
  const settledUp = t.settlement.transfers.length === 0
  const open = t.members.find((m) => m.id === openId)
  const openBalance = openId ? balanceOf(openId) : undefined

  // Per-person trip stats, computed from rows the engine already exposes.
  const statsFor = (memberId: string) => {
    const liveExpenses = t.expenses.filter((e) => !e.deletedAt)
    const paidCount = liveExpenses.filter((e) => e.source === 'personal' && e.payerId === memberId).length
    const sharedCount = liveExpenses.filter((e) => e.participants.includes(memberId)).length
    const contributed = t.contributions
      .filter((c) => !c.deletedAt && c.memberId === memberId)
      .reduce((s, c) => s + c.amountMinor, 0)
    const biggest = liveExpenses
      .filter((e) => e.source === 'personal' && e.payerId === memberId && !e.isRefund)
      .map((e) => ({ e, v: expenseBaseValue(e, t.trip, t.wallets) }))
      .sort((a, b) => b.v - a.v)[0]
    return { paidCount, sharedCount, contributed, biggest }
  }

  return (
    <>
      <Section
        title={`Members (${t.members.length})`}
        action={
          <button
            onClick={() => setAdding(true)}
            className="text-[13px] font-semibold text-brand-deep flex items-center gap-1"
          >
            <UserPlus size={14} /> Add
          </button>
        }
      >
        {t.members.length === 0 ? (
          <Empty
            icon={<Users size={20} />}
            title="No members added yet"
            hint="Add your travel buddies so expenses can be split and settled up easily. You can add more at any point during the trip."
            cta="Add members"
            onCta={() => setAdding(true)}
          />
        ) : (
          <ul className="card divide-y divide-surface-line/70 overflow-hidden">
            {t.members.map((m) => {
              const b = balanceOf(m.id)
              const bal = b?.balanceMinor ?? 0
              return (
                <li key={m.id} className="flex items-center">
                  <button
                    onClick={() => setOpenId(m.id)}
                    className="flex-1 flex items-center gap-3.5 px-5 py-4 text-left row-press min-w-0"
                  >
                    <Avatar name={m.name} />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-[15px] truncate">{m.name}</p>
                      <p className="text-[12px] text-ink-mute mt-0.5">
                        {m.isOperator ? 'Trip admin' : 'Traveller'}
                      </p>
                    </div>
                    <span
                      className={`tnum font-semibold text-[15px] shrink-0 ${
                        bal < 0 ? 'text-signal-neg' : bal > 0 ? 'text-signal-pos' : 'text-ink-mute'
                      }`}
                    >
                      {bal === 0 ? '—' : formatMoney(bal, code, { sign: true })}
                    </span>
                  </button>
                  {t.usesFund && (
                    <button
                      onClick={() => setContribFor(m.id)}
                      aria-label={`Add money for ${m.name}`}
                      className="shrink-0 w-9 h-9 mr-3 rounded-full bg-surface-sunk flex items-center justify-center active:scale-95 transition text-ink-soft"
                    >
                      <Plus size={16} />
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Section>

      {t.members.length > 0 && settledUp && (
        <Section>
          <div className="card p-5 flex items-center gap-3.5 bg-brand-wash border-brand/20">
            <span className="w-9 h-9 rounded-full bg-brand-deep text-white flex items-center justify-center shrink-0">
              <Check size={17} />
            </span>
            <div>
              <p className="font-semibold text-[14.5px] text-brand-dark">Everyone is settled up</p>
              <p className="text-[12.5px] text-brand-dark/70 mt-0.5">
                Keep adding expenses — balances update as you go.
              </p>
            </div>
          </div>
        </Section>
      )}

      <Section title="This trip so far">
        <div className="card px-5 py-3">
          <Stat label="Travellers" value={String(t.members.length)} />
          <Stat label="Expenses recorded" value={String(t.summary.expenseCount)} />
          <Stat label="Total spent" value={formatMoney(t.summary.totalSpentBaseMinor, code)} strong />
          <Stat
            label="Average per person"
            value={formatMoney(
              t.members.length ? Math.round(t.summary.totalSpentBaseMinor / t.members.length) : 0,
              code,
            )}
          />
        </div>
      </Section>

      {/* Everything about one person, in one place. */}
      <Sheet open={!!open} onClose={() => setOpenId(null)} title={open?.name ?? ''}>
        {open && openBalance && (
          <>
            <div className="flex items-center gap-4 mb-6">
              <Avatar name={open.name} size={56} />
              <div>
                <p className="font-semibold text-[19px] tracking-[-0.01em]">{open.name}</p>
                <p className="text-[13px] text-ink-mute mt-0.5">
                  {open.isOperator ? 'Trip admin · keeps the accounts' : 'Traveller'}
                </p>
              </div>
            </div>

            <div
              className={`rounded-2xl p-5 mb-5 ${
                openBalance.balanceMinor < 0
                  ? 'bg-[#FEF2F2]'
                  : openBalance.balanceMinor > 0
                    ? 'bg-brand-wash'
                    : 'bg-surface-sunk'
              }`}
            >
              <p className="label">
                {openBalance.balanceMinor > 0
                  ? 'Should get back'
                  : openBalance.balanceMinor < 0
                    ? 'Should pay in'
                    : 'Balance'}
              </p>
              <p
                className={`tnum text-[27px] font-semibold tracking-[-0.015em] mt-1.5 ${
                  openBalance.balanceMinor < 0
                    ? 'text-signal-neg'
                    : openBalance.balanceMinor > 0
                      ? 'text-brand-dark'
                      : ''
                }`}
              >
                {formatMoney(Math.abs(openBalance.balanceMinor), code)}
              </p>
              {openBalance.balanceMinor === 0 && (
                <p className="text-[12.5px] text-ink-mute mt-1.5">All square — nothing to move.</p>
              )}
            </div>

            <div className="card px-5 py-3 mb-5">
              <Stat label="Put in" value={formatMoney(openBalance.paidMinor, code)} />
              <Stat label="Used" value={formatMoney(openBalance.shareMinor, code)} />
              <Stat
                label="Balance"
                value={formatMoney(openBalance.balanceMinor, code, { sign: true })}
                tone={openBalance.balanceMinor < 0 ? 'neg' : openBalance.balanceMinor > 0 ? 'pos' : 'mute'}
                strong
              />
            </div>

            {(() => {
              const s = statsFor(open.id)
              return (
                <div className="card px-5 py-3 mb-4">
                  <Stat label="Expenses they paid for" value={String(s.paidCount)} />
                  <Stat label="Expenses they share in" value={String(s.sharedCount)} />
                  {s.contributed > 0 && (
                    <Stat label="Contributed to fund" value={formatMoney(s.contributed, code)} />
                  )}
                  {s.biggest && (
                    <Stat
                      label="Largest payment"
                      value={`${s.biggest.e.title} · ${formatMoney(s.biggest.v, code)}`}
                    />
                  )}
                </div>
              )
            })()}

            <p className="text-[12px] text-ink-mute px-1 mb-2">
              Lifetime stats across trips will appear here in a future release.
            </p>
          </>
        )}
      </Sheet>

      <AddMember t={t} open={adding} onClose={() => setAdding(false)} />
      <AddContribution
        t={t}
        open={!!contribFor}
        onClose={() => setContribFor(null)}
        presetMemberId={contribFor ?? undefined}
      />
    </>
  )
}

function AddMember({ t, open, onClose }: { t: TripView; open: boolean; onClose: () => void }) {
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  return (
    <Sheet open={open} onClose={onClose} title="Add someone">
      <Field label="Name" hint={error || 'Just a name — no account or invite needed.'}>
        <input
          className="field"
          autoFocus
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            if (error) setError('')
          }}
          placeholder="Adnan"
        />
      </Field>
      <button
        className="btn-primary w-full mb-2"
        disabled={!name.trim()}
        onClick={async () => {
          const problem = validateMemberName(name, t.members.map((m) => m.name))
          if (problem) return setError(problem)
          await db.members.add({
            id: uid(),
            tripId: t.trip.id,
            name: name.trim(),
            createdAt: Date.now(),
          })
          setName('')
          setError('')
          onClose()
        }}
      >
        Add to trip
      </button>
    </Sheet>
  )
}
