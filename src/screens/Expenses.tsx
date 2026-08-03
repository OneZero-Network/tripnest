import { Check, ChevronDown, Delete } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toMinor } from '../core/money'
import type { Expense, MoneySource, SplitMode } from '../core/types'
import { db, uid } from '../db/db'
import type { TripView } from '../db/useTrip'
import { Field, Sheet } from '../ui/kit'

const CATEGORIES = ['Food', 'Transport', 'Fuel', 'Stay', 'Shopping', 'Tickets', 'Other']

/**
 * Add expense, in two steps.
 *
 * Step 1 is the amount and nothing else — that's the only field that is
 * always required, and the one a person is holding in their head while
 * walking away from a counter. Step 2 is description and who paid.
 * Fund/wallet source, custom splits, and notes live behind "Advanced
 * options" and are never shown unless asked for.
 *
 * Target: a default expense in three taps and under ten seconds.
 */
export function AddExpense({ t, open, onClose }: { t: TripView; open: boolean; onClose: () => void }) {
  const code = t.trip.baseCurrency
  const operator = t.members.find((m) => m.isOperator) ?? t.members[0]

  const [step, setStep] = useState<1 | 2>(1)
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

  // Reset to a clean step 1 each time the sheet opens.
  useEffect(() => {
    if (!open) return
    setStep(1)
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

  function next() {
    try {
      if (toMinor(amount, currency) <= 0) return setError('Enter an amount greater than zero.')
    } catch {
      return setError('Enter an amount, like 450 or 450.50.')
    }
    setError('')
    setStep(2)
  }

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
      at: Date.now(),
    }
    await db.expenses.add(e)
    onClose()
  }

  const toggle = (id: string) =>
    setParticipants((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))

  const key = (k: string) => {
    if (k === 'del') return setAmount((a) => a.slice(0, -1))
    if (k === '.' && amount.includes('.')) return
    setAmount((a) => (a === '0' ? k : a + k))
  }

  return (
    <Sheet open={open} onClose={onClose} title={step === 1 ? 'Add expense' : 'A few details'}>
      {step === 1 ? (
        <>
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

          <div className="text-center py-6">
            <p className="tnum text-[52px] leading-none font-semibold tracking-[-0.04em] break-all">
              {amount ? `${currency === 'INR' ? '₹' : ''}${amount}` : <span className="text-ink-mute">0</span>}
            </p>
            {isForeign && <p className="text-[12.5px] text-ink-mute mt-2">Paid from the {currency} wallet</p>}
          </div>

          {/* A numeric pad beats a keyboard when you're holding luggage. */}
          <div className="grid grid-cols-3 gap-2 mb-5">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'].map((k) => (
              <button
                key={k}
                onClick={() => key(k)}
                className="py-4 rounded-2xl bg-surface-sunk text-[21px] font-semibold tnum
                           active:bg-surface-line active:scale-[0.97] transition flex items-center justify-center"
              >
                {k === 'del' ? <Delete size={20} /> : k}
              </button>
            ))}
          </div>

          <p className="label mb-2 ml-1">Category</p>
          <div className="flex gap-2 flex-wrap mb-5">
            {CATEGORIES.map((c) => (
              <button key={c} onClick={() => setCategory(c)} className={category === c ? 'chip-on' : 'chip-off'}>
                {c}
              </button>
            ))}
          </div>

          {error && <p className="text-[13px] text-signal-neg mb-3 ml-1">{error}</p>}
          <button className="btn-primary w-full mb-2" onClick={next}>
            Next
          </button>
        </>
      ) : (
        <>
          <div className="bg-surface-sunk rounded-2xl px-5 py-4 mb-5 flex items-baseline justify-between">
            <span className="tnum text-[26px] font-semibold tracking-[-0.02em]">
              {currency === 'INR' ? '₹' : `${currency} `}
              {amount}
            </span>
            <button onClick={() => setStep(1)} className="text-[13px] font-semibold text-brand-deep">
              Edit
            </button>
          </div>

          <Field label="What was it for">
            <input
              className="field"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={`${category} — e.g. dinner at the hotel`}
            />
          </Field>

          {!isForeign && (
            <Field label="Who paid">
              <div className="flex gap-2 flex-wrap">
                {t.usesFund && (
                  <button
                    onClick={() => setSource('fund')}
                    className={source === 'fund' ? 'chip-on' : 'chip-off'}
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
                    className={source === 'personal' && payerId === m.id ? 'chip-on' : 'chip-off'}
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
        </>
      )}
    </Sheet>
  )
}
