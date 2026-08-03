import { Home, Plus, Receipt, Wallet, Scale } from 'lucide-react'
import { HashRouter, NavLink, Navigate, Route, Routes, useParams } from 'react-router-dom'
import { useState } from 'react'
import Trips from './screens/Trips'
import Dashboard from './screens/Dashboard'
import { AddExpense } from './screens/Expenses'
import Activity from './screens/Activity'
import Money from './screens/Money'
import Settle from './screens/Settle'
import { useTrip } from './db/useTrip'
import { Screen, TopBar } from './ui/kit'

/**
 * One workspace per trip. Every new capability becomes a tab or a section
 * inside this shell — never a separate app.
 */
function TripWorkspace({ tab }: { tab: 'dashboard' | 'activity' | 'money' | 'settle' }) {
  const { id } = useParams()
  const t = useTrip(id)
  const [adding, setAdding] = useState(false)

  if (t === undefined) return <Screen><TopBar title="Loading" back /></Screen>
  if (t === null) return <Screen><TopBar title="Trip not found" back /></Screen>

  const titles = {
    dashboard: t.trip.name,
    activity: 'Activity',
    money: 'Money',
    settle: 'Settling up',
  } as const

  const subtitles = {
    dashboard: t.trip.destination || t.trip.startDate,
    activity: `${t.activity.length} events`,
    money: 'Members, the fund, and foreign cash',
    settle: 'Suggested transfers only',
  } as const

  return (
    <Screen>
      <TopBar title={titles[tab]} subtitle={subtitles[tab]} back />
      {tab === 'dashboard' && <Dashboard t={t} />}
      {tab === 'activity' && <Activity t={t} />}
      {tab === 'money' && <Money t={t} />}
      {tab === 'settle' && <Settle t={t} />}

      <AddExpense t={t} open={adding} onClose={() => setAdding(false)} />

      <nav
        className="fixed bottom-0 inset-x-0 z-40 bg-surface/92 backdrop-blur-xl border-t border-surface-line"
        style={{ paddingBottom: 'var(--safe-bottom)' }}
      >
        <div className="max-w-lg mx-auto flex items-center justify-around px-2 py-2">
          <Tab to={`/trip/${id}`} icon={<Home size={20} />} label="Trip" end />
          <Tab to={`/trip/${id}/activity`} icon={<Receipt size={20} />} label="Activity" />
          <button
            onClick={() => setAdding(true)}
            aria-label="Add expense"
            className="bg-ink text-white rounded-2xl w-12 h-12 flex items-center justify-center
                       shadow-lift active:scale-95 transition -mt-1"
          >
            <Plus size={24} />
          </button>
          <Tab to={`/trip/${id}/money`} icon={<Wallet size={20} />} label="Money" />
          <Tab to={`/trip/${id}/settle`} icon={<Scale size={20} />} label="Settle" />
        </div>
      </nav>
    </Screen>
  )
}

function Tab({ to, icon, label, end }: { to: string; icon: React.ReactNode; label: string; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition ${
          isActive ? 'text-ink' : 'text-ink-mute'
        }`
      }
    >
      {icon}
      <span className="text-[10px] font-medium tracking-[0.01em]">{label}</span>
    </NavLink>
  )
}

export default function App() {
  return (
    <HashRouter>
      <div className="max-w-lg mx-auto min-h-full bg-surface-sunk">
        <Routes>
          <Route path="/" element={<Trips />} />
          <Route path="/trip/:id" element={<TripWorkspace tab="dashboard" />} />
          <Route path="/trip/:id/activity" element={<TripWorkspace tab="activity" />} />
          <Route path="/trip/:id/money" element={<TripWorkspace tab="money" />} />
          <Route path="/trip/:id/settle" element={<TripWorkspace tab="settle" />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </HashRouter>
  )
}
