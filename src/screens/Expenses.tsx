import { Check, ChevronDown } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toMinor } from '../core/money'
import type { Expense, MoneySource, SplitMode } from '../core/types'
import { db, uid } from '../db/db'
import type { TripView } from '../db/useTrip'
import { Field, Sheet } from '../ui/kit'

const CATEGORIES = ['Food', 'Transport', 'Fuel', 'Stay', 'Shopping', 'Tickets', 'Other']

/**
 * Add expense, in one screen.
 *
 * This used to be two steps — amount, then a "Next" tap into description/
 * payer. Direct feedback: recording an expense should take one pass, no
 * intermediate confirmation the person didn't ask for. Everything now lives
 * on one scrollable sheet; only "Advanced options" (custom split, notes)
 * stays collapsed, because those are genuinely optional, not because they're
 * gating anything.
 */
export function AddExpense({ t, open, onClose }: { t: TripView; open: boolean; onClose: () => void }) {
  const code = t.trip.baseCurrency
  const operator = t.members.find((m) => m.isOperator) ?? t.members[0]

  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('Food')
  const [title, setTitle] = useState('')
  const [currency, setCurrency] = useState(code)
  const [source, setSource] = useState<MoneySource>(t.usesFund ? 'fund' : 'personal')
  const [payerId, setPayerId] = useState(operator?.id ?? '')
  const [participants, setParticipants] = useState<string[]>(t.members.map((m) => m.id))
  const [splitMode] = useState<SplitMode>('equal')
  const [note, setNote] = useState('')
  const [advanced, setAdvanced] = useState(false)
  const [error, setError] = useState('')
  const amountRef = useRef<HTMLInputElement>(null)

  // Reset to a clean form each time the sheet opens.
  useEffect(() => {
    if (!open) return
    setAmount('')
    setTitle('')
    setNote('')
    setError('')
    setAdvanced(false)
    setCurrency(code)
    setSource(t.usesFund ? 'fund' : 'personal')
    setPayerId(operator?.id ?? '')
    setParticipants(t.members.map((m) => m.id))
  }, [open])

  const walletCodes = t.wallets.map((w) => w.code)
  const currencies = [code, ...walletCodes.filter((c) => c !== code.toUpperCase())]
  const isForeign = currency.toUpperCase() !== code.toUpperCase()

  async function save() {
    setError('')
    let amountMinor: number
    try {
      amountMinor = toMinor(amount, currency)
    } catch {
      return setError('Enter an amount, like 450 or 450.50.')
    }
    if (amountMinor <= 0) return setError('Enter an amount greater than zero.')
    if (participants.length === 0) return setError('Pick at least one person sharing this.')

    const finalSource: MoneySource = isForeign ? 'wallet' : source
    if (finalSource === 'personal' && !payerId) return setError('Pick who paid.')

    const isDefaultSplit =
      participants.length === t.members.length && t.members.every((m) => participants.includes(m.id))

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
      note: note.trim() || undefined,
      // Only true when something was actually changed from the default —
      // opening "Advanced options" to look and closing it again shouldn't
      // flag an otherwise ordinary expense.
      advanced: !isDefaultSplit || !!note.trim() || undefined,
      at: Date.now(),
    }
    await db.expenses.add(e)
    onClose()
  }

  const toggle = (id: string) =>
    setParticipants((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))

  return (
    <Sheet open={open} onClose={onClose} title="Add expense">
      {currencies.length > 1 && (
        <div className="flex gap-2 mb-4 justify-center">
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

      {/* A real input, not a custom numpad — the numpad alone was ~180px of
          height, which is exactly why this sheet needed scrolling. The
          device's own number keyboard does the same job in a fraction of
          the space, and people already know how to use it. */}
      <div className="flex items-center gap-1 py-3 mb-4 border-b-2 border-surface-line focus-within:border-ink transition-colors">
        {currency === 'INR' && !isForeign && (
          <span className="text-[30px] font-semibold text-ink-mute">₹</span>
        )}
        <input
          ref={amountRef}
          className="flex-1 min-w-0 tnum text-[30px] font-semibold tracking-[-0.02em] bg-transparent outline-none"
          inputMode="decimal"
          autoFocus
          value={amount}
          onChange={(e) => {
            const v = e.target.value
            if (/^\d*\.?\d*$/.test(v)) setAmount(v)
          }}
          placeholder="0"
        />
        {isForeign && <span className="text-[15px] font-semibold text-ink-mute">{currency}</span>}
      </div>
      {isForeign && <p className="text-[12.5px] text-ink-mute -mt-3 mb-4">Paid from the {currency} wallet</p>}

      <p className="label mb-2 ml-1">Category</p>
      <div className="flex gap-2 mb-5 overflow-x-auto -mx-5 px-5 pb-1" style={{ scrollbarWidth: 'none' }}>
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`shrink-0 ${category === c ? 'chip-on' : 'chip-off'}`}
          >
            {c}
          </button>
        ))}
      </div>

      <Field label="What was it for">
        <input
          className="field"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={`${category} — e.g. dinner at the hotel`}
        />
      </Field>

      {!isForeign && (
        <Field label="Who paid">
          <div className="flex gap-2 overflow-x-auto -mx-5 px-5 pb-1" style={{ scrollbarWidth: 'none' }}>
            {t.usesFund && (
              <button
                onClick={() => setSource('fund')}
                className={`shrink-0 ${source === 'fund' ? 'chip-on' : 'chip-off'}`}
              >
                Trip fund
              </button>
            )}
            {t.members.map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  setSource('personal')
                  setPayerId(m.id)
                }}
                className={`shrink-0 ${source === 'personal' && payerId === m.id ? 'chip-on' : 'chip-off'}`}
              >
                {m.name}
              </button>
            ))}
          </div>
        </Field>
      )}

      {/* Everything below is hidden until someone actually needs it. */}
      <button
        onClick={() => setAdvanced((a) => !a)}
        className="w-full flex items-center justify-between py-3 px-1 mb-2"
      >
        <span className="label">Advanced options</span>
        <ChevronDown
          size={17}
          className={`text-ink-mute transition-transform ${advanced ? 'rotate-180' : ''}`}
        />
      </button>

      {advanced && (
        <div className="mb-4">
          <Field label="Split between" hint={`Shared equally between ${participants.length || 'no'} ${participants.length === 1 ? 'person' : 'people'}.`}>
            <div className="flex gap-2 flex-wrap mb-2.5">
              {t.members.map((m) => (
                <button
                  key={m.id}
                  onClick={() => toggle(m.id)}
                  className={`chip flex items-center gap-1.5 ${
                    participants.includes(m.id)
                      ? 'bg-ink border-ink text-white'
                      : 'bg-surface border-surface-line text-ink-soft'
                  }`}
                >
                  {participants.includes(m.id) && <Check size={13} />}
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
          </Field>

          <Field label="Note (optional)">
            <input
              className="field"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Petrol for the way to the hotel"
            />
          </Field>
        </div>
      )}

      {error && <p className="text-[13px] text-signal-neg mb-3 ml-1">{error}</p>}
      <button className="btn-primary w-full mb-2" onClick={save}>
        Save expense
      </button>
    </Sheet>
  )
}
