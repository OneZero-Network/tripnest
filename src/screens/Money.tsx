import { Plus, Trash2, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { formatMoney, symbolFor, toMinor } from '../core/money'
import { db, softDelete, uid } from '../db/db'
import type { TripView } from '../db/useTrip'
import { Empty, Field, Section, Sheet } from '../ui/kit'

const COMMON_FOREIGN = ['SAR', 'AED', 'USD', 'EUR', 'THB', 'SGD', 'MYR', 'GBP', 'JPY', 'LKR']

export default function Money({ t }: { t: TripView }) {
  const code = t.trip.baseCurrency
  const [sheet, setSheet] = useState<null | 'member' | 'contribution' | 'forex'>(null)

  return (
    <>
      <Section
        title="Who's on this trip"
        action={
          <button onClick={() => setSheet('member')} className="text-[13px] font-semibold flex items-center gap-1">
            <UserPlus size={14} /> Add
          </button>
        }
      >
        <ul className="card divide-y divide-surface-line/70 overflow-hidden">
          {t.members.map((m) => {
            const b = t.settlement.balances.find((x) => x.memberId === m.id)
            return (
              <li key={m.id} className="flex items-center justify-between px-5 py-4">
                <div>
                  <p className="font-medium text-[15px]">
                    {m.name}
                    {m.isOperator && <span className="text-[11px] text-ink-mute ml-2">keeps the accounts</span>}
                  </p>
                  <p className="text-[12px] text-ink-mute tnum mt-0.5">
                    paid {formatMoney(b?.paidMinor ?? 0, code)} · used {formatMoney(b?.shareMinor ?? 0, code)}
                  </p>
                </div>
                <span
                  className={`tnum font-semibold text-[15px] ${
                    (b?.balanceMinor ?? 0) < 0 ? 'text-signal-neg' : 'text-signal-pos'
                  }`}
                >
                  {formatMoney(b?.balanceMinor ?? 0, code, { sign: true })}
                </span>
              </li>
            )
          })}
        </ul>
      </Section>

      <Section
        title="Trip fund"
        action={
          <button onClick={() => setSheet('contribution')} className="text-[13px] font-semibold flex items-center gap-1">
            <Plus size={14} /> Contribution
          </button>
        }
      >
        {!t.usesFund ? (
          <Empty
            title="No shared pot yet"
            hint="If everyone chips in up front, record each contribution here. Skip this if people just pay as they go."
          />
        ) : (
          <ul className="card divide-y divide-surface-line/70 overflow-hidden">
            {t.contributions
              .filter((c) => !c.deletedAt)
              .map((c) => (
                <Row
                  key={c.id}
                  left={t.memberName(c.memberId)}
                  sub={new Date(c.at).toLocaleDateString()}
                  right={formatMoney(c.amountMinor, code)}
                  onDelete={() => softDelete('contributions', c.id)}
                />
              ))}
            <li className="flex justify-between px-5 py-4 bg-surface-sunk/60">
              <span className="text-[14px] text-ink-soft">Left in the fund</span>
              <span className="tnum font-semibold">{formatMoney(t.fund.remainingMinor, code)}</span>
            </li>
          </ul>
        )}
      </Section>

      <Section
        title="Foreign cash"
        action={
          <button onClick={() => setSheet('forex')} className="text-[13px] font-semibold flex items-center gap-1">
            <Plus size={14} /> Purchase
          </button>
        }
      >
        {!t.usesForex ? (
          <Empty
            title="No currency bought"
            hint="Record what you paid to buy foreign cash. Every expense in that currency is then valued at what it actually cost you — not today's rate."
          />
        ) : (
          <ul className="card divide-y divide-surface-line/70 overflow-hidden">
            {t.purchases
              .filter((p) => !p.deletedAt)
              .map((p) => (
                <Row
                  key={p.id}
                  left={`${formatMoney(p.foreignMinor, p.code)}`}
                  sub={
                    p.source === 'personal'
                      ? `${t.memberName(p.payerId ?? '')} paid personally`
                      : 'paid from the trip fund'
                  }
                  right={formatMoney(p.baseMinor, code)}
                  onDelete={() => softDelete('purchases', p.id)}
                />
              ))}
            {t.wallets.map((w) => (
              <li key={w.code} className="px-5 py-4 bg-surface-sunk/60">
                <div className="flex justify-between">
                  <span className="text-[14px] text-ink-soft">{w.code} left</span>
                  <span className="tnum font-semibold">{formatMoney(w.remainingForeignMinor, w.code)}</span>
                </div>
                <p className="text-[12px] text-ink-mute tnum mt-1">
                  worth {formatMoney(w.remainingBaseMinor, code)} at {symbolFor(code)}
                  {w.blendedRate.toFixed(3)} per {symbolFor(w.code).trim()}1
                </p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <AddMember t={t} open={sheet === 'member'} onClose={() => setSheet(null)} />
      <AddContribution t={t} open={sheet === 'contribution'} onClose={() => setSheet(null)} />
      <AddForex t={t} open={sheet === 'forex'} onClose={() => setSheet(null)} />
    </>
  )
}

function Row({
  left, sub, right, onDelete,
}: { left: string; sub: string; right: string; onDelete: () => void }) {
  return (
    <li className="flex items-center gap-3 px-5 py-4">
      <div className="flex-1 min-w-0">
        <p className="font-medium text-[15px] truncate tnum">{left}</p>
        <p className="text-[12px] text-ink-mute mt-0.5 truncate">{sub}</p>
      </div>
      <span className="tnum font-semibold text-[15px]">{right}</span>
      <button aria-label="Delete" onClick={onDelete} className="p-2 -mr-2 text-ink-mute active:text-signal-neg">
        <Trash2 size={17} />
      </button>
    </li>
  )
}

function AddMember({ t, open, onClose }: { t: TripView; open: boolean; onClose: () => void }) {
  const [name, setName] = useState('')
  return (
    <Sheet open={open} onClose={onClose} title="Add someone">
      <Field label="Name">
        <input className="field" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Adnan" />
      </Field>
      <button
        className="btn-primary w-full mb-2"
        disabled={!name.trim()}
        onClick={async () => {
          await db.members.add({ id: uid(), tripId: t.trip.id, name: name.trim(), createdAt: Date.now() })
          setName('')
          onClose()
        }}
      >
        Add to trip
      </button>
    </Sheet>
  )
}

function AddContribution({ t, open, onClose }: { t: TripView; open: boolean; onClose: () => void }) {
  const code = t.trip.baseCurrency
  const [memberId, setMemberId] = useState(t.members[0]?.id ?? '')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState('')

  return (
    <Sheet open={open} onClose={onClose} title="Money into the fund">
      <Field label={`Amount in ${code}`}>
        <input
          className="field tnum text-[28px] font-semibold py-4"
          inputMode="decimal" autoFocus
          value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0"
        />
      </Field>
      <Field label="From">
        <div className="flex gap-2 flex-wrap">
          {t.members.map((m) => (
            <button key={m.id} onClick={() => setMemberId(m.id)} className={memberId === m.id ? 'chip-on' : 'chip-off'}>
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
            await db.contributions.add({ id: uid(), tripId: t.trip.id, memberId, amountMinor, at: Date.now() })
            setAmount(''); setError(''); onClose()
          } catch {
            setError('Enter an amount, like 20000.')
          }
        }}
      >
        Record contribution
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
    if (f > 0 && b > 0) rate = `${symbolFor(code)}${(b / f).toFixed(3)} per ${symbolFor(fx).trim()}1`
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
        <input className="field tnum" inputMode="decimal" value={foreign} onChange={(e) => setForeign(e.target.value)} placeholder="1000" />
      </Field>
      <Field label={`What it cost in ${code}`} hint={rate || 'Enter both to see your rate.'}>
        <input className="field tnum" inputMode="decimal" value={base} onChange={(e) => setBase(e.target.value)} placeholder="23500" />
      </Field>
      <Field label="Paid with">
        <div className="flex gap-2">
          <button onClick={() => setSource('fund')} className={source === 'fund' ? 'chip-on' : 'chip-off'}>
            Trip fund
          </button>
          <button onClick={() => setSource('personal')} className={source === 'personal' ? 'chip-on' : 'chip-off'}>
            Someone's own money
          </button>
        </div>
      </Field>
      {source === 'personal' && (
        <Field label="Who paid" hint="They get credited back at settlement.">
          <div className="flex gap-2 flex-wrap">
            {t.members.map((m) => (
              <button key={m.id} onClick={() => setPayerId(m.id)} className={payerId === m.id ? 'chip-on' : 'chip-off'}>
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
