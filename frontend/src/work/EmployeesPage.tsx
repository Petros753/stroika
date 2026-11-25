import { useMemo, useState } from 'react'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Ban, KeyRound, Pencil, RefreshCw, Unlock, UserPlus } from 'lucide-react'
import { Badge, EmptyState, Field, Modal, PageHeader, Table, Tabs } from '../components/ui'
import { Confirm } from '../components/Confirm'
import { toast } from '../components/Toast'
import { api, type ApiProject, type ApiUser, type AuditRow, type PermissionsMatrix } from './api'
import { useCurrentMe } from './auth'

type Tab = 'users' | 'matrix' | 'audit'
const SERVICE_ROLES = ['admin']

function useMatrix() {
  return useQuery({ queryKey: ['permissions'], queryFn: () => api<PermissionsMatrix>('/permissions'), staleTime: Infinity })
}

function genPassword(): string {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const buf = new Uint32Array(10)
  for (;;) {
    crypto.getRandomValues(buf)
    const pw = Array.from(buf, (n) => a[n % a.length]).join('')
    if (/\d/.test(pw) && /[a-zA-Z]/.test(pw)) return pw
  }
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function EmployeesPage() {
  const [tab, setTab] = useState<Tab>('users')
  return (
    <div>
      <PageHeader title="Сотрудники и права" subtitle="Учётные записи, роли, назначенные объекты и журнал действий." />
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[
        { key: 'users', label: 'Сотрудники' },
        { key: 'matrix', label: 'Матрица прав' },
        { key: 'audit', label: 'Журнал действий' },
      ]} />
      {tab === 'users' && <UsersTab />}
      {tab === 'matrix' && <MatrixTab />}
      {tab === 'audit' && <AuditTab />}
    </div>
  )
}

// ---------------- Сотрудники ----------------

interface FormState {
  full_name: string
  position: string
  login: string
  password: string
  role: string
  project_ids: string[]
}

const EMPTY_FORM: FormState = { full_name: '', position: '', login: '', password: '', role: '', project_ids: [] }

function UsersTab() {
  const me = useCurrentMe()
  const qc = useQueryClient()
  const users = useQuery({ queryKey: ['users'], queryFn: () => api<ApiUser[]>('/users') })
  const projects = useQuery({ queryKey: ['projects'], queryFn: () => api<ApiProject[]>('/projects') })
  const matrix = useMatrix()
  const [form, setForm] = useState<FormState | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [issued, setIssued] = useState<{ title: string; login: string; password: string } | null>(null)
  const [confirm, setConfirm] = useState<{ kind: 'reset' | 'block' | 'unblock'; user: ApiUser } | null>(null)
  const [formErr, setFormErr] = useState<string | null>(null)

  const roleLabel = (r: string) => matrix.data?.roles[r] ?? r
  const allProjectsRoles = matrix.data?.allProjectsRoles ?? []
  const assignable = Object.keys(matrix.data?.roles ?? {}).filter((r) => !SERVICE_ROLES.includes(r))
  const projectName = useMemo(() => new Map((projects.data ?? []).map((p) => [p.id, p.name])), [projects.data])

  const invalidate = () => qc.invalidateQueries({ queryKey: ['users'] })

  const save = useMutation({
    mutationFn: async (f: FormState) => {
      if (editId) {
        const body: Record<string, unknown> = { full_name: f.full_name, position: f.position, project_ids: f.project_ids }
        if (editId !== me.user.id) body.role = f.role
        return api<ApiUser>(`/users/${editId}`, { method: 'PATCH', body })
      }
      return api<ApiUser>('/users', { method: 'POST', body: f })
    },
    onSuccess: (u, f) => {
      void invalidate()
      if (!editId) setIssued({ title: 'Сотрудник создан', login: u.login, password: f.password })
      else toast.ok('Изменения сохранены')
      setForm(null)
      setEditId(null)
    },
    onError: (e) => setFormErr(e.message),
  })

  const action = useMutation({
    mutationFn: async (c: { kind: 'reset' | 'block' | 'unblock'; user: ApiUser }) => {
      if (c.kind === 'reset') return api<{ temporary_password: string }>(`/users/${c.user.id}/reset-password`, { method: 'POST' })
      return api<ApiUser>(`/users/${c.user.id}/${c.kind}`, { method: 'POST' })
    },
    onSuccess: (res, c) => {
      void invalidate()
      if (c.kind === 'reset') setIssued({ title: 'Пароль сброшен', login: c.user.login, password: (res as { temporary_password: string }).temporary_password })
      else toast.ok(c.kind === 'block' ? 'Сотрудник заблокирован' : 'Сотрудник разблокирован')
    },
    onError: (e) => toast.error(e.message),
    onSettled: () => setConfirm(null),
  })

  const openCreate = () => {
    setFormErr(null)
    setEditId(null)
    setForm({ ...EMPTY_FORM, role: 'foreman', password: genPassword() })
  }
  const openEdit = (u: ApiUser) => {
    setFormErr(null)
    setEditId(u.id)
    setForm({ full_name: u.full_name, position: u.position, login: u.login, password: '', role: u.role, project_ids: u.project_ids })
  }

  if (users.isPending) return <div className="text-sm text-slate-400">Загрузка…</div>
  if (users.isError) return <div className="text-sm text-red-600">{users.error.message}</div>

  return (
    <>
      <div className="mb-3 flex justify-end">
        <button className="btn-primary" onClick={openCreate}><UserPlus size={16} />Добавить сотрудника</button>
      </div>
      <Table>
        <thead className="border-b">
          <tr><th className="th">Сотрудник</th><th className="th">Роль</th><th className="th">Объекты</th><th className="th">Статус</th><th className="th">Последний вход</th><th className="th" /></tr>
        </thead>
        <tbody className="divide-y" data-testid="users-table">
          {users.data.map((u) => {
            const self = u.id === me.user.id
            const all = allProjectsRoles.includes(u.role)
            const names = u.project_ids.map((id) => projectName.get(id)).filter(Boolean) as string[]
            return (
              <tr key={u.id} data-login={u.login} className={self ? 'bg-brand-50/50 dark:bg-brand-500/5' : !u.is_active ? 'opacity-60' : ''}>
                <td className="td">
                  <div className="font-medium">{u.full_name}{self && <Badge tone="blue" className="ml-2">это вы</Badge>}</div>
                  <div className="text-xs text-slate-500">{u.login}{u.position ? ` · ${u.position}` : ''}</div>
                </td>
                <td className="td"><Badge>{roleLabel(u.role)}</Badge></td>
                <td className="td">
                  {all ? <span className="text-slate-500">Все объекты (по роли)</span>
                    : names.length ? <div className="flex flex-wrap gap-1">{names.map((n) => <Badge key={n} tone="slate">{n}</Badge>)}</div>
                      : <span className="text-slate-400">Не назначены</span>}
                </td>
                <td className="td">
                  {!u.is_active ? <Badge tone="red">Заблокирован</Badge> : u.must_change_password ? <Badge tone="amber">Временный пароль</Badge> : <Badge tone="green">Активен</Badge>}
                </td>
                <td className="td text-xs text-slate-500">{fmtDateTime(u.last_login_at)}</td>
                <td className="td whitespace-nowrap text-right">
                  <button className="btn-ghost !p-1.5" title="Изменить" aria-label={`Изменить ${u.login}`} onClick={() => openEdit(u)}><Pencil size={15} /></button>
                  {!self && <>
                    <button className="btn-ghost !p-1.5" title="Сбросить пароль" aria-label={`Сбросить пароль ${u.login}`} onClick={() => setConfirm({ kind: 'reset', user: u })}><KeyRound size={15} /></button>
                    {u.is_active
                      ? <button className="btn-ghost !p-1.5 text-red-600" title="Заблокировать" aria-label={`Заблокировать ${u.login}`} onClick={() => setConfirm({ kind: 'block', user: u })}><Ban size={15} /></button>
                      : <button className="btn-ghost !p-1.5 text-emerald-600" title="Разблокировать" aria-label={`Разблокировать ${u.login}`} onClick={() => setConfirm({ kind: 'unblock', user: u })}><Unlock size={15} /></button>}
                  </>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </Table>

      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        title={editId ? 'Изменить сотрудника' : 'Новый сотрудник'}
        wide
        footer={<>
          <button className="btn-secondary" onClick={() => setForm(null)}>Отмена</button>
          <button className="btn-primary" disabled={save.isPending} onClick={() => form && save.mutate(form)}>{editId ? 'Сохранить' : 'Создать'}</button>
        </>}
      >
        {form && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="ФИО *"><input className="input" aria-label="ФИО" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></Field>
            <Field label="Должность"><input className="input" aria-label="Должность" value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} /></Field>
            {!editId && <>
              <Field label="Логин *"><input className="input" aria-label="Логин" autoComplete="off" value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })} placeholder="ivanov" /></Field>
              <Field label="Временный пароль *">
                <div className="flex gap-1">
                  <input className="input font-mono" aria-label="Временный пароль" autoComplete="off" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                  <button type="button" className="btn-secondary !px-2" title="Сгенерировать" onClick={() => setForm({ ...form, password: genPassword() })}><RefreshCw size={15} /></button>
                </div>
              </Field>
            </>}
            <Field label="Роль *">
              <select className="input" aria-label="Роль" value={form.role} disabled={editId === me.user.id} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {assignable.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
              </select>
            </Field>
            <div className="sm:col-span-2">
              <div className="label">Объекты</div>
              {allProjectsRoles.includes(form.role) ? (
                <p className="text-sm text-slate-500">Роль «{roleLabel(form.role)}» видит все объекты.</p>
              ) : (projects.data ?? []).length === 0 ? (
                <p className="text-sm text-slate-500">Объектов пока нет — назначить их можно будет после подключения раздела «Проекты».</p>
              ) : (
                <div className="grid gap-1 sm:grid-cols-2">
                  {(projects.data ?? []).map((p) => (
                    <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded-lg border p-2 text-sm">
                      <input type="checkbox" checked={form.project_ids.includes(p.id)}
                        onChange={(e) => setForm({ ...form, project_ids: e.target.checked ? [...form.project_ids, p.id] : form.project_ids.filter((x) => x !== p.id) })} />
                      {p.name}
                    </label>
                  ))}
                </div>
              )}
            </div>
            {!editId && <p className="text-xs text-slate-500 sm:col-span-2">При первом входе сотрудник обязан сменить временный пароль.</p>}
            {formErr && <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2 dark:bg-red-500/10 dark:text-red-300">{formErr}</div>}
          </div>
        )}
      </Modal>

      <Modal open={!!issued} onClose={() => setIssued(null)} title={issued?.title ?? ''} footer={<button className="btn-primary" onClick={() => setIssued(null)}>Готово</button>}>
        {issued && (
          <div className="space-y-3 text-sm">
            <p>Передайте сотруднику данные для входа. Пароль временный — при первом входе система попросит его сменить.</p>
            <div className="rounded-lg border bg-slate-50 p-3 font-mono dark:bg-slate-800" data-testid="issued-credentials">
              <div>Логин: <b data-testid="issued-login">{issued.login}</b></div>
              <div>Пароль: <b data-testid="issued-password">{issued.password}</b></div>
            </div>
            <p className="text-xs text-slate-500">Пароль больше не будет показан. Если он потеряется — сбросьте его ещё раз.</p>
          </div>
        )}
      </Modal>

      <Confirm
        open={!!confirm}
        danger={confirm?.kind !== 'unblock'}
        title={confirm?.kind === 'reset' ? 'Сбросить пароль?' : confirm?.kind === 'block' ? 'Заблокировать сотрудника?' : 'Разблокировать сотрудника?'}
        text={
          confirm?.kind === 'reset' ? `${confirm.user.full_name} получит новый временный пароль, текущие сеансы будут завершены.`
            : confirm?.kind === 'block' ? `${confirm.user.full_name} не сможет войти, текущие сеансы будут завершены.`
              : `${confirm?.user.full_name ?? ''} снова сможет входить в систему.`
        }
        okLabel={confirm?.kind === 'reset' ? 'Сбросить' : confirm?.kind === 'block' ? 'Заблокировать' : 'Разблокировать'}
        onCancel={() => setConfirm(null)}
        onOk={() => confirm && action.mutate(confirm)}
      />
    </>
  )
}

// ---------------- Матрица прав ----------------

function MatrixTab() {
  const { data } = useMatrix()
  if (!data) return <div className="text-sm text-slate-400">Загрузка…</div>
  const roles = Object.keys(data.roles)
  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-500">Права проверяются на сервере при каждом запросе. Матрица задаётся разработчиком (shared/permissions.json).</p>
      <MatrixTable title="Доступ к разделам" roles={roles} roleLabel={data.roles} cols={Object.entries(data.sectionLabel)} has={(r, k) => data.sections[r]?.includes(k)} />
      <MatrixTable title="Права на действия" roles={roles} roleLabel={data.roles} cols={Object.entries(data.permissionLabel)} has={(r, k) => data.permissions[r]?.includes(k)} />
    </div>
  )
}

function MatrixTable({ title, roles, roleLabel, cols, has }: { title: string; roles: string[]; roleLabel: Record<string, string>; cols: [string, string][]; has: (r: string, k: string) => boolean | undefined }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-xs">
          <thead className="border-b"><tr><th className="th">Роль</th>{cols.map(([k, l]) => <th key={k} className="th text-center align-bottom"><span className="inline-block max-w-[84px] whitespace-normal leading-tight">{l}</span></th>)}</tr></thead>
          <tbody className="divide-y">
            {roles.map((r) => (
              <tr key={r}><td className="td font-medium">{roleLabel[r]}</td>{cols.map(([k]) => <td key={k} className="td text-center">{has(r, k) ? <span className="text-emerald-600">●</span> : <span className="text-slate-300 dark:text-slate-700">—</span>}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------------- Журнал действий ----------------

const PAGE = 100

function detailsText(r: AuditRow, roleLabel: Record<string, string>): string {
  const d = r.details
  const parts: string[] = []
  if (typeof d.login === 'string') parts.push(`логин: ${d.login}`)
  if (typeof d.from === 'string' && typeof d.to === 'string') parts.push(`${roleLabel[d.from] ?? d.from} → ${roleLabel[d.to] ?? d.to}`)
  if (typeof d.reason === 'string') parts.push(d.reason === 'blocked' ? 'учётная запись заблокирована' : 'неверный логин или пароль')
  if (typeof d.name === 'string') parts.push(d.name)
  if (Array.isArray(d.added) && d.added.length) parts.push(`добавлено объектов: ${d.added.length}`)
  if (Array.isArray(d.removed) && d.removed.length) parts.push(`снято объектов: ${d.removed.length}`)
  return parts.join(', ')
}

function AuditTab() {
  const q = useInfiniteQuery({
    queryKey: ['audit'],
    queryFn: ({ pageParam }) => api<AuditRow[]>(`/audit?limit=${PAGE}${pageParam ? `&before_id=${pageParam}` : ''}`),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.length === PAGE ? last[last.length - 1].id : undefined),
  })
  const users = useQuery({ queryKey: ['users'], queryFn: () => api<ApiUser[]>('/users') })
  const roleLabel = useMatrix().data?.roles ?? {}
  const targetName = useMemo(() => new Map((users.data ?? []).map((u) => [u.id, u.full_name])), [users.data])
  if (q.isPending) return <div className="text-sm text-slate-400">Загрузка…</div>
  if (q.isError) return <div className="text-sm text-red-600">{q.error.message}</div>
  const rows = q.data.pages.flat()
  if (!rows.length) return <EmptyState title="Журнал пуст" />
  return (
    <>
      <Table>
        <thead className="border-b"><tr><th className="th">Когда</th><th className="th">Кто</th><th className="th">Действие</th><th className="th">Подробности</th><th className="th">IP</th></tr></thead>
        <tbody className="divide-y" data-testid="audit-table">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="td whitespace-nowrap text-xs">{fmtDateTime(r.at)}</td>
              <td className="td">{r.user_name ?? <span className="text-slate-400">—</span>}</td>
              <td className="td">{r.action_label}</td>
              <td className="td text-xs text-slate-500">
                {r.target_type === 'user' && r.target_id && targetName.get(r.target_id) ? `${targetName.get(r.target_id)}${detailsText(r, roleLabel) ? ' · ' : ''}` : ''}{detailsText(r, roleLabel)}
              </td>
              <td className="td text-xs text-slate-500">{r.ip ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </Table>
      {q.hasNextPage && <div className="mt-3 text-center"><button className="btn-secondary" disabled={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>Показать ещё</button></div>}
    </>
  )
}
