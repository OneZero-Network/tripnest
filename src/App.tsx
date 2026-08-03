import { Activity as ActivityIcon, Home as HomeIcon, Plus, Scale, Users, Wallet } from 'lucide-react'
import { useState } from 'react'
import { HashRouter, NavLink, Navigate, Route, Routes, useParams } from 'react-router-dom'
import { AndroidBack } from './AndroidBack'

/**
 * Whole-app visual scale.
 *
 * Round 1 used CSS `zoom` at 0.75 (25% smaller). Two problems came back:
 * it felt too small, and it rendered a different size on different phones.
 * Both point at the same root cause — `zoom` is a non-standard Blink
 * property, and different OEM WebView forks (Samsung Internet's engine,
 * MIUI's, stock AOSP) don't all implement it the same way. It was never a
 * reliable lever.
 *
 * `transform: scale()` is different: it's plain CSS, guaranteed by spec to
 * render identically everywhere Chromium runs, and — critically — a
 * transformed ancestor becomes the containing block for any `position:
 * fixed` descendant (also spec, not a browser quirk). That's what makes the
 * bottom nav bar scale and reposition correctly along with everything else,
 * the same behavior `zoom` gave us but through a mechanism every device
 * actually agrees on.
 *
 * Tune only this constant.
 */
const APP_SCALE = 0.9
import Trips from './screens/Trips'
import Home from './screens/Home'
import Activity from './screens/Activity'
import People from './screens/People'
import Money from './screens/Money'
import Settle from './screens/Settle'
import { AddExpense } from './screens/Expenses'
import { useTrip } from './db/useTrip'
import { Screen, TopBar } from './ui/kit'

type Tab = 'home' | 'activity' | 'people' | 'money' | 'settle'

/**
 * Navigation named after the journey, not the schema.
 *
 * Home / Activity / People / Money / Settle each answer exactly one question:
 * what's happening · what have we spent · who's travelling · where is the
 * money · what should happen next. Money isn't in the tab bar — five tabs
 * plus a centre action is already the ceiling for thumb reach, and Money is
 * reached from Home, which is where people look for it.
 */
function TripWorkspace({ tab }: { tab: Tab }) {
  const { id } = useParams()
  const t = useTrip(id)
  const [adding, setAdding] = useState(false)

  if (t === undefined) return <Screen><TopBar title="Loading" back /></Screen>
  if (t === null) return <Screen><TopBar title="Trip not found" back /></Screen>

  const heads: Record<Tab, { title: string; subtitle: string }> = {
    home: { title: t.trip.name, subtitle: t.trip.destination || t.trip.startDate },
    activity: { title: 'Activity', subtitle: 'Everything that happened, newest first' },
    people: { title: 'People', subtitle: "Who's travelling and where they stand" },
    money: { title: 'Money', subtitle: 'Your trip fund and foreign cash' },
    settle: { title: 'Settle up', subtitle: 'Suggested transfers only' },
  }

  return (
    <Screen>
      <TopBar title={heads[tab].title} subtitle={heads[tab].subtitle} back backTo={tab === 'home' ? '/' : undefined} />

      {tab === 'home' && <Home t={t} onAdd={() => setAdding(true)} />}
      {tab === 'activity' && <Activity t={t} />}
      {tab === 'people' && <People t={t} />}
      {tab === 'money' && <Money t={t} />}
      {tab === 'settle' && <Settle t={t} />}

      <AddExpense t={t} open={adding} onClose={() => setAdding(false)} />

      <nav
        className="fixed bottom-0 inset-x-0 z-40 bg-surface/93 backdrop-blur-xl border-t border-surface-line"
        style={{ paddingBottom: 'var(--safe-bottom)' }}
      >
        <div className="max-w-lg mx-auto flex items-center justify-around px-2 py-1.5">
          <TabLink to={`/trip/${id}`} icon={<HomeIcon size={20} />} label="Home" end />
          <TabLink to={`/trip/${id}/activity`} icon={<ActivityIcon size={20} />} label="Activity" />
          <button
            onClick={() => setAdding(true)}
            aria-label="Add expense"
            className="bg-ink text-white rounded-full w-12 h-12 flex items-center justify-center
                       shadow-lift active:scale-95 transition shrink-0"
          >
            <Plus size={24} />
          </button>
          <TabLink to={`/trip/${id}/people`} icon={<Users size={20} />} label="People" />
          <TabLink to={`/trip/${id}/settle`} icon={<Scale size={20} />} label="Settle" />
        </div>
      </nav>
    </Screen>
  )
}

function TabLink({
  to, icon, label, end,
}: { to: string; icon: React.ReactNode; label: string; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition ${
          isActive ? 'text-brand-deep' : 'text-ink-mute'
        }`
      }
    >
      {icon}
      <span className="text-[10px] font-semibold tracking-[0.01em]">{label}</span>
    </NavLink>
  )
}

export default function App() {
  return (
    <HashRouter>
      <AndroidBack />
      {/* Outer: pinned to the real viewport, and the ONLY thing that scrolls.
          Inner: the actual app, rendered at 1/APP_SCALE size then visually
          scaled down — so its layout math is unaffected, only its rendered
          pixels are smaller. */}
      <div style={{ position: 'fixed', inset: 0, overflowY: 'auto', overscrollBehaviorY: 'none' }}>
        <div
          style={{
            transform: `scale(${APP_SCALE})`,
            transformOrigin: 'top left',
            width: `${100 / APP_SCALE}%`,
            minHeight: `${100 / APP_SCALE}%`,
          }}
        >
          <div className="max-w-lg mx-auto min-h-full bg-surface-sunk">
            <Routes>
              <Route path="/" element={<Trips />} />
              <Route path="/trip/:id" element={<TripWorkspace tab="home" />} />
              <Route path="/trip/:id/activity" element={<TripWorkspace tab="activity" />} />
              <Route path="/trip/:id/people" element={<TripWorkspace tab="people" />} />
              <Route path="/trip/:id/money" element={<TripWorkspace tab="money" />} />
              <Route path="/trip/:id/settle" element={<TripWorkspace tab="settle" />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </div>
      </div>
    </HashRouter>
  )
}

export { Wallet }
