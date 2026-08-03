import { Coins, HandCoins, Plus, Trash2, Wallet } from 'lucide-react'
import { useEffect, useState } from 'react'
import { formatMoney, symbolFor, toMinor } from '../core/money'
import { db, softDelete, uid } from '../db/db'
import type { TripView } from '../db/useTrip'
import { Empty, Field, Section, Sheet } from '../ui/kit'

const COMMON_FOREIGN = ['SAR', 'AED', 'USD', 'EUR', 'THB', 'SGD', 'MYR', 'GBP', 'JPY', 'LKR']

/**
 * Money answers one question: **where is the money?**
 *
 * It used to also answer "who's on the trip", "what does each person owe",
 * and "what transactions happened" — four questions on one screen, which is
 * why people couldn't tell what the page was for. Members moved to People,
 * balances moved to People and Settle. What's left is cash: the pooled fund
 * and any foreign currency, presented as wallets rather than as tables.
 */
export default function Money({ t }: { t: TripView }) {
  const code = t.trip.baseCurrency
  const [sheet, setSheet] = useState<null | 'contribution' | 'forex'>(null)

  const fundPct =
    t.fund.inMinor > 0
      ? Math.min(100, Math.max(0, (t.fund.remainingMinor / t.fund.inMinor) * 100))
      : 0

  const contributors = t.contributions
    .filter((c) => !c.deletedAt)
    .reduce<Record<string, number>>((acc, c) => {
      acc[c.memberId] = (acc[c.memberId] ?? 0) + c.amountMinor
      return acc
    }, {})

  const movements = [
    ...t.contributions.filter((c) => !c.deletedAt).map((c) => ({
      id: c.id, at: c.at, table: 'contributions' as const,
      title: `${t.memberName(c.memberId)} added money`,
      sub: 'Into the trip fund',
      amount: c.amountMinor, positive: true,
    })),
    ...t.purchases.filter((p) => !p.deletedAt).map((p) => ({
      id: p.id, at: p.at, table: 'purchases' as const,
      title: `Bought ${formatMoney(p.foreignMinor, p.code)}`,
      sub: p.source === 'fund' ? 'Paid from the trip fund' : `${t.memberName(p.payerId ?? '')} paid personally`,
      amount: p.baseMinor, positive: false,
    })),
  ].sort((a, b) => b.at - a.at)

  return (
    <>
      <Section title="Trip fund">
        {!t.usesFund ? (
          <Empty
            icon={<HandCoins size={20} />}
            title="No trip fund yet"
            hint="A trip fund is shared cash everyone chips into up front, so one person can pay for things on behalf of the group. If everyone just pays as they go, you don't need one."
            optional
            cta="Create trip fund"
            onCta={() => setSheet('contribution')}
          />
        ) : (
          <div className="rounded-xl3 bg-gradient-to-br from-brand to-brand-dark text-white p-6 shadow-hero">
            <div className="flex items-center gap-2 text-white/75">
              <Wallet size={15} />
              <p className="text-[12px] font-semibold uppercase tracking-[0.09em]">Trip fund</p>
            </div>
            <p className="text-[12.5px] text-white/70 mt-0.5">Shared cash everyone chipped in</p>
            <p className="tnum text-[33px] leading-none font-semibold tracking-[-0.02em] mt-2.5">
              {formatMoney(t.fund.remainingMinor, code)}
            </p>
            <p className="tnum text-[13px] text-white/75 mt-2">
              left of {formatMoney(t.fund.inMinor, code)} collected
            </p>

            <div className="h-1.5 bg-white/25 rounded-full mt-4 overflow-hidden">
              <div className="h-full bg-white rounded-full transition-all" style={{ width: `${fundPct}%` }} />
            </div>

            <div className="grid grid-cols-2 gap-3 mt-5">
              <div className="bg-white/15 backdrop-blur rounded-2xl p-3.5">
                <p className="text-[11.5px] text-white/70 font-medium">Collected</p>
                <p className="tnum text-[17px] font-semibold mt-0.5">{formatMoney(t.fund.inMinor, code)}</p>
              </div>
              <div className="bg-white/15 backdrop-blur rounded-2xl p-3.5">
                <p className="text-[11.5px] text-white/70 font-medium">Used</p>
                <p className="tnum text-[17px] font-semibold mt-0.5">
                  {formatMoney(t.fund.spentOnExpensesMinor + t.fund.spentOnForexMinor, code)}
                </p>
              </div>
            </div>

            <button
              onClick={() => setSheet('contribution')}
              className="mt-4 w-full bg-white text-brand-dark rounded-2xl py-3.5 font-semibold text-[15px] active:scale-[0.98] transition flex items-center justify-center gap-2"
            >
              <Plus size={17} /> Add money
            </button>
          </div>
        )}
      </Section>

      {t.usesFund && Object.keys(contributors).length > 0 && (
        <Section title="Who put money in">
          <ul className="card divide-y divide-surface-line/70 overflow-hidden">
            {Object.entries(contributors)
              .sort((a, b) => b[1] - a[1])
              .map(([memberId, amount]) => (
                <li key={memberId} className="flex items-center justify-between px-5 py-3.5">
                  <span className="text-[14.5px] font-medium">{t.memberName(memberId)}</span>
                  <span className="tnum font-semibold text-[14.5px]">{formatMoney(amount, code)}</span>
                </li>
              ))}
          </ul>
        </Section>
      )}

      <Section title="Foreign currency">
        {!t.usesForex ? (
          <Empty
            icon={<Coins size={20} />}
            title="No currency bought yet"
            hint="Record what you paid to buy foreign cash. Every expense in that currency is then valued at what it actually cost you — not at today's exchange rate, which is never what you paid."
            optional
            tone="accent"
            cta="Buy currency"
            onCta={() => setSheet('forex')}
          />
        ) : (
          <div className="space-y-3">
            {t.wallets.map((w) => (
              <div key={w.code} className="card p-5 bg-accent-wash border-accent/15">
                <div className="flex items-center gap-2 text-accent">
                  <Coins size={14} />
                  <p className="text-[12px] font-semibold uppercase tracking-[0.09em]">{w.code} wallet</p>
                </div>
                <p className="tnum text-[27px] leading-none font-semibold tracking-[-0.02em] mt-2.5">
                  {formatMoney(w.remainingForeignMinor, w.code)}
                </p>
                <p className="tnum text-[13px] text-ink-mute mt-2">
                  worth {formatMoney(w.remainingBaseMinor, code)} at your purchase rate
                </p>
                <div className="h-1.5 bg-white/70 rounded-full mt-4 overflow-hidden">
                  <div
                    className="h-full bg-accent rounded-full"
                    style={{
                      width: `${w.purchasedForeignMinor > 0 ? Math.min(100, Math.max(0, (w.remainingForeignMinor / w.purchasedForeignMinor) * 100)) : 0}%`,
                    }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-y-2 mt-4 text-[12.5px] tnum">
                  <span className="text-ink-mute">Bought</span>
                  <span className="text-right font-medium">
                    {formatMoney(w.purchasedForeignMinor, w.code)}
                  </span>
                  <span className="text-ink-mute">Spent</span>
                  <span className="text-right font-medium">
                    {formatMoney(w.spentForeignMinor, w.code)}
                  </span>
                  <span className="text-ink-mute">Cost</span>
                  <span className="text-right font-medium">{formatMoney(w.purchasedBaseMinor, code)}</span>
                  <span className="text-ink-mute">Your rate</span>
                  <span className="text-right font-medium">
                    {symbolFor(code)}
                    {w.blendedRate.toFixed(3)} per {symbolFor(w.code).trim()}1
                  </span>
                </div>
                <button
                  onClick={() => setSheet('forex')}
                  className="mt-4 w-full bg-accent text-white rounded-2xl py-3 font-semibold text-[14.5px] active:scale-[0.98] transition flex items-center justify-center gap-2"
                >
                  <Plus size={16} /> Buy more {w.code}
                </button>
              </div>
            ))}
          </div>
        )}
      </Section>

      {movements.length > 0 && (
        <Section title="Recent transactions">
          <ul className="card divide-y divide-surface-line/70 overflow-hidden">
            {movements.slice(0, 8).map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-5 py-4">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-[14.5px] truncate">{m.title}</p>
                  <p className="text-[12px] text-ink-mute mt-0.5 truncate">{m.sub}</p>
                </div>
                <span
                  className={`tnum font-semibold text-[14.5px] shrink-0 ${
                    m.positive ? 'text-signal-pos' : 'text-ink'
                  }`}
                >
                  {m.positive ? '+' : '−'}
                  {formatMoney(m.amount, code)}
                </span>
                <button
                  aria-label="Delete"
                  onClick={() => softDelete(m.table, m.id)}
                  className="p-2 -mr-2 text-ink-mute active:text-signal-neg"
                >
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <AddContribution t={t} open={sheet === 'contribution'} onClose={() => setSheet(null)} />
      <AddForex t={t} open={sheet === 'forex'} onClose={() => setSheet(null)} />
    </>
  )
}

export function AddContribution({
  t, open, onClose, presetMemberId,
}: { t: TripView; open: boolean; onClose: () => void; presetMemberId?: string }) {
  const code = t.trip.baseCurrency
  const [memberId, setMemberId] = useState(presetMemberId ?? t.members[0]?.id ?? '')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) setMemberId(presetMemberId ?? t.members[0]?.id ?? '')
  }, [open, presetMemberId])

  return (
    <Sheet open={open} onClose={onClose} title="Add money to the fund">
      <Field label={`Amount in ${code}`}>
        <input
          className="field tnum text-[30px] font-semibold py-4"
          inputMode="decimal"
          autoFocus
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0"
        />
      </Field>
      <Field label="Who put it in">
        <div className="flex gap-2 flex-wrap">
          {t.members.map((m) => (
            <button
              key={m.id}
              onClick={() => setMemberId(m.id)}
              className={memberId === m.id ? 'chip-on' : 'chip-off'}
            >
              {m.name}
            </button>
          ))}
        </div>
      </Field>
      {error && <p className="text-[13px] text-signal-neg mb-3 ml-1">{error}</p>}
      <button
        className="btn-primary w-full mb-2"
        onClick={async () => {
          try {
            const amountMinor = toMinor(amount, code)
            if (amountMinor <= 0) return setError('The amount has to be more than zero.')
            if (!memberId) return setError('Pick who contributed.')
            await db.contributions.add({
              id: uid(), tripId: t.trip.id, memberId, amountMinor, at: Date.now(),
            })
            setAmount(''); setError(''); onClose()
          } catch {
            setError('Enter an amount, like 20000.')
          }
        }}
      >
        Add to fund
      </button>
    </Sheet>
  )
}

function AddForex({ t, open, onClose }: { t: TripView; open: boolean; onClose: () => void }) {
  const code = t.trip.baseCurrency
  const [fx, setFx] = useState(t.wallets[0]?.code ?? 'SAR')
  const [foreign, setForeign] = useState('')
  const [base, setBase] = useState('')
  const [source, setSource] = useState<'fund' | 'personal'>(t.usesFund ? 'fund' : 'personal')
  const [payerId, setPayerId] = useState(t.members[0]?.id ?? '')
  const [error, setError] = useState('')

  let rate = ''
  try {
    const f = toMinor(foreign, fx)
    const b = toMinor(base, code)
    if (f > 0 && b > 0) rate = `Your rate: ${symbolFor(code)}${(b / f).toFixed(3)} per ${symbolFor(fx).trim()}1`
  } catch { /* still typing */ }

  return (
    <Sheet open={open} onClose={onClose} title="Bought foreign cash">
      <Field label="Currency">
        <div className="flex gap-2 flex-wrap">
          {Array.from(new Set([...t.wallets.map((w) => w.code), ...COMMON_FOREIGN])).map((c) => (
            <button key={c} onClick={() => setFx(c)} className={fx === c ? 'chip-on tnum' : 'chip-off tnum'}>
              {c}
            </button>
          ))}
        </div>
      </Field>
      <Field label={`How much ${fx} you got`}>
        <input
          className="field tnum"
          inputMode="decimal"
          value={foreign}
          onChange={(e) => setForeign(e.target.value)}
          placeholder="1000"
        />
      </Field>
      <Field label={`What it cost in ${code}`} hint={rate || 'Enter both to see your rate.'}>
        <input
          className="field tnum"
          inputMode="decimal"
          value={base}
          onChange={(e) => setBase(e.target.value)}
          placeholder="23500"
        />
      </Field>
      <Field label="Paid with">
        <div className="flex gap-2">
          {t.usesFund && (
            <button onClick={() => setSource('fund')} className={source === 'fund' ? 'chip-on' : 'chip-off'}>
              Trip fund
            </button>
          )}
          <button onClick={() => setSource('personal')} className={source === 'personal' ? 'chip-on' : 'chip-off'}>
            Someone's own money
          </button>
        </div>
      </Field>
      {source === 'personal' && (
        <Field label="Who paid" hint="They get credited back automatically at settlement.">
          <div className="flex gap-2 flex-wrap">
            {t.members.map((m) => (
              <button
                key={m.id}
                onClick={() => setPayerId(m.id)}
                className={payerId === m.id ? 'chip-on' : 'chip-off'}
              >
                {m.name}
              </button>
            ))}
          </div>
        </Field>
      )}
      {error && <p className="text-[13px] text-signal-neg mb-3 ml-1">{error}</p>}
      <button
        className="btn-primary w-full mb-2"
        onClick={async () => {
          try {
            const foreignMinor = toMinor(foreign, fx)
            const baseMinor = toMinor(base, code)
            if (foreignMinor <= 0 || baseMinor <= 0) return setError('Both amounts have to be more than zero.')
            if (source === 'personal' && !payerId) return setError('Pick who paid.')
            await db.purchases.add({
              id: uid(), tripId: t.trip.id, code: fx.toUpperCase(),
              foreignMinor, baseMinor, source,
              payerId: source === 'personal' ? payerId : undefined,
              at: Date.now(),
            })
            setForeign(''); setBase(''); setError(''); onClose()
          } catch {
            setError('Enter both amounts as numbers.')
          }
        }}
      >
        Add to the {fx} wallet
      </button>
    </Sheet>
  )
}
