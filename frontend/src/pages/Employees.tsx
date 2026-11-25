import { useState } from 'react'
import { LogIn } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Badge, Modal, PageHeader, Table, Tabs } from '../components/ui'
import { toast } from '../components/Toast'
import { useCurrentUser, useStore } from '../store'
import { useCan } from '../lib/hooks'
import { PERMISSION_LABEL, ROLE_LABEL } from '../domain/labels'
import { ALL_PROJECTS_ROLES, PERMISSIONS, SECTION_ACCESS, SECTION_LABEL } from '../domain/permissions'
import type { Permission, Role, SectionKey } from '../domain/types'

type Tab = 'users' | 'matrix'
const ROLES = Object.keys(ROLE_LABEL) as Role[]
const SECTIONS = Object.keys(SECTION_LABEL) as SectionKey[]
const PERMS = Object.keys(PERMISSION_LABEL) as Permission[]

export default function Employees() {
  const users = useStore((s) => s.users)
  const projects = useStore((s) => s.projects)
  const setRole = useStore((s) => s.setUserRole)
  const setProjects = useStore((s) => s.setUserProjects)
  const setCurrent = useStore((s) => s.setCurrentUser)
  const me = useCurrentUser()
  const canManage = useCan('employees.manage')
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('users')
  const [editId, setEditId] = useState<string | null>(null)
  const [sel, setSel] = useState<string[]>([])
  const editing = users.find((u) => u.id === editId)

  return (
    <div>
      <PageHeader title="Сотрудники и права" subtitle="Роли, доступ к объектам и матрица прав. Изменять права может только администратор." />
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[{ key: 'users', label: 'Сотрудники' }, { key: 'matrix', label: 'Матрица прав' }]} />

      {tab === 'users' && (
        <Table>
          <thead className="border-b"><tr><th className="th">Сотрудник</th><th className="th">Роль</th><th className="th">Объекты</th><th className="th" /></tr></thead>
          <tbody className="divide-y">
            {users.map((u) => {
              const all = ALL_PROJECTS_ROLES.includes(u.role)
              const names = u.projectIds.map((id) => projects.find((p) => p.id === id)?.name).filter(Boolean) as string[]
              return (
                <tr key={u.id} className={u.id === me.id ? 'bg-brand-50/50 dark:bg-brand-500/5' : ''}>
                  <td className="td"><div className="font-medium">{u.name}{u.id === me.id && <Badge tone="blue" className="ml-2">это вы</Badge>}</div><div className="text-xs text-slate-500">{u.email}</div></td>
                  <td className="td">
                    {canManage && u.id !== me.id
                      ? <select className="input !w-auto !py-1" value={u.role} onChange={(e) => { setRole(u.id, e.target.value as Role); toast.ok(`Роль изменена: ${ROLE_LABEL[e.target.value as Role]}`) }}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select>
                      : <Badge>{ROLE_LABEL[u.role]}</Badge>}
                  </td>
                  <td className="td">
                    {all ? <span className="text-slate-500">Все объекты (по роли)</span> : names.length ? <div className="flex flex-wrap gap-1">{names.map((n) => <Badge key={n} tone="slate">{n}</Badge>)}</div> : <span className="text-slate-400">Не назначены</span>}
                  </td>
                  <td className="td whitespace-nowrap text-right">
                    {canManage && !all && <button className="btn-secondary !py-1 text-xs" onClick={() => { setEditId(u.id); setSel(u.projectIds) }}>Объекты</button>}{' '}
                    {u.id !== me.id && <button className="btn-ghost !py-1 text-xs text-brand-600" onClick={() => { setCurrent(u.id); toast.info(`Вы вошли как ${u.name} (демо)`); navigate('/') }}><LogIn size={14} />Войти как</button>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </Table>
      )}

      {tab === 'matrix' && (
        <div className="space-y-6">
          <MatrixTable title="Доступ к разделам" cols={SECTIONS.map((s) => ({ key: s, label: SECTION_LABEL[s] }))} has={(r, k) => SECTION_ACCESS[r].includes(k as SectionKey)} />
          <MatrixTable title="Права на действия" cols={PERMS.map((p) => ({ key: p, label: PERMISSION_LABEL[p] }))} has={(r, k) => PERMISSIONS[r].includes(k as Permission)} />
        </div>
      )}

      <Modal
        open={!!editing} onClose={() => setEditId(null)} title={`Объекты: ${editing?.name ?? ''}`}
        footer={<><button className="btn-secondary" onClick={() => setEditId(null)}>Отмена</button><button className="btn-primary" onClick={() => { if (editing) setProjects(editing.id, sel); setEditId(null); toast.ok('Назначение объектов сохранено') }}>Сохранить</button></>}
      >
        <p className="mb-3 text-sm text-slate-500">Сотрудник увидит только отмеченные объекты.</p>
        <div className="space-y-2">
          {projects.map((p) => (
            <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded-lg border p-2 text-sm">
              <input type="checkbox" checked={sel.includes(p.id)} onChange={(e) => setSel(e.target.checked ? [...sel, p.id] : sel.filter((x) => x !== p.id))} />{p.name}
            </label>
          ))}
        </div>
      </Modal>
    </div>
  )
}

function MatrixTable({ title, cols, has }: { title: string; cols: { key: string; label: string }[]; has: (r: Role, k: string) => boolean }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-xs">
          <thead className="border-b"><tr><th className="th">Роль</th>{cols.map((c) => <th key={c.key} className="th text-center align-bottom"><span className="inline-block max-w-[84px] whitespace-normal leading-tight">{c.label}</span></th>)}</tr></thead>
          <tbody className="divide-y">
            {ROLES.map((r) => (
              <tr key={r}><td className="td font-medium">{ROLE_LABEL[r]}</td>{cols.map((c) => <td key={c.key} className="td text-center">{has(r, c.key) ? <span className="text-emerald-600">●</span> : <span className="text-slate-300 dark:text-slate-700">—</span>}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
