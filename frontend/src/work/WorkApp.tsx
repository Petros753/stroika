import { useEffect, useState, type ReactNode } from 'react'
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Navigate, Route, Routes } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import { Toaster } from '../components/Toast'
import type { SectionKey } from '../domain/types'
import { ApiError, PASSWORD_CHANGE_REQUIRED } from './api'
import { ME_KEY, useCurrentMe, useMe } from './auth'
import { useTheme } from './theme'
import { visibleSections } from './sections'
import { WorkLayout } from './WorkLayout'
import LoginPage from './LoginPage'
import ChangePasswordPage from './ChangePasswordPage'
import HomePage from './HomePage'
import EmployeesPage from './EmployeesPage'

function makeClient(): QueryClient {
  const qc: QueryClient = new QueryClient({
    defaultOptions: { queries: { refetchOnWindowFocus: true, retry: (n, e) => !(e instanceof ApiError && e.status < 500) && n < 2 } },
    // Сессия истекла / пароль сброшен / требуется смена пароля — перечитать /auth/me, приложение перестроится
    queryCache: new QueryCache({ onError: (e) => onAuthError(qc, e) }),
    mutationCache: new MutationCache({ onError: (e) => onAuthError(qc, e) }),
  })
  return qc
}

function onAuthError(qc: QueryClient, e: unknown) {
  if (!(e instanceof ApiError)) return
  if (e.status === 401) qc.setQueryData(ME_KEY, null)
  else if (e.status === 403 && e.message === PASSWORD_CHANGE_REQUIRED) void qc.invalidateQueries({ queryKey: ME_KEY })
}

function Guard({ section, children }: { section: SectionKey; children: ReactNode }) {
  const me = useCurrentMe()
  if (!visibleSections(me.sections).includes(section)) {
    return (
      <div className="mx-auto mt-16 max-w-md text-center">
        <ShieldAlert size={40} className="mx-auto text-amber-500" />
        <h2 className="mt-3 text-lg font-semibold">Нет доступа к разделу</h2>
        <p className="mt-1 text-sm text-slate-500">Для вашей роли этот раздел недоступен.</p>
      </div>
    )
  }
  return <>{children}</>
}

function Gate() {
  const { data: me, isPending, isError, refetch } = useMe()
  if (isPending) return <div className="flex h-full items-center justify-center text-sm text-slate-400">Загрузка…</div>
  if (isError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-sm">
        <div>Сервер недоступен. Проверьте подключение.</div>
        <button className="btn-secondary" onClick={() => void refetch()}>Повторить</button>
      </div>
    )
  }
  if (!me) return <LoginPage />
  if (me.user.must_change_password) return <ChangePasswordPage forced />
  return (
    <Routes>
      <Route element={<WorkLayout />}>
        <Route index element={<HomePage />} />
        <Route path="employees" element={<Guard section="employees"><EmployeesPage /></Guard>} />
        <Route path="account/password" element={<ChangePasswordPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default function WorkApp() {
  const [client] = useState(makeClient)
  const theme = useTheme((s) => s.theme)
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])
  useEffect(() => {
    document.title = 'СтройAI'
  }, [])
  return (
    <QueryClientProvider client={client}>
      <Gate />
      <Toaster />
    </QueryClientProvider>
  )
}
