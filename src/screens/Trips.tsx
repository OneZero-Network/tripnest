import { Download, MapPin, Plus, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { downloadJSON, exportEverything, importBundle } from '../db/db'
import { useTrip, useTrips } from '../db/useTrip'
import { formatCompact } from '../core/money'
import { Empty, Screen, Section, TopBar } from '../ui/kit'
import { TripWizard } from './TripWizard'

export default function Trips() {
  const trips = useTrips()
  const nav = useNavigate()
  const [wizardOpen, setWizardOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

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
            icon={<MapPin size={20} />}
            title="No trips yet"
            hint="Create a trip before you leave, add expenses as they happen, and settle up when you get back. Everything stays on this phone — no account needed."
            cta="Create your first trip"
            onCta={() => setWizardOpen(true)}
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
        onClick={() => setWizardOpen(true)}
        aria-label="Create a trip"
        className="fixed right-5 z-40 bg-ink text-white rounded-full w-14 h-14
                   flex items-center justify-center shadow-lift active:scale-95 transition"
        style={{ bottom: 'calc(var(--safe-bottom) + 24px)' }}
      >
        <Plus size={26} />
      </button>

      <TripWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onCreated={(tripId) => {
          setWizardOpen(false)
          nav(`/trip/${tripId}`)
        }}
      />
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
