import { useState } from 'react'
import { toMinor } from '../core/money'
import type { Expense, MoneySource, SplitMode } from '../core/types'
import { db, uid } from '../db/db'
import type { TripView } from '../db/useTrip'
import { Field, More, Sheet } from '../ui/kit'

const CATEGORIES = ['Food', 'Stay', 'Transport', 'Fuel', 'Shopping', 'Tickets', 'Other']

/* ─────────────────────── add expense ─────────────────────── */

export function AddExpense({ t, open, onClose }: { t: TripView; open: boolean; onClose: () => void }) {
  const code = t.trip.baseCurrency
  const operator = t.members.find((m) => m.isOperator) ?? t.members[0]

  const [amount, setAmount] = useState('')
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('Food')
  const [currency, setCurrency] = useState(code)
  const [source, setSource] = useState<MoneySource>(t.usesFund ? 'fund' : 'personal')
  const [payerId, setPayerId] = useState(operator?.id ?? '')
  const [participants, setParticipants] = useState<string[]>(t.members.map((m) => m.id))
  const [splitMode, setSplitMode] = useState<SplitMode>('equal')
  const [error, setError] = useState('')

  const walletCodes = t.wallets.map((w) => w.code)
  const currencies = [code, ...walletCodes.filter((c) => c !== code.toUpperCase())]

  function reset() {
    setAmount(''); setTitle(''); setError('')
    setParticipants(t.members.map((m) => m.id))
    setSplitMode('equal')
  }

  async function save() {
    setError('')
    let amountMinor: number
    try {
      amountMinor = toMinor(amount, currency)
    } catch {
      setError('Enter an amount, like 450 or 450.50.')
      return
    }
    if (amountMinor <= 0) return setError('The amount has to be more than zero.')
    if (participants.length === 0) return setError('Pick at least one person sharing this.')

    const isForeign = currency.toUpperCase() !== code.toUpperCase()
    const finalSource: MoneySource = isForeign ? 'wallet' : source
    if (finalSource === 'personal' && !payerId) return setError('Pick who paid.')

    const e: Expense = {
      id: uid(),
      tripId: t.trip.id,
      title: title.trim() || category,
      category,
      currency: currency.toUpperCase(),
      amountMinor,
      source: finalSource,
      payerId: finalSource === 'personal' ? payerId : undefined,
      splitMode,
      participants,
      at: Date.now(),
    }
    await db.expenses.add(e)
    reset()
    onClose()
  }

  const toggle = (id: string) =>
    setParticipants((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))

  return (
    <Sheet open={open} onClose={onClose} title="Add expense">
      {/* Amount first: it's the only field that's always required. */}
      <Field label={`Amount in ${currency}`}>
        <input
          className="field tnum text-[30px] font-semibold py-4"
          inputMode="decimal"
          autoFocus
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0"
        />
      </Field>

      {currencies.length > 1 && (
        <div className="flex gap-2 mb-4">
          {currencies.map((c) => (
            <button
              key={c}
              onClick={() => setCurrency(c)}
              className={currency === c ? 'chip-on tnum' : 'chip-off tnum'}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      <Field label="What for">
        <input
          className="field"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Dinner at the hotel"
        />
      </Field>

      <div className="flex gap-2 flex-wrap mb-5">
        {CATEGORIES.map((c) => (
          <button key={c} onClick={() => setCategory(c)} className={category === c ? 'chip-on' : 'chip-off'}>
            {c}
          </button>
        ))}
      </div>

      {currency.toUpperCase() === code.toUpperCase() && (
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
      )}

      {currency.toUpperCase() === code.toUpperCase() && source === 'personal' && (
        <Field label="Who paid">
          <div className="flex gap-2 flex-wrap">
            {t.members.map((m) => (
              <button key={m.id} onClick={() => setPayerId(m.id)} className={payerId === m.id ? 'chip-on' : 'chip-off'}>
                {m.name}
              </button>
            ))}
          </div>
        </Field>
      )}

      {/* Everything below is hidden until someone needs it. */}
      <More label="Change who's sharing">
        <div className="flex gap-2 flex-wrap mb-3">
          {t.members.map((m) => (
            <button
              key={m.id}
              onClick={() => toggle(m.id)}
              className={participants.includes(m.id) ? 'chip-on' : 'chip-off'}
            >
              {m.name}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={() => setParticipants(t.members.map((m) => m.id))} className="chip-off">
            Everyone
          </button>
          <button onClick={() => setParticipants([])} className="chip-off">
            Nobody
          </button>
        </div>
        <p className="text-[12px] text-ink-mute mt-3 ml-1">
          Split equally between {participants.length || 'no'}{' '}
          {participants.length === 1 ? 'person' : 'people'}.
        </p>
      </More>

      {error && <p className="text-[13px] text-signal-neg mb-3 ml-1">{error}</p>}

      <button className="btn-primary w-full mb-2" onClick={save}>
        Save expense
      </button>
    </Sheet>
  )
}
