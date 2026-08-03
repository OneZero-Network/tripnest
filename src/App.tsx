import { Activity as ActivityIcon, Home as HomeIcon, Plus, Scale, Users, Wallet } from 'lucide-react'
import { useRef, useState } from 'react'
import { HashRouter, NavLink, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { AndroidBack } from './AndroidBack'
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

/** Bottom-nav order, for swiping. Money isn't a swipe stop — it isn't a tab
 * in the bar either, reached from Home instead (see comment below). */
const SWIPE_ORDER: Tab[] = ['home', 'activity', 'people', 'settle']

/**
 * Swipe left/right between tabs, the way Instagram/WhatsApp let you swipe
 * between top tabs instead of only tapping them.
 *
 * Deliberately conservative: a real horizontal swipe (60px+, more
 * horizontal movement than vertical) is required before it fires, so it
 * doesn't fight with vertical scrolling or with horizontal-scrolling chip
 * rows elsewhere on the same screen (category chips, the member avatar
 * strip) — those still work exactly as they did.
 */
function useSwipeTabs(tab: Tab, id: string | undefined) {
  const nav = useNavigate()
  const start = useRef<{ x: number; y: number } | null>(null)

  function path(t: Tab) {
    return t === 'home' ? `/trip/${id}` : `/trip/${id}/${t}`
  }

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0]
    start.current = { x: t.clientX, y: t.clientY }
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (!start.current) return
    const t = e.changedTouches[0]
    const dx = t.clientX - start.current.x
    const dy = t.clientY - start.current.y
    start.current = null

    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return
    const i = SWIPE_ORDER.indexOf(tab)
    if (i === -1) return
    const next = dx < 0 ? i + 1 : i - 1
    if (next < 0 || next >= SWIPE_ORDER.length) return
    nav(path(SWIPE_ORDER[next]))
  }

  return { onTouchStart, onTouchEnd }
}

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
  const swipe = useSwipeTabs(tab, id)

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

      <div onTouchStart={swipe.onTouchStart} onTouchEnd={swipe.onTouchEnd}>
        {tab === 'home' && <Home t={t} onAdd={() => setAdding(true)} />}
        {tab === 'activity' && <Activity t={t} />}
        {tab === 'people' && <People t={t} />}
        {tab === 'money' && <Money t={t} />}
        {tab === 'settle' && <Settle t={t} />}
      </div>

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
    </HashRouter>
  )
}

export { Wallet }
