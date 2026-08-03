/**
 * Integer money. No floats, ever, in stored values.
 */

const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'VND', 'IDR', 'CLP', 'ISK'])
const THREE_DECIMAL = new Set(['BHD', 'KWD', 'OMR', 'TND', 'JOD'])

export function minorUnits(code: string): number {
  const c = code.toUpperCase()
  if (ZERO_DECIMAL.has(c)) return 0
  if (THREE_DECIMAL.has(c)) return 3
  return 2
}

export function scale(code: string): number {
  return Math.pow(10, minorUnits(code))
}

/** "1,234.50" | 1234.5 -> 123450 (for INR). Throws on garbage. */
export function toMinor(input: string | number, code: string): number {
  const s = typeof input === 'number' ? String(input) : input.trim().replace(/[,\s]/g, '')
  if (s === '' || !/^-?\d*(\.\d*)?$/.test(s)) throw new Error(`Not a number: ${input}`)
  const neg = s.startsWith('-')
  const [whole, frac = ''] = s.replace('-', '').split('.')
  const d = minorUnits(code)
  const fracPadded = (frac + '0'.repeat(d)).slice(0, d)
  const rounded = frac.length > d && Number(frac[d]) >= 5 ? 1 : 0
  const value = Number(whole || '0') * scale(code) + Number(fracPadded || '0') + rounded
  return neg ? -value : value
}

export function fromMinor(amountMinor: number, code: string): number {
  return amountMinor / scale(code)
}

const SYMBOLS: Record<string, string> = {
  INR: '₹', USD: '$', EUR: '€', GBP: '£', JPY: '¥', AED: 'AED ', SAR: 'SAR ',
  THB: '฿', SGD: 'S$', AUD: 'A$', CAD: 'C$', MYR: 'RM', LKR: 'Rs ', NPR: 'Rs ',
}

export function symbolFor(code: string): string {
  return SYMBOLS[code.toUpperCase()] ?? `${code.toUpperCase()} `
}

export function formatMoney(amountMinor: number, code: string, opts?: { sign?: boolean }): string {
  const d = minorUnits(code)
  const neg = amountMinor < 0
  const abs = Math.abs(amountMinor)
  const body = (abs / scale(code)).toLocaleString(undefined, {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  })
  const sign = neg ? '−' : opts?.sign ? '+' : ''
  return `${sign}${symbolFor(code)}${body}`
}

/** Compact form for dashboard tiles: ₹23.5k, ₹1.2L */
export function formatCompact(amountMinor: number, code: string): string {
  const v = Math.abs(fromMinor(amountMinor, code))
  const sign = amountMinor < 0 ? '−' : ''
  const sym = symbolFor(code)
  if (code.toUpperCase() === 'INR') {
    if (v >= 1e7) return `${sign}${sym}${(v / 1e7).toFixed(2)}Cr`
    if (v >= 1e5) return `${sign}${sym}${(v / 1e5).toFixed(2)}L`
    if (v >= 1e3) return `${sign}${sym}${(v / 1e3).toFixed(1)}k`
  } else if (v >= 1e6) return `${sign}${sym}${(v / 1e6).toFixed(2)}M`
  else if (v >= 1e3) return `${sign}${sym}${(v / 1e3).toFixed(1)}k`
  return formatMoney(amountMinor, code)
}

/**
 * Split `total` across `n` deterministic keys with no lost paise.
 * Largest-remainder method: the sum of the result ALWAYS equals `total`.
 */
export function splitEvenly(total: number, keys: string[]): Record<string, number> {
  const out: Record<string, number> = {}
  const n = keys.length
  if (n === 0) return out
  const sorted = [...keys].sort()
  const base = Math.trunc(total / n)
  let remainder = total - base * n
  const step = remainder >= 0 ? 1 : -1
  remainder = Math.abs(remainder)
  for (let i = 0; i < n; i++) {
    out[sorted[i]] = base + (i < remainder ? step : 0)
  }
  return out
}

/**
 * Split `total` proportionally to positive weights, remainder-safe.
 * Sum of result ALWAYS equals `total`.
 */
export function splitByWeights(total: number, weights: Record<string, number>): Record<string, number> {
  const keys = Object.keys(weights).filter((k) => weights[k] > 0).sort()
  if (keys.length === 0) return {}
  const totalWeight = keys.reduce((s, k) => s + weights[k], 0)
  if (totalWeight <= 0) return splitEvenly(total, keys)

  const out: Record<string, number> = {}
  const remainders: { key: string; frac: number }[] = []
  let allocated = 0
  for (const k of keys) {
    const exact = (total * weights[k]) / totalWeight
    const floor = Math.trunc(exact)
    out[k] = floor
    allocated += floor
    remainders.push({ key: k, frac: exact - floor })
  }
  let left = total - allocated
  const step = left >= 0 ? 1 : -1
  left = Math.abs(left)
  remainders.sort((a, b) => b.frac - a.frac || a.key.localeCompare(b.key))
  for (let i = 0; i < left; i++) out[remainders[i % remainders.length].key] += step
  return out
}
