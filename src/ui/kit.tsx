import { ChevronLeft, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { pushBack, popBack } from './backstack'

export function Screen({ children }: { children: ReactNode }) {
  return (
    <div
      className="min-h-full pb-28"
      style={{ paddingTop: 'calc(var(--safe-top) + 8px)' }}
    >
      {children}
    </div>
  )
}

/** One screen answers one question. The title is that question, plainly stated. */
export function TopBar({
  title,
  subtitle,
  back,
  backTo,
  right,
}: {
  title: string
  subtitle?: string
  back?: boolean
  /** Explicit destination for the back arrow. Defaults to router history
   * (nav(-1)) when omitted — pass this when 'back' means 'up a level'
   * rather than 'previous screen', e.g. a trip's Home tab going to Trips. */
  backTo?: string
  right?: ReactNode
}) {
  const nav = useNavigate()
  return (
    <header className="px-5 pt-2 pb-4 flex items-start gap-3">
      {back && (
        <button
          onClick={() => (backTo ? nav(backTo) : nav(-1))}
          aria-label="Go back"
          className="mt-1 -ml-2 p-2 rounded-full active:bg-surface-line"
        >
          <ChevronLeft size={22} />
        </button>
      )}
      <div className="flex-1 min-w-0">
        <h1 className="text-[21px] leading-tight font-semibold tracking-[-0.01em] truncate">
          {title}
        </h1>
        {subtitle && <p className="text-[14px] text-ink-mute mt-0.5 truncate">{subtitle}</p>}
      </div>
      {right}
    </header>
  )
}

export function Section({
  title,
  action,
  children,
}: {
  title?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="px-5 mt-6">
      {(title || action) && (
        <div className="flex items-center justify-between mb-2.5 px-1">
          {title && <h2 className="label">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

/**
 * Guided empty state. An empty state's job is not to report emptiness — it's
 * to explain when the feature matters, why you'd use it, and whether it's
 * optional, then offer the one action that resolves it.
 */
export function Empty({
  icon, title, hint, optional, cta, onCta, tone = 'brand',
}: {
  icon?: ReactNode
  title: string
  hint: string
  optional?: boolean
  cta?: string
  onCta?: () => void
  tone?: 'brand' | 'accent'
}) {
  return (
    <div className="card p-6">
      <div className="flex gap-4">
        {icon && (
          <span
            className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
              tone === 'accent' ? 'bg-accent-wash text-accent' : 'bg-brand-wash text-brand-deep'
            }`}
          >
            {icon}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-[16px] tracking-[-0.01em]">{title}</p>
          <p className="text-[13.5px] text-ink-mute mt-1.5 leading-relaxed">{hint}</p>
          {optional && (
            <p className="text-[12px] text-ink-mute mt-2 italic">This is optional — many trips never need it.</p>
          )}
          {cta && (
            <button
              onClick={onCta}
              className={`mt-4 rounded-xl px-4 py-2.5 text-[14px] font-semibold text-white active:scale-[0.98] transition ${
                tone === 'accent' ? 'bg-accent' : 'bg-brand-deep'
              }`}
            >
              {cta}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

const AVATAR_TONES = [
  'bg-[#DCFCE7] text-[#047857]', 'bg-[#DBEAFE] text-[#1D4ED8]',
  'bg-[#FEF3C7] text-[#B45309]', 'bg-[#FCE7F3] text-[#BE185D]',
  'bg-[#EDE9FE] text-[#6D28D9]', 'bg-[#CCFBF1] text-[#0F766E]',
]

/** Deterministic initials avatar — people should be recognisable at a glance. */
export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?'
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  const tone = AVATAR_TONES[h % AVATAR_TONES.length]
  return (
    <span
      className={`rounded-full flex items-center justify-center font-semibold shrink-0 ${tone}`}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {initials}
    </span>
  )
}

/** A labelled figure in a reconciliation list. Supporting detail, not a headline. */
export function Stat({
  label, value, tone, strong,
}: { label: string; value: string; tone?: 'pos' | 'neg' | 'mute'; strong?: boolean }) {
  return (
    <div className="flex justify-between items-baseline py-2">
      <span className="text-[13.5px] text-ink-soft">{label}</span>
      <span
        className={`tnum text-[14.5px] ${strong ? 'font-semibold' : 'font-medium'} ${
          tone === 'pos' ? 'text-signal-pos' : tone === 'neg' ? 'text-signal-neg' : tone === 'mute' ? 'text-ink-mute' : ''
        }`}
      >
        {value}
      </span>
    </div>
  )
}

/** Bottom sheet. Progressive disclosure lives here: default fields only. */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    document.body.style.overflow = 'hidden'
    pushBack(onClose)
    return () => {
      window.removeEventListener('keydown', h)
      document.body.style.overflow = ''
      popBack(onClose)
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-ink/25 backdrop-blur-[2px]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full max-w-lg bg-surface rounded-t-[28px] shadow-lift
                   max-h-[92vh] overflow-y-auto animate-[slideUp_.22s_cubic-bezier(.32,.72,0,1)]"
        style={{ paddingBottom: 'calc(var(--safe-bottom) + 20px)' }}
      >
        <div className="sticky top-0 bg-surface/95 backdrop-blur px-5 pt-4 pb-3 flex items-center gap-3 rounded-t-[28px]">
          <h2 className="flex-1 text-[19px] font-semibold tracking-[-0.01em]">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="p-2 -mr-2 rounded-full active:bg-surface-line">
            <X size={20} />
          </button>
        </div>
        <div className="px-5 pt-1">{children}</div>
      </div>
      <style>{`@keyframes slideUp{from{transform:translateY(16px);opacity:.6}to{transform:none;opacity:1}}`}</style>
    </div>
  )
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string
  children: ReactNode
  hint?: string
}) {
  return (
    <label className="block mb-4">
      <span className="label block mb-1.5 ml-1">{label}</span>
      {children}
      {hint && <span className="block text-[12px] text-ink-mute mt-1.5 ml-1">{hint}</span>}
    </label>
  )
}

/** Reveals extra fields only when asked for. */
export function More({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="mb-4 group">
      <summary className="cursor-pointer list-none label py-2 ml-1 select-none">
        {label}
        <span className="ml-1 inline-block group-open:rotate-90 transition-transform">›</span>
      </summary>
      <div className="pt-2">{children}</div>
    </details>
  )
}

export function Toast({ text, action, onAction }: { text: string; action?: string; onAction?: () => void }) {
  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-[60] bg-ink text-white rounded-2xl
                 px-4 py-3 flex items-center gap-4 shadow-lift text-[14px] max-w-[92vw]"
      style={{ bottom: 'calc(var(--safe-bottom) + 96px)' }}
      role="status"
    >
      <span className="truncate">{text}</span>
      {action && (
        <button onClick={onAction} className="font-semibold underline underline-offset-2 shrink-0">
          {action}
        </button>
      )}
    </div>
  )
}
