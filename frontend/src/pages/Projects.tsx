import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Search, Sparkles } from 'lucide-react'
import clsx from 'clsx'
import { Badge, EmptyState, PageHeader, ProgressBar, Table, Tabs } from '../components/ui'
import { ProjectForm } from '../components/project/ProjectForm'
import { useCurrentUser, useStore } from '../store'
import { useCan, useUserName, useVisibleProjects } from '../lib/hooks'
import { projectMetrics } from '../domain/calc'
import {
  PRIORITY_LABEL, PRIORITY_TONE, PROJECT_STATUS_LABEL, PROJECT_STATUS_TONE, TASK_STATUS_LABEL, TASK_STATUS_TONE,
} from '../domain/labels'
import type { ProjectStatus, TaskStatus } from '../domain/types'
import { formatMoneyShort, shortName } from '../lib/format'
import { TODAY, formatDate, isOverdue } from '../lib/date'

type View = 'projects' | 'tasks' | 'docs'

export default function Projects() {
  const [params, setParams] = useSearchParams()
  const view = (params.get('view') as View) || 'projects'
  const filter = params.get('filter') ?? 'all'
  const navigate = useNavigate()
  const projects = useVisibleProjects()
  const s = useStore()
  const user = useCurrentUser()
  const canCreate = useCan('project.create')
  const canEditTask = useCan('task.edit')
  const canSign = useCan('docs.sign')
  const finance = useCan('finance.view') || user.role === 'director'
  const name = useUserName()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<ProjectStatus | 'all'>('all')
  const [creating, setCreating] = useState(false)
  const ids = new Set(projects.map((p) => p.id))

  const setView = (v: View) => setParams(v === 'projects' ? {} : { view: v })
  const setFilter = (f: string) => setParams({ view, filter: f })

  const list = useMemo(
    () => projects
      .filter((p) => status === 'all' || p.status === status)
      .filter((p) => !q || `${p.name} ${p.address} ${p.customer}`.toLowerCase().includes(q.toLowerCase())),
    [projects, status, q],
  )

  const tasks = s.tasks
    .filter((t) => ids.has(t.projectId))
    .filter((t) => filter === 'all' ? true : filter === 'overdue' ? t.status !== 'done' && isOverdue(t.dueDate) : filter === 'mine' ? t.assigneeId === user.id : t.status !== 'done')
    .filter((t) => !q || t.title.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  const docs = s.documents
    .filter((d) => ids.has(d.projectId))
    .filter((d) => filter === 'unsigned' ? d.status === 'unsigned' : true)
    .filter((d) => !q || d.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.date.localeCompare(a.date))

  const chip = (key: string, label: string) => (
    <button key={key} className={filter === key || (key === 'all' && !params.get('filter')) ? 'btn-primary !py-1' : 'btn-secondary !py-1'} onClick={() => setFilter(key)}>{label}</button>
  )

  return (
    <div>
      <PageHeader
        title="Проекты"
        subtitle="Строительные объекты, задачи и документы"
        actions={canCreate && <button className="btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> Создать объект</button>}
      />
      <Tabs
        value={view} onChange={setView}
        tabs={[{ key: 'projects', label: 'Объекты' }, { key: 'tasks', label: 'Все задачи' }, { key: 'docs', label: 'Документы' }]}
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input !w-64 !pl-8" placeholder="Поиск" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {view === 'projects' && (
          <select className="input !w-48" value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus | 'all')}>
            <option value="all">Все статусы</option>
            {(Object.keys(PROJECT_STATUS_LABEL) as ProjectStatus[]).map((k) => <option key={k} value={k}>{PROJECT_STATUS_LABEL[k]}</option>)}
          </select>
        )}
        {view === 'tasks' && <>{chip('all', 'Все')}{chip('open', 'Открытые')}{chip('overdue', 'Просроченные')}{chip('mine', 'Мои')}</>}
        {view === 'docs' && <>{chip('all', 'Все')}{chip('unsigned', 'Неподписанные')}</>}
      </div>

      {view === 'projects' && (
        list.length === 0 ? <EmptyState title="Объекты не найдены" hint="Измените условия поиска или фильтр." /> : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {list.map((p) => {
              const m = projectMetrics(p, s.stages)
              const od = s.tasks.filter((t) => t.projectId === p.id && t.status !== 'done' && isOverdue(t.dueDate)).length
              return (
                <div key={p.id} className="card cursor-pointer p-4 transition hover:border-brand-400 hover:shadow-md" onClick={() => navigate(`/projects/${p.id}`)}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link to={`/projects/${p.id}`} className="block truncate font-semibold hover:text-brand-600" onClick={(e) => e.stopPropagation()}>{p.name}</Link>
                      <div className="truncate text-sm text-slate-500">{p.address}</div>
                    </div>
                    <Badge tone={PROJECT_STATUS_TONE[p.status]}>{PROJECT_STATUS_LABEL[p.status]}</Badge>
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <ProgressBar value={m.progress} tone={m.behind ? 'amber' : 'green'} />
                    <span className="w-10 text-right text-sm font-medium">{m.progress.toFixed(0)}%</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {m.behind && <Badge tone="red">Отстаёт на {m.delayPp.toFixed(0)} п.п.</Badge>}
                    {m.overrunPct >= 5 && <Badge tone="red">Перерасход {formatMoneyShort(m.overrun)}</Badge>}
                    {od > 0 && <Badge tone="amber">Просрочено задач: {od}</Badge>}
                    {!m.behind && m.overrunPct < 5 && od === 0 && <Badge tone="green">Без отклонений</Badge>}
                  </div>
                  <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                    <div><dt className="text-xs text-slate-500">Заказчик</dt><dd className="truncate">{p.customer}</dd></div>
                    <div><dt className="text-xs text-slate-500">Руководитель</dt><dd className="truncate">{name(p.managerId)}</dd></div>
                    <div><dt className="text-xs text-slate-500">Срок</dt><dd>{formatDate(p.endDate)}</dd></div>
                    {finance && <div><dt className="text-xs text-slate-500">Бюджет</dt><dd>{formatMoneyShort(p.budget)}</dd></div>}
                    {finance && <div><dt className="text-xs text-slate-500">Расходы</dt><dd>{formatMoneyShort(m.spent)}</dd></div>}
                    {finance && <div><dt className="text-xs text-slate-500">Прогноз прибыли</dt><dd className={m.forecastProfit < 0 ? 'text-red-600' : ''}>{formatMoneyShort(m.forecastProfit)}</dd></div>}
                  </dl>
                  <div className="mt-3 flex justify-end">
                    <button className="btn-ghost !py-1 text-brand-600" onClick={(e) => { e.stopPropagation(); navigate(`/assistant?project=${p.id}`) }}>
                      <Sparkles size={14} /> Спросить AI
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )
      )}

      {view === 'tasks' && (
        <Table>
          <thead className="border-b"><tr><th className="th">Задача</th><th className="th">Объект</th><th className="th">Исполнитель</th><th className="th">Срок</th><th className="th">Приоритет</th><th className="th">Статус</th></tr></thead>
          <tbody className="divide-y">
            {tasks.length === 0 && <tr><td className="td text-slate-500" colSpan={6}>Задач не найдено</td></tr>}
            {tasks.map((t) => {
              const od = t.status !== 'done' && isOverdue(t.dueDate)
              return (
                <tr key={t.id}>
                  <td className="td"><Link className="font-medium hover:text-brand-600" to={`/projects/${t.projectId}?tab=stages`}>{t.title}</Link></td>
                  <td className="td">{shortName(s.projects.find((p) => p.id === t.projectId)?.name ?? '')}</td>
                  <td className="td">{name(t.assigneeId)}</td>
                  <td className={clsx('td', od && 'font-medium text-red-600')}>{formatDate(t.dueDate)}{od && ' · просрочено'}</td>
                  <td className="td"><Badge tone={PRIORITY_TONE[t.priority]}>{PRIORITY_LABEL[t.priority]}</Badge></td>
                  <td className="td">
                    {canEditTask ? (
                      <select className="input !w-36 !py-1" value={t.status} onChange={(e) => s.updateTask(t.id, { status: e.target.value as TaskStatus })}>
                        {(Object.keys(TASK_STATUS_LABEL) as TaskStatus[]).map((k) => <option key={k} value={k}>{TASK_STATUS_LABEL[k]}</option>)}
                      </select>
                    ) : <Badge tone={TASK_STATUS_TONE[t.status]}>{TASK_STATUS_LABEL[t.status]}</Badge>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </Table>
      )}

      {view === 'docs' && (
        <Table>
          <thead className="border-b"><tr><th className="th">Документ</th><th className="th">Тип</th><th className="th">Объект</th><th className="th">Контрагент</th><th className="th">Дата</th><th className="th">Статус</th></tr></thead>
          <tbody className="divide-y">
            {docs.length === 0 && <tr><td className="td text-slate-500" colSpan={6}>Документов не найдено</td></tr>}
            {docs.map((d) => (
              <tr key={d.id}>
                <td className="td font-medium">{d.name}</td>
                <td className="td">{d.type}</td>
                <td className="td"><Link className="hover:text-brand-600" to={`/projects/${d.projectId}?tab=docs`}>{shortName(s.projects.find((p) => p.id === d.projectId)?.name ?? '')}</Link></td>
                <td className="td">{d.counterparty}</td>
                <td className="td">{formatDate(d.date)}</td>
                <td className="td">
                  {canSign ? (
                    <button className={d.status === 'signed' ? 'btn-secondary !py-1' : 'btn-primary !py-1'} onClick={() => s.toggleDocSigned(d.id)}>
                      {d.status === 'signed' ? 'Подписан ✓' : 'Подписать'}
                    </button>
                  ) : <Badge tone={d.status === 'signed' ? 'green' : 'amber'}>{d.status === 'signed' ? 'Подписан' : 'Не подписан'}</Badge>}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <ProjectForm key={creating ? 'open' : 'closed'} open={creating} onClose={() => setCreating(false)} onSaved={(id) => navigate(`/projects/${id}`)} />
    </div>
  )
}
