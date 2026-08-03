import { ChevronLeft, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

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
  right,
}: {
  title: string
  subtitle?: string
  back?: boolean
  right?: ReactNode
}) {
  const nav = useNavigate()
  return (
    <header className="px-5 pt-2 pb-4 flex items-start gap-3">
      {back && (
        <button
          onClick={() => nav(-1)}
          aria-label="Go back"
          className="mt-1 -ml-2 p-2 rounded-full active:bg-surface-line"
        >
          <ChevronLeft size={22} />
        </button>
      )}
      <div className="flex-1 min-w-0">
        <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.02em] truncate">
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

export function Empty({ title, hint, action }: { title: string; hint: string; action?: ReactNode }) {
  return (
    <div className="card p-7 text-center">
      <p className="font-semibold text-[16px]">{title}</p>
      <p className="text-[14px] text-ink-mute mt-1.5 leading-relaxed">{hint}</p>
      {action && <div className="mt-5">{action}</div>}
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
    return () => {
      window.removeEventListener('keydown', h)
      document.body.style.overflow = ''
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
