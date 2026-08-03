/**
 * Backstack for anything that isn't a route: bottom sheets, the trip
 * wizard, add-expense, etc. They're all local `useState` booleans, not
 * router entries, so the hardware back button has nothing to "go back" to
 * and Capacitor's default behavior is to exit the app straight from an open
 * sheet. This file exists so a sheet can register "I'm open, here's how to
 * close me" and the one global back-button listener (see AndroidBack.tsx)
 * can pop it before ever touching navigation or the app lifecycle.
 */

type CloseFn = () => void

const stack: CloseFn[] = []

export function pushBack(fn: CloseFn) {
  stack.push(fn)
}

export function popBack(fn: CloseFn) {
  const i = stack.lastIndexOf(fn)
  if (i !== -1) stack.splice(i, 1)
}

/** Closes the topmost open sheet, if any. Returns whether it did. */
export function closeTopSheet(): boolean {
  const top = stack[stack.length - 1]
  if (!top) return false
  top()
  return true
}
