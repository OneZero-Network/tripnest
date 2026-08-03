import { App as CapApp } from '@capacitor/app'
import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { closeTopSheet } from './ui/backstack'

/**
 * Without this, Android's hardware/gesture back button does the platform
 * default: exit straight from wherever you are. That's what "back exits
 * the app" reports were describing — not a routing bug, a missing listener.
 *
 * Precedence, closest thing to the person first:
 *   1. An open sheet (add expense, trip wizard, add member/contribution) —
 *      close it. This is the common case and the one people actually meant.
 *   2. Anywhere but the Trips list — go back one screen in the app.
 *   3. The Trips list itself — minimize, don't kill the process. Exiting
 *      outright is jarring and non-standard; every other Android app treats
 *      "back" at the root as backgrounding, not quitting.
 */
export function AndroidBack() {
  const nav = useNavigate()
  const location = useLocation()

  useEffect(() => {
    const sub = CapApp.addListener('backButton', () => {
      if (closeTopSheet()) return
      if (location.pathname !== '/') {
        nav(-1)
        return
      }
      CapApp.minimizeApp().catch(() => {
        // Not implemented outside a native Android runtime (e.g. `vite dev`
        // in a browser) — there's nothing to minimize there, so ignore.
      })
    })
    return () => {
      sub.then((s) => s.remove())
    }
  }, [nav, location.pathname])

  return null
}
