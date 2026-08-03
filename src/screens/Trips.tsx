import { Download, MapPin, Plus, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db, downloadJSON, exportEverything, importBundle, uid } from '../db/db'
import { ENGINE_VERSION } from '../core/engine'
import { useTrip, useTrips } from '../db/useTrip'
import { formatCompact } from '../core/money'
import { Empty, Field, Screen, Section, Sheet, TopBar } from '../ui/kit'

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SAR', 'THB', 'SGD', 'MYR', 'JPY', 'AUD', 'LKR']

export default function Trips() {
  const trips = useTrips()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const [name, setName] = useState('')
  const [destination, setDestination] = useState('')
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [baseCurrency, setBaseCurrency] = useState('INR')
  const [operator, setOperator] = useState('')

  async function create() {
    const id = uid()
    await db.trips.add({
      id,
      name: name.trim() || destination.trim() || 'New trip',
      destination: destination.trim(),
      baseCurrency,
      startDate,
      createdAt: Date.now(),
      engineVersion: ENGINE_VERSION,
    })
    await db.members.add({
      id: uid(),
      tripId: id,
      name: operator.trim() || 'Me',
      isOperator: true,
      createdAt: Date.now(),
    })
    setOpen(false)
    setName(''); setDestination(''); setOperator('')
    nav(`/trip/${id}`)
  }

  async function onImport(file: File) {
    try {
      const count = await importBundle(JSON.parse(await file.text()))
      alert(`Restored ${count} trip${count === 1 ? '' : 's'}.`)
    } catch (e) {
      alert(`That file could not be read. ${(e as Error).message}`)
    }
  }

  return (
    <Screen>
      <TopBar
        title="Trips"
        subtitle="Everything lives on this device"
        right={
          <div className="flex gap-1 mt-1">
            <button
              aria-label="Back up all trips"
              className="p-2.5 rounded-full active:bg-surface-line"
              onClick={async () => downloadJSON(`tripnest-backup-${Date.now()}.json`, await exportEverything())}
            >
              <Download size={19} />
            </button>
            <button
              aria-label="Restore from a backup file"
              className="p-2.5 rounded-full active:bg-surface-line"
              onClick={() => fileRef.current?.click()}
            >
              <Upload size={19} />
            </button>
          </div>
        }
      />
      <input
        ref={fileRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])}
      />

      <Section>
        {!trips ? null : trips.length === 0 ? (
          <Empty
            title="No trips yet"
            hint="Create a trip before you leave. Add expenses as they happen, settle up when you get back."
            action={
              <button className="btn-primary" onClick={() => setOpen(true)}>
                Create your first trip
              </button>
            }
          />
        ) : (
          <ul className="space-y-3">
            {trips.map((t) => (
              <li key={t.id}>
                <button
                  onClick={() => nav(`/trip/${t.id}`)}
                  className="card w-full text-left p-5 row-press"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-[17px] tracking-[-0.01em] truncate">{t.name}</p>
                      {t.destination && (
                        <p className="text-[13px] text-ink-mute mt-1 flex items-center gap-1.5">
                          <MapPin size={13} /> {t.destination}
                        </p>
                      )}
                    </div>
                    <TripTotal tripId={t.id} code={t.baseCurrency} />
                  </div>
                  <p className="text-[12px] text-ink-mute mt-3 tnum">
                    {t.startDate}
                    {t.endDate ? ` → ${t.endDate}` : ''}
                    {t.closedAt ? ' · settled' : ''}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <button
        onClick={() => setOpen(true)}
        aria-label="Create a trip"
        className="fixed right-5 z-40 bg-ink text-white rounded-full w-14 h-14
                   flex items-center justify-center shadow-lift active:scale-95 transition"
        style={{ bottom: 'calc(var(--safe-bottom) + 24px)' }}
      >
        <Plus size={26} />
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="New trip">
        <Field label="Trip name">
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Riyadh, January" />
        </Field>
        <Field label="Destination">
          <input className="field" value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Riyadh" />
        </Field>
        <Field label="Start date">
          <input type="date" className="field tnum" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </Field>
        <Field label="Settle in" hint="The currency you'll do the final maths in.">
          <div className="flex gap-2 flex-wrap">
            {CURRENCIES.map((c) => (
              <button
                key={c}
                onClick={() => setBaseCurrency(c)}
                className={baseCurrency === c ? 'chip-on tnum' : 'chip-off tnum'}
              >
                {c}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Your name" hint="You keep the accounts. Others get a shareable summary.">
          <input className="field" value={operator} onChange={(e) => setOperator(e.target.value)} placeholder="Ayaz" />
        </Field>
        <button className="btn-primary w-full mt-2" onClick={create}>
          Create trip
        </button>
      </Sheet>
    </Screen>
  )
}

function TripTotal({ tripId, code }: { tripId: string; code: string }) {
  const t = useTrip(tripId)
  if (!t) return null
  return (
    <span className="tnum text-[15px] font-semibold shrink-0">
      {formatCompact(t.summary.totalSpentBaseMinor, code)}
    </span>
  )
}
