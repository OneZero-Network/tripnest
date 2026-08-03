import {
  ArrowRightLeft, Banknote, CheckCircle2, Coins, HandCoins, MapPin, Receipt, RotateCcw, Search, Trash2,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { ActivityEvent } from '../core/activity'
import { formatMoney } from '../core/money'
import { softDelete, undoDelete } from '../db/db'
import type { TripView } from '../db/useTrip'
import { Empty, Section, Toast } from '../ui/kit'

/**
 * Every module's events, merged and sorted — the GitHub-commits-list pattern.
 * This is the read surface; `route` on each event says which tab manages it.
 * Per-kind detail screens (open a single expense / settlement / contribution
 * in isolation) don't exist yet for ANY kind today, so tapping here jumps to
 * the owning tab rather than a dedicated detail view. Building those is real,
 * separate work — not a side effect of this feed existing.
 */
const ICONS: Record<ActivityEvent['kind'], typeof Receipt> = {
  trip_created: MapPin,
  contribution: HandCoins,
  purchase: Coins,
  expense: Receipt,
  refund: RotateCcw,
  reimbursement: Banknote,
  settlement: ArrowRightLeft,
  trip_closed: CheckCircle2,
}

/** Table + soft-delete key per kind, so one row can undo regardless of source. */
/**
 * The frozen activity registry emits route names from the pre-redesign
 * navigation ('expenses'). Rather than edit a frozen core file for a naming
 * change, the mapping to current paths lives here in the UI layer, which is
 * where navigation belongs anyway.
 */
const ROUTE_PATH: Record<string, string> = {
  expenses: 'activity',
  money: 'money',
  settle: 'settle',
}

const DELETE_TABLE: Partial<Record<ActivityEvent['kind'], 'expenses' | 'contributions' | 'purchases' | 'reimbursements' | 'settlementRecords'>> = {
  expense: 'expenses',
  refund: 'expenses',
  contribution: 'contributions',
  purchase: 'purchases',
  reimbursement: 'reimbursements',
  settlement: 'settlementRecords',
}

export default function Activity({ t }: { t: TripView }) {
  const { id } = useParams()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [undo, setUndo] = useState<{ kind: ActivityEvent['kind']; id: string } | null>(null)
  const code = t.trip.baseCurrency

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return t.activity
    return t.activity.filter(
      (e) => e.title.toLowerCase().includes(needle) || e.detail.toLowerCase().includes(needle),
    )
  }, [t.activity, q])

  const groups = useMemo(() => {
    const out: { label: string; rows: ActivityEvent[] }[] = []
    const fmt = (ts: number) => {
      const d = new Date(ts)
      const today = new Date()
      const yesterday = new Date(Date.now() - 86_400_000)
      const same = (a: Date, b: Date) => a.toDateString() === b.toDateString()
      if (same(d, today)) return 'Today'
      if (same(d, yesterday)) return 'Yesterday'
      return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
    }
    for (const r of rows) {
      const label = fmt(r.at)
      const g = out.find((x) => x.label === label)
      if (g) g.rows.push(r)
      else out.push({ label, rows: [r] })
    }
    return out
  }, [rows])

  async function remove(e: ActivityEvent) {
    const table = DELETE_TABLE[e.kind]
    if (!table) return
    await softDelete(table, e.id)
    setUndo({ kind: e.kind, id: e.id })
    setTimeout(() => setUndo((c) => (c?.id === e.id ? null : c)), 6000)
  }

  return (
    <>
      <Section>
        <div className="card flex items-center gap-2.5 px-4 py-3">
          <Search size={17} className="text-ink-mute shrink-0" />
          <input
            value={q}
            onChange={(ev) => setQ(ev.target.value)}
            placeholder="Search activity"
            className="flex-1 bg-transparent outline-none text-[15px]"
          />
        </div>
      </Section>

      {groups.length === 0 ? (
        <Section>
          <Empty
            icon={<Receipt size={20} />}
            title={q ? 'Nothing matches' : 'No activity yet'}
            hint={
              q
                ? 'Try a different word — this searches titles, categories, and notes.'
                : 'Every expense, contribution, currency purchase, and settlement shows up here as it happens. Tap + to record your first one.'
            }
          />
        </Section>
      ) : (
        groups.map((g) => (
          <Section key={g.label} title={g.label}>
            <ul className="card divide-y divide-surface-line/70 overflow-hidden">
              {g.rows.map((e) => {
                const Icon = ICONS[e.kind]
                const canDelete = !!DELETE_TABLE[e.kind]
                return (
                  <li key={`${e.kind}-${e.id}`} className="flex items-center gap-3 px-5 py-4">
                    <button
                      onClick={() => nav(`/trip/${id}/${ROUTE_PATH[e.route] ?? 'activity'}`)}
                      className="flex items-center gap-3 flex-1 min-w-0 text-left row-press"
                    >
                      <span className="w-9 h-9 rounded-full bg-surface-sunk flex items-center justify-center shrink-0 text-ink-soft">
                        <Icon size={16} />
                      </span>
                      <span className="min-w-0">
                        <p className="font-medium text-[15px] truncate">{e.title}</p>
                        <p
                          className={`text-[12px] mt-0.5 truncate ${
                            e.kind === 'refund' && e.linkedTitle ? 'text-brand font-medium' : 'text-ink-mute'
                          }`}
                        >
                          {e.detail}
                        </p>
                      </span>
                    </button>
                    <span
                      className={`tnum font-semibold text-[14px] shrink-0 ${
                        e.amountMinor < 0 ? 'text-signal-neg' : e.amountMinor > 0 ? 'text-signal-pos' : 'text-ink-mute'
                      }`}
                    >
                      {formatMoney(e.amountMinor, code, { sign: true })}
                    </span>
                    {canDelete && (
                      <button
                        aria-label={`Delete ${e.title}`}
                        onClick={() => remove(e)}
                        className="p-2 -mr-2 text-ink-mute active:text-signal-neg"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          </Section>
        ))
      )}

      {undo && (
        <Toast
          text="Deleted"
          action="Undo"
          onAction={async () => {
            const table = DELETE_TABLE[undo.kind]
            if (table) await undoDelete(table, undo.id)
            setUndo(null)
          }}
        />
      )}
    </>
  )
}
