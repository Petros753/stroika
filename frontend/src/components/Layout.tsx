import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Building2, Ruler, Calculator, ShoppingCart, Warehouse, FileCheck2, Bot, BookOpen, Users,
  ClipboardCheck, PiggyBank, Mail, Bell, Moon, Sun, Search, Menu, RotateCcw, ChevronDown, X,
} from 'lucide-react'
import clsx from 'clsx'
import { useCurrentUser, useStore } from '../store'
import { SECTION_ACCESS, SECTION_LABEL, SECTION_PATH, canSee } from '../domain/permissions'
import { ROLE_LABEL } from '../domain/labels'
import type { SectionKey } from '../domain/types'
import { formatDate } from '../lib/date'
import { Confirm } from './Confirm'
import { toast } from './Toast'
import { visibleProjects } from '../domain/calc'

const ICONS: Record<SectionKey, typeof LayoutDashboard> = {
  dashboard: LayoutDashboard, projects: Building2, cad: Ruler, estimates: Calculator, execution: ClipboardCheck, costing: PiggyBank, mail: Mail, procurement: ShoppingCart,
  warehouse: Warehouse, pto: FileCheck2, assistant: Bot, knowledge: BookOpen, employees: Users,
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const user = useCurrentUser()
  const sections = SECTION_ACCESS[user.role]
  const pending = useStore((s) => s.requests.filter((r) => r.status === 'pending').length)
  const newMail = useStore((s) => s.letters.filter((l) => l.direction === 'in' && l.status === 'new').length)
  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r bg-white dark:bg-slate-900">
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
          <Building2 size={18} />
        </div>
        <div>
          <div className="text-sm font-bold leading-4">СтройAI</div>
          <div className="text-[10px] uppercase tracking-wider text-slate-400">ERP · демо</div>
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
        {sections.map((key) => {
          const Icon = ICONS[key]
          return (
            <NavLink
              key={key}
              to={SECTION_PATH[key]}
              end={key === 'dashboard'}
              onClick={onNavigate}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
                  isActive
                    ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
                )
              }
            >
              <Icon size={18} />
              <span className="flex-1">{SECTION_LABEL[key]}</span>
              {key === 'mail' && newMail > 0 && (
                <span className="rounded-full bg-red-100 px-1.5 text-[10px] font-semibold text-red-700 dark:bg-red-500/20 dark:text-red-300" data-testid="mail-badge">{newMail}</span>
              )}
              {key === 'procurement' && pending > 0 && (
                <span className="rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">{pending}</span>
              )}
            </NavLink>
          )
        })}
      </nav>
      <div className="border-t p-3 text-[11px] leading-4 text-slate-400">
        Демонстрационный прототип. Данные хранятся в браузере (localStorage).
      </div>
    </aside>
  )
}

function useClickOutside(ref: React.RefObject<HTMLElement>, onOut: () => void) {
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && onOut()
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [ref, onOut])
}

function GlobalSearch() {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const state = useStore()
  const user = useCurrentUser()
  useClickOutside(ref, () => setOpen(false))

  const results = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (t.length < 2) return []
    const out: { label: string; sub: string; to: string }[] = []
    const projects = visibleProjects(state, user)
    const ids = new Set(projects.map((p) => p.id))
    projects.filter((p) => `${p.name} ${p.address} ${p.customer}`.toLowerCase().includes(t)).forEach((p) =>
      out.push({ label: p.name, sub: 'Объект · ' + p.address, to: `/projects/${p.id}` }))
    if (canSee(user.role, 'procurement'))
      state.requests.filter((r) => ids.has(r.projectId) && r.number.toLowerCase().includes(t)).forEach((r) =>
        out.push({ label: `Заявка ${r.number}`, sub: 'Снабжение', to: '/procurement' }))
    if (canSee(user.role, 'warehouse'))
      state.materials.filter((m) => m.name.toLowerCase().includes(t)).forEach((m) =>
        out.push({ label: m.name, sub: 'Материал · склад', to: `/warehouse?q=${encodeURIComponent(m.name)}` }))
    state.documents.filter((d) => ids.has(d.projectId) && d.name.toLowerCase().includes(t)).forEach((d) =>
      out.push({ label: d.name, sub: 'Документ · ' + d.type, to: `/projects/${d.projectId}?tab=docs` }))
    return out.slice(0, 8)
  }, [q, state, user])

  return (
    <div ref={ref} className="relative hidden w-72 md:block lg:w-96">
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        className="input !pl-9"
        placeholder="Поиск по объектам, заявкам, материалам, документам…"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
      />
      {open && q.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-full z-40 mt-1 max-h-80 overflow-y-auto rounded-lg border bg-white shadow-lg dark:bg-slate-900">
          {results.length === 0 && <div className="px-3 py-3 text-sm text-slate-500">Ничего не найдено</div>}
          {results.map((r, i) => (
            <button
              key={i}
              className="block w-full px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
              onClick={() => { navigate(r.to); setOpen(false); setQ('') }}
            >
              <div className="text-sm font-medium">{r.label}</div>
              <div className="text-xs text-slate-500">{r.sub}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Notifications() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const user = useCurrentUser()
  const all = useStore((s) => s.notifications)
  const markRead = useStore((s) => s.markNotificationRead)
  const markAll = useStore((s) => s.markAllNotificationsRead)
  useClickOutside(ref, () => setOpen(false))
  const items = all.filter((n) => !n.roles || n.roles.includes(user.role))
  const unread = items.filter((n) => !n.read).length
  return (
    <div ref={ref} className="relative">
      <button className="btn-ghost relative !p-2" onClick={() => setOpen(!open)} aria-label="Уведомления">
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">{unread}</span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-1 w-80 rounded-lg border bg-white shadow-lg dark:bg-slate-900">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="text-sm font-semibold">Уведомления</span>
            <button className="text-xs text-brand-600 hover:underline" onClick={markAll}>Прочитать все</button>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 && <div className="px-3 py-4 text-sm text-slate-500">Нет уведомлений</div>}
            {items.map((n) => (
              <button
                key={n.id}
                className={clsx('block w-full border-b px-3 py-2 text-left last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800', !n.read && 'bg-brand-50/60 dark:bg-brand-500/5')}
                onClick={() => { markRead(n.id); setOpen(false); if (n.link) navigate(n.link) }}
              >
                <div className="text-sm">{n.text}</div>
                <div className="text-xs text-slate-400">{formatDate(n.date)}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function UserMenu() {
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const user = useCurrentUser()
  const users = useStore((s) => s.users)
  const setUser = useStore((s) => s.setCurrentUser)
  const reset = useStore((s) => s.resetDemo)
  const navigate = useNavigate()
  useClickOutside(ref, () => setOpen(false))
  return (
    <div ref={ref} className="relative">
      <button className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => setOpen(!open)}>
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white">
          {user.name.split(' ').slice(0, 2).map((x) => x[0]).join('')}
        </div>
        <div className="hidden text-left sm:block">
          <div className="text-sm font-medium leading-4">{user.name}</div>
          <div className="text-xs text-slate-500">{ROLE_LABEL[user.role]}</div>
        </div>
        <ChevronDown size={14} className="text-slate-400" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-1 w-72 rounded-lg border bg-white p-2 shadow-lg dark:bg-slate-900">
          <div className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Демо: переключение роли</div>
          <div className="max-h-72 overflow-y-auto">
            {users.map((u) => (
              <button
                key={u.id}
                onClick={() => {
                  setUser(u.id)
                  setOpen(false)
                  navigate('/')
                  toast.info(`Вы вошли как: ${ROLE_LABEL[u.role]}`)
                }}
                className={clsx('flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800', u.id === user.id && 'bg-brand-50 dark:bg-brand-500/10')}
              >
                <span className="text-sm">{u.name}</span>
                <span className="text-xs text-slate-500">{ROLE_LABEL[u.role]}</span>
              </button>
            ))}
          </div>
          <div className="mt-2 border-t pt-2">
            <button className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10" onClick={() => { setOpen(false); setConfirm(true) }}>
              <RotateCcw size={15} /> Сбросить демоданные
            </button>
          </div>
        </div>
      )}
      <Confirm
        open={confirm}
        danger
        title="Сбросить демоданные?"
        text="Все изменения, сделанные в прототипе, будут потеряны, данные вернутся в исходное состояние."
        okLabel="Сбросить"
        onCancel={() => setConfirm(false)}
        onOk={() => { reset(); setConfirm(false); navigate('/'); toast.ok('Демоданные сброшены') }}
      />
    </div>
  )
}

export function Layout() {
  const [drawer, setDrawer] = useState(false)
  const theme = useStore((s) => s.theme)
  const setTheme = useStore((s) => s.setTheme)
  const location = useLocation()

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])
  useEffect(() => { setDrawer(false) }, [location.pathname])

  return (
    <div className="flex h-full">
      <div className="hidden lg:block"><Sidebar /></div>
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setDrawer(false)} />
          <div className="relative h-full w-64">
            <Sidebar onNavigate={() => setDrawer(false)} />
            <button className="absolute right-[-40px] top-3 rounded-full bg-white p-1.5 shadow" onClick={() => setDrawer(false)} aria-label="Закрыть меню"><X size={16} /></button>
          </div>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-white px-4 dark:bg-slate-900">
          <button className="btn-ghost !p-2 lg:hidden" onClick={() => setDrawer(true)} aria-label="Меню"><Menu size={20} /></button>
          <GlobalSearch />
          <div className="flex-1" />
          <button className="btn-ghost !p-2" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Сменить тему">
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <Notifications />
          <UserMenu />
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
