import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from '../components/Layout'
import { Toaster } from '../components/Toast'
import { useCurrentUser } from '../store'
import { SECTION_ACCESS, SECTION_PATH, canSee } from '../domain/permissions'
import type { SectionKey } from '../domain/types'
import Dashboard from '../pages/Dashboard'
import Projects from '../pages/Projects'
import ProjectDetail from '../pages/ProjectDetail'
import Procurement from '../pages/Procurement'
import Warehouse from '../pages/Warehouse'
import Cad from '../pages/CadSection'
import Estimates from '../pages/Estimates'
import Pto from '../pages/Pto'
import Execution from '../pages/Execution'
import Costing from '../pages/Costing'
import MailPage from '../pages/Mail'
import Assistant from '../pages/Assistant'
import Knowledge from '../pages/Knowledge'
import Employees from '../pages/Employees'
import { ShieldAlert } from 'lucide-react'
import type { ReactNode } from 'react'

function Guard({ section, children }: { section: SectionKey; children: ReactNode }) {
  const user = useCurrentUser()
  if (!canSee(user.role, section)) {
    return (
      <div className="mx-auto mt-16 max-w-md text-center">
        <ShieldAlert size={40} className="mx-auto text-amber-500" />
        <h2 className="mt-3 text-lg font-semibold">Нет доступа к разделу</h2>
        <p className="mt-1 text-sm text-slate-500">Для вашей роли этот раздел недоступен. Переключите роль в меню профиля (демо).</p>
      </div>
    )
  }
  return <>{children}</>
}

function Home() {
  const user = useCurrentUser()
  if (canSee(user.role, 'dashboard')) return <Dashboard />
  return <Navigate to={SECTION_PATH[SECTION_ACCESS[user.role][0]]} replace />
}

export default function App() {
  return (
    <>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="projects" element={<Guard section="projects"><Projects /></Guard>} />
          <Route path="projects/:id" element={<Guard section="projects"><ProjectDetail /></Guard>} />
          <Route path="procurement" element={<Guard section="procurement"><Procurement /></Guard>} />
          <Route path="warehouse" element={<Guard section="warehouse"><Warehouse /></Guard>} />
          <Route path="cad" element={<Guard section="cad"><Cad /></Guard>} />
          <Route path="estimates" element={<Guard section="estimates"><Estimates /></Guard>} />
          <Route path="execution" element={<Guard section="execution"><Execution /></Guard>} />
          <Route path="costing" element={<Guard section="costing"><Costing /></Guard>} />
          <Route path="mail" element={<Guard section="mail"><MailPage /></Guard>} />
          <Route path="pto" element={<Guard section="pto"><Pto /></Guard>} />
          <Route path="assistant" element={<Guard section="assistant"><Assistant /></Guard>} />
          <Route path="knowledge" element={<Guard section="knowledge"><Knowledge /></Guard>} />
          <Route path="employees" element={<Guard section="employees"><Employees /></Guard>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <Toaster />
    </>
  )
}
