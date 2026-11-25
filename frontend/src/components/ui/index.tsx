import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'
import clsx from 'clsx'
import type { Tone } from '../../domain/labels'

const TONES: Record<Tone, string> = {
  slate: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  blue: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  green: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  amber: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  red: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  violet: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
}

export function Badge({ tone = 'slate', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium', TONES[tone], className)}>
      {children}
    </span>
  )
}

export function Modal({
  open, onClose, title, children, footer, wide, xl,
}: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean; xl?: boolean }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className={clsx('relative flex max-h-[90vh] w-full flex-col rounded-xl border bg-white shadow-xl dark:bg-slate-900', xl ? 'max-w-6xl' : wide ? 'max-w-3xl' : 'max-w-lg')}
      >
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h3 className="text-base font-semibold">{title}</h3>
          <button className="btn-ghost !p-1" onClick={onClose} aria-label="Закрыть"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t px-5 py-3">{footer}</div>}
      </div>
    </div>
  )
}

export function ProgressBar({ value, tone = 'blue', className }: { value: number; tone?: 'blue' | 'green' | 'amber' | 'red'; className?: string }) {
  const colors = { blue: 'bg-brand-500', green: 'bg-emerald-500', amber: 'bg-amber-500', red: 'bg-red-500' }
  return (
    <div className={clsx('h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800', className)}>
      <div className={clsx('h-full rounded-full transition-all', colors[tone])} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="label">{label}</label>
      {children}
    </div>
  )
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-12 text-center">
      <p className="font-medium">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-sm text-slate-500">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Tabs<T extends string>({
  tabs, value, onChange,
}: { tabs: { key: T; label: string; badge?: number }[]; value: T; onChange: (k: T) => void }) {
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto border-b">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={clsx(
            '-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition',
            value === t.key
              ? 'border-brand-600 text-brand-700 dark:border-brand-400 dark:text-brand-300'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200',
          )}
        >
          {t.label}
          {t.badge ? <span className="rounded-full bg-red-100 px-1.5 text-[10px] font-semibold text-red-700 dark:bg-red-500/20 dark:text-red-300">{t.badge}</span> : null}
        </button>
      ))}
    </div>
  )
}

export function StatCard({
  label, value, sub, icon, tone = 'blue', onClick,
}: { label: string; value: string; sub?: string; icon: ReactNode; tone?: 'blue' | 'green' | 'amber' | 'red' | 'violet'; onClick?: () => void }) {
  const t: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300',
    green: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300',
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300',
    red: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300',
    violet: 'bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300',
  }
  return (
    <button onClick={onClick} className="card group flex w-full items-start gap-3 p-4 text-left transition hover:border-brand-400 hover:shadow-md">
      <div className={clsx('rounded-lg p-2', t[tone])}>{icon}</div>
      <div className="min-w-0">
        <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</div>
        <div className="mt-0.5 truncate text-xl font-semibold tracking-tight">{value}</div>
        {sub && <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{sub}</div>}
      </div>
    </button>
  )
}

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse">{children}</table>
    </div>
  )
}
