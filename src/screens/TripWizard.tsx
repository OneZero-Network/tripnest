import { Check, Plus, X } from 'lucide-react'
import { useState } from 'react'
import { ENGINE_VERSION } from '../core/engine'
import { toMinor } from '../core/money'
import { validateMemberName } from '../core/names'
import { db, uid } from '../db/db'
import { Field, Sheet } from '../ui/kit'

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SAR', 'THB', 'SGD', 'MYR', 'JPY', 'AUD', 'LKR']
const FOREX = ['SAR', 'AED', 'USD', 'EUR', 'THB', 'SGD', 'MYR', 'GBP', 'JPY', 'LKR']

/**
 * The wizard exists to teach the engine's real journey (trip → people → how
 * money works → expenses) instead of making a person discover it by poking
 * around Money and People after the fact. That was the single biggest gap:
 * the app's navigation never taught its own model.
 *
 * It does NOT add a "trip mode" flag to Trip. The engine's modules already
 * activate from real data (a contribution row, a purchase row) — see
 * core/modules.ts. Choosing "Shared trip fund" here just walks straight into
 * creating the first real contribution, so the module turns on exactly the
 * way it always does. No parallel state to keep in sync with the engine.
 */
type MoneyStyle = 'individual' | 'fund' | 'forex'

export function TripWizard({ open, onClose, onCreated }: {
  open: boolean
  onClose: () => void
  onCreated: (tripId: string) => void
}) {
  const [step, setStep] = useState(0)

  // Step 1 — the trip itself
  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [endDate, setEndDate] = useState('')
  const [baseCurrency, setBaseCurrency] = useState('INR')

  // Step 2 — who's going
  const [operatorName, setOperatorName] = useState('')
  const [friends, setFriends] = useState<string[]>([])
  const [friendInput, setFriendInput] = useState('')

  // Step 3 — how money will work (multi-select: a trip can use both)
  const [styles, setStyles] = useState<Set<MoneyStyle>>(new Set(['individual']))
  // Keyed by name, not id — members don't have ids yet at this point in the
  // wizard. Names are unique within a trip (validateMemberName enforces it),
  // so this is safe.
  const [fundAmounts, setFundAmounts] = useState<Record<string, string>>({})
  const [forexCode, setForexCode] = useState('SAR')
  const [forexAmount, setForexAmount] = useState('')
  const [forexCost, setForexCost] = useState('')
  const [error, setError] = useState('')

  function reset() {
    setStep(0)
    setName(''); setEndDate('')
    setOperatorName(''); setFriends([]); setFriendInput('')
    setStyles(new Set(['individual']))
    setFundAmounts({}); setForexAmount(''); setForexCost('')
    setError('')
  }

  function close() {
    reset()
    onClose()
  }

  function addFriend() {
    const n = friendInput.trim()
    const problem = validateMemberName(n, [operatorName, ...friends])
    if (problem) return setError(problem)
    setError('')
    setFriends((f) => [...f, n])
    setFriendInput('')
  }

  function toggleStyle(s: MoneyStyle) {
    setStyles((prev) => {
      const next = new Set(prev)
      if (s === 'individual') return new Set(['individual'])
      next.delete('individual')
      if (next.has(s)) next.delete(s)
      else next.add(s)
      if (next.size === 0) next.add('individual')
      return next
    })
  }

  const steps = ['Trip basics', "Who's going", 'How money will work']

  async function finish() {
    setError('')
    if (styles.has('fund')) {
      for (const [who, amt] of Object.entries(fundAmounts)) {
        if (!amt) continue
        try {
          if (toMinor(amt, baseCurrency) < 0) throw new Error()
        } catch {
          return setError(`${who}\u2019s contribution doesn\u2019t look like a number.`)
        }
      }
    }
    if (styles.has('forex')) {
      try {
        if (forexAmount && toMinor(forexAmount, forexCode) < 0) throw new Error()
        if (forexCost && toMinor(forexCost, baseCurrency) < 0) throw new Error()
      } catch {
        return setError('The currency amounts don\u2019t look like numbers.')
      }
    }

    const tripId = uid()
    const now = Date.now()
    await db.trips.add({
      id: tripId,
      name: name.trim() || 'New trip',
      destination: '',
      baseCurrency,
      startDate,
      endDate: endDate || undefined,
      createdAt: now,
      engineVersion: ENGINE_VERSION,
    })

    const operatorId = uid()
    const operatorFinal = operatorName.trim() || 'Me'
    if (validateMemberName(operatorFinal)) return setError('Enter your name — not an amount.')
    await db.members.add({
      id: operatorId, tripId, name: operatorFinal, isOperator: true, createdAt: now,
    })
    const idByName: Record<string, string> = { [operatorFinal]: operatorId }
    for (const fname of friends) {
      const fid = uid()
      await db.members.add({ id: fid, tripId, name: fname, createdAt: now })
      idByName[fname] = fid
    }

    // Fund and forex are created as real rows, not flags — this is what makes
    // the module appear on Home/Money/Activity exactly the way it would if
    // added later by hand.
    let fundTotalMinor = 0
    if (styles.has('fund')) {
      for (const [who, amt] of Object.entries(fundAmounts)) {
        const memberId = idByName[who]
        if (!amt || !memberId) continue
        const amountMinor = toMinor(amt, baseCurrency)
        if (amountMinor > 0) {
          await db.contributions.add({ id: uid(), tripId, memberId, amountMinor, at: now })
          fundTotalMinor += amountMinor
        }
      }
    }
    if (styles.has('forex') && forexAmount && forexCost) {
      try {
        const foreignMinor = toMinor(forexAmount, forexCode)
        const baseMinor = toMinor(forexCost, baseCurrency)
        if (foreignMinor > 0 && baseMinor > 0) {
          await db.purchases.add({
            id: uid(), tripId, code: forexCode.toUpperCase(), foreignMinor, baseMinor,
            source: fundTotalMinor > 0 ? 'fund' : 'personal',
            payerId: fundTotalMinor > 0 ? undefined : operatorId,
            at: now,
          })
        }
      } catch { /* already validated above */ }
    }

    reset()
    onCreated(tripId)
  }

  return (
    <Sheet open={open} onClose={close} title={steps[step]}>
      {/* Progress dots — three short steps, not a form. */}
      <div className="flex gap-1.5 mb-6 px-1">
        {steps.map((_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-brand-deep' : 'bg-surface-sunk'}`}
          />
        ))}
      </div>

      {step === 0 && (
        <>
          <Field label="Trip name" hint="e.g. 'Riyadh, January' — where and roughly when.">
            <input className="field" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Riyadh, January" />
          </Field>
          <div className="flex gap-3">
            <Field label="Start date">
              <input type="date" className="field tnum" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </Field>
            <Field label="End date (optional)">
              <input type="date" className="field tnum" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </Field>
          </div>
          <Field label="Settle in" hint="The currency you'll do the final maths in.">
            <select
              className="field tnum"
              value={baseCurrency}
              onChange={(e) => setBaseCurrency(e.target.value)}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </Field>
          <button className="btn-primary w-full mb-2" onClick={() => setStep(1)}>
            Next
          </button>
        </>
      )}

      {step === 1 && (
        <>
          <Field label="Your name" hint="You'll keep the accounts. Everyone else gets a shareable summary.">
            <input className="field" autoFocus value={operatorName} onChange={(e) => setOperatorName(e.target.value)} placeholder="Ayaz" />
          </Field>
          <Field label="Who else is coming" hint="Add names now, or later from People — either works.">
            <div className="flex gap-2 mb-2.5">
              <input
                className="field"
                value={friendInput}
                onChange={(e) => setFriendInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addFriend())}
                placeholder="Adnan"
              />
              <button
                onClick={addFriend}
                aria-label="Add friend"
                className="bg-ink text-white rounded-2xl w-12 shrink-0 flex items-center justify-center active:scale-95 transition"
              >
                <Plus size={18} />
              </button>
            </div>
            {friends.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {friends.map((f, i) => (
                  <span key={i} className="chip-off flex items-center gap-1.5">
                    {f}
                    <button onClick={() => setFriends((fr) => fr.filter((_, j) => j !== i))} aria-label={`Remove ${f}`}>
                      <X size={13} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </Field>
          <div className="flex gap-2">
            <button className="btn-quiet flex-1" onClick={() => setStep(0)}>Back</button>
            <button className="btn-primary flex-[2]" onClick={() => setStep(2)}>Next</button>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <Field label="How will you handle money" hint="Pick as many as apply — most trips just pay as they go.">
            <div className="flex gap-2 flex-wrap">
              <StyleChip active={styles.has('individual')} onClick={() => toggleStyle('individual')} label="Everyone pays their own way" />
              <StyleChip active={styles.has('fund')} onClick={() => toggleStyle('fund')} label="We're pooling a shared fund" />
              <StyleChip active={styles.has('forex')} onClick={() => toggleStyle('forex')} label="We'll use foreign currency" />
            </div>
          </Field>

          {styles.has('fund') && (
            <Field
              label={`Who's put money in so far, in ${baseCurrency}`}
              hint="Optional — leave anyone at 0 and add it later from Money instead."
            >
              <div className="space-y-2">
                {[operatorName.trim() || 'Me', ...friends].map((who) => (
                  <div key={who} className="flex items-center gap-3">
                    <span className="flex-1 text-[14px] font-medium truncate">{who}</span>
                    <input
                      className="field tnum w-32 text-right"
                      inputMode="decimal"
                      value={fundAmounts[who] ?? ''}
                      onChange={(e) => setFundAmounts((f) => ({ ...f, [who]: e.target.value }))}
                      placeholder="0"
                    />
                  </div>
                ))}
              </div>
            </Field>
          )}

          {styles.has('forex') && (
            <>
              <Field label="Currency">
                <div className="flex gap-2 flex-wrap">
                  {FOREX.map((c) => (
                    <button key={c} onClick={() => setForexCode(c)} className={forexCode === c ? 'chip-on tnum' : 'chip-off tnum'}>
                      {c}
                    </button>
                  ))}
                </div>
              </Field>
              <div className="flex gap-3">
                <Field label={`Amount bought, ${forexCode}`} hint="Optional — add later if you haven't bought it yet.">
                  <input className="field tnum" inputMode="decimal" value={forexAmount} onChange={(e) => setForexAmount(e.target.value)} placeholder="1000" />
                </Field>
                <Field label={`Cost, ${baseCurrency}`}>
                  <input className="field tnum" inputMode="decimal" value={forexCost} onChange={(e) => setForexCost(e.target.value)} placeholder="23500" />
                </Field>
              </div>
            </>
          )}

          {error && <p className="text-[13px] text-signal-neg mb-3 ml-1">{error}</p>}

          <div className="flex gap-2">
            <button className="btn-quiet flex-1" onClick={() => setStep(1)}>Back</button>
            <button className="btn-primary flex-[2] flex items-center justify-center gap-2" onClick={finish}>
              <Check size={17} /> Create trip
            </button>
          </div>
        </>
      )}
    </Sheet>
  )
}

function StyleChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`chip flex items-center gap-1.5 ${
        active ? 'bg-ink border-ink text-white' : 'bg-surface border-surface-line text-ink-soft'
      }`}
    >
      {active && <Check size={13} />}
      {label}
    </button>
  )
}
