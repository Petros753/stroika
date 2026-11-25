import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Building2, ChevronDown, Home, KeyRound, LogOut, Menu, Moon, Sun, Users, X } from 'lucide-react'
import clsx from 'clsx'
import { ROLE_LABEL } from '../domain/labels'
import type { Role, SectionKey } from '../domain/types'
import { useCurrentMe, useLogout } from './auth'
import { SECTION_LABEL, SECTION_PATH, visibleSections } from './sections'
import { useTheme } from './theme'

const ICONS: Partial<Record<SectionKey, typeof Home>> = { employees: Users }

const linkClass = ({ isActive }: { isActive: boolean }) =>
  clsx(
    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
    isActive ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
  )

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const me = useCurrentMe()
  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r bg-white dark:bg-slate-900">
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white"><Building2 size={18} /></div>
        <div className="text-sm font-bold leading-4">СтройAI</div>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-3" aria-label="Разделы">
        <NavLink to="/" end onClick={onNavigate} className={linkClass}><Home size={18} />Главная</NavLink>
        {visibleSections(me.sections).map((key) => {
          const Icon = ICONS[key] ?? Home
          return (
            <NavLink key={key} to={SECTION_PATH[key]} onClick={onNavigate} className={linkClass}>
              <Icon size={18} />
              <span className="flex-1">{SECTION_LABEL[key]}</span>
            </NavLink>
          )
        })}
      </nav>
    </aside>
  )
}

function UserMenu() {
  const me = useCurrentMe()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const logout = useLogout()
  const navigate = useNavigate()
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  const initials = me.user.full_name.split(' ').slice(0, 2).map((x) => x[0]).join('')
  return (
    <div ref={ref} className="relative">
      <button className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => setOpen(!open)} aria-label="Меню пользователя">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white">{initials}</div>
        <div className="hidden text-left sm:block">
          <div className="text-sm font-medium leading-4" data-testid="current-user">{me.user.full_name}</div>
          <div className="text-xs text-slate-500">{ROLE_LABEL[me.user.role as Role] ?? me.user.role}</div>
        </div>
        <ChevronDown size={14} className="text-slate-400" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-1 w-56 rounded-lg border bg-white p-1 shadow-lg dark:bg-slate-900">
          <button className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => { setOpen(false); navigate('/account/password') }}>
            <KeyRound size={15} />Сменить пароль
          </button>
          <button className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10" onClick={() => { setOpen(false); logout.mutate() }}>
            <LogOut size={15} />Выйти
          </button>
        </div>
      )}
    </div>
  )
}

export function WorkLayout() {
  const [drawer, setDrawer] = useState(false)
  const { theme, toggle } = useTheme()
  const location = useLocation()
  useEffect(() => setDrawer(false), [location.pathname])
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
          <div className="flex-1" />
          <button className="btn-ghost !p-2" onClick={toggle} aria-label="Сменить тему">{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button>
          <UserMenu />
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6"><Outlet /></main>
      </div>
    </div>
  )
}
