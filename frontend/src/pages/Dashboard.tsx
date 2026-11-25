import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import {
  Building2, Wallet, Receipt, TrendingUp, Gauge, AlarmClock, ShoppingCart, FileSignature, Sparkles, AlertTriangle, ChevronRight,
} from 'lucide-react'
import { useCurrentUser, useStore } from '../store'
import {
  companyMetrics, computeAlerts, cumulativeSpend, overdueTasks, projectMetrics, visibleProjects,
} from '../domain/calc'
import { Badge, PageHeader, ProgressBar, StatCard } from '../components/ui'
import { formatMoneyShort, formatPercent, shortName } from '../lib/format'
import { TODAY, formatDate } from '../lib/date'
import { PROJECT_STATUS_LABEL, PROJECT_STATUS_TONE } from '../domain/labels'
import { can } from '../domain/permissions'

const AXIS = { fill: '#94a3b8', fontSize: 12 }
const C = { budget: '#2563eb', plan: '#94a3b8', fact: '#f59e0b', ok: '#10b981', danger: '#ef4444' }

const mln = (v: number) => Math.round(v / 1e6)

export default function Dashboard() {
  const navigate = useNavigate()
  const user = useCurrentUser()
  const state = useStore()
  const projects = visibleProjects(state, user)
  const showFinance = can(user.role, 'finance.view') || user.role === 'director'
  const m = companyMetrics(state, projects)
  const alerts = computeAlerts(state).filter((a) => !a.projectId || projects.some((p) => p.id === a.projectId))

  const perProject = useMemo(
    () => projects.map((p) => ({ p, m: projectMetrics(p, state.stages) })),
    [projects, state.stages],
  )

  const budgetData = perProject.map(({ p, m: pm }) => ({
    id: p.id, name: shortName(p.name), 'Бюджет': mln(p.budget), 'План. себестоимость': mln(pm.plannedCost), 'Факт. расходы': mln(pm.spent),
  }))
  const progressData = perProject.map(({ p, m: pm }) => ({
    id: p.id, name: shortName(p.name), 'План по графику': Math.round(pm.plannedProgress), 'Факт': Math.round(pm.progress),
  }))
  const taskData = projects.map((p) => {
    const ts = state.tasks.filter((t) => t.projectId === p.id)
    const od = overdueTasks(ts).length
    return {
      id: p.id, name: shortName(p.name),
      'Выполнено': ts.filter((t) => t.status === 'done').length,
      'В работе': ts.filter((t) => t.status === 'in_progress').length - overdueTasks(ts.filter((t) => t.status === 'in_progress')).length,
      'К выполнению': ts.filter((t) => t.status === 'todo').length - overdueTasks(ts.filter((t) => t.status === 'todo')).length,
      'Просрочено': od,
    }
  })
  const cumulative = useMemo(() => {
    const ids = new Set(projects.map((p) => p.id))
    return cumulativeSpend(state.stages.filter((s) => ids.has(s.projectId)), '2026-01', '2027-03').map((pt) => ({
      name: pt.label, 'План': mln(pt.plan), 'Факт': pt.fact === null ? null : mln(pt.fact),
    }))
  }, [projects, state.stages])

  const go = (p: string) => () => navigate(p)

  return (
    <div>
      <PageHeader
        title="Главная панель"
        subtitle={`Сводка по объектам компании на ${formatDate(TODAY)}`}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Активные объекты" value={String(m.activeProjects)} sub={`из ${projects.length} в портфеле`} icon={<Building2 size={20} />} onClick={go('/projects')} />
        {showFinance && <>
          <StatCard label="Общий бюджет проектов" value={formatMoneyShort(m.budget)} sub="по договорам с заказчиками" icon={<Wallet size={20} />} tone="violet" onClick={go('/projects')} />
          <StatCard label="Фактические расходы" value={formatMoneyShort(m.spent)} sub={`${formatPercent((m.spent / Math.max(1, m.budget)) * 100)} от бюджета`} icon={<Receipt size={20} />} tone="amber" onClick={go('/projects')} />
          <StatCard label="Планируемая прибыль" value={formatMoneyShort(m.plannedProfit)} sub={`прогноз с учётом перерасхода: ${formatMoneyShort(m.forecastProfit)}`} icon={<TrendingUp size={20} />} tone="green" onClick={go('/projects')} />
        </>}
        <StatCard label="Готовность объектов" value={formatPercent(m.avgProgress)} sub="средневзвешенная по бюджету" icon={<Gauge size={20} />} onClick={go('/projects')} />
        <StatCard label="Просроченные задачи" value={String(m.overdueTasks)} sub="открыть список задач" icon={<AlarmClock size={20} />} tone={m.overdueTasks ? 'red' : 'green'} onClick={go('/projects?view=tasks&filter=overdue')} />
        <StatCard label="Заявки на закупку" value={String(m.openRequests)} sub="черновики, на согласовании, согласованные" icon={<ShoppingCart size={20} />} tone="violet" onClick={go('/procurement')} />
        <StatCard label="Неподписанные документы" value={String(m.unsignedDocs)} sub="акты КС, допсоглашения" icon={<FileSignature size={20} />} tone={m.unsignedDocs ? 'amber' : 'green'} onClick={go('/projects?view=docs&filter=unsigned')} />
        <StatCard label="Предупреждения AI" value={String(m.alerts)} sub="сформированы по правилам на данных системы" icon={<Sparkles size={20} />} tone={m.alerts ? 'red' : 'green'} onClick={go('/assistant?ask=alerts')} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        {showFinance && (
          <div className="card p-4">
            <h3 className="mb-3 text-sm font-semibold">Бюджет, себестоимость и расходы по объектам, млн ₽</h3>
            <div className="h-64">
              <ResponsiveContainer>
                <BarChart data={budgetData} onClick={(e) => { const id = (e?.activePayload?.[0]?.payload as { id?: string } | undefined)?.id; if (id) navigate(`/projects/${id}`) }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f033" />
                  <XAxis dataKey="name" tick={AXIS} /><YAxis tick={AXIS} />
                  <Tooltip /><Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Бюджет" fill={C.budget} radius={[4, 4, 0, 0]} cursor="pointer" />
                  <Bar dataKey="План. себестоимость" fill={C.plan} radius={[4, 4, 0, 0]} cursor="pointer" />
                  <Bar dataKey="Факт. расходы" fill={C.fact} radius={[4, 4, 0, 0]} cursor="pointer" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
        {showFinance && (
          <div className="card p-4">
            <h3 className="mb-1 text-sm font-semibold">Расходы нарастающим итогом, млн ₽</h3>
            <p className="mb-2 text-xs text-slate-500">Затраты этапов распределены равномерно по срокам (допущение демо)</p>
            <div className="h-60">
              <ResponsiveContainer>
                <LineChart data={cumulative}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f033" />
                  <XAxis dataKey="name" tick={AXIS} /><YAxis tick={AXIS} />
                  <Tooltip /><Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="План" stroke={C.plan} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Факт" stroke={C.fact} strokeWidth={2.5} dot={false} connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
        <div className="card p-4">
          <h3 className="mb-3 text-sm font-semibold">Выполнение строительных работ, %</h3>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={progressData} onClick={(e) => { const id = (e?.activePayload?.[0]?.payload as { id?: string } | undefined)?.id; if (id) navigate(`/projects/${id}?tab=stages`) }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f033" />
                <XAxis dataKey="name" tick={AXIS} /><YAxis domain={[0, 100]} tick={AXIS} />
                <Tooltip /><Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="План по графику" fill={C.plan} radius={[4, 4, 0, 0]} cursor="pointer" />
                <Bar dataKey="Факт" fill={C.ok} radius={[4, 4, 0, 0]} cursor="pointer" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card p-4">
          <h3 className="mb-3 text-sm font-semibold">Задачи по объектам</h3>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={taskData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f033" />
                <XAxis dataKey="name" tick={AXIS} /><YAxis allowDecimals={false} tick={AXIS} />
                <Tooltip /><Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Выполнено" stackId="a" fill={C.ok} />
                <Bar dataKey="В работе" stackId="a" fill={C.budget} />
                <Bar dataKey="К выполнению" stackId="a" fill={C.plan} />
                <Bar dataKey="Просрочено" stackId="a" fill={C.danger} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-5">
        <div className="card xl:col-span-3">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h3 className="text-sm font-semibold">Объекты</h3>
            <button className="text-xs text-brand-600 hover:underline" onClick={go('/projects')}>Все объекты</button>
          </div>
          <div className="divide-y">
            {perProject.map(({ p, m: pm }) => (
              <button key={p.id} onClick={go(`/projects/${p.id}`)} className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{p.name}</span>
                    <Badge tone={PROJECT_STATUS_TONE[p.status]}>{PROJECT_STATUS_LABEL[p.status]}</Badge>
                    {pm.behind && <Badge tone="red">Отстаёт на {pm.delayPp.toFixed(0)} п.п.</Badge>}
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <ProgressBar value={pm.progress} tone={pm.behind ? 'amber' : 'green'} className="max-w-xs" />
                    <span className="text-xs text-slate-500">{pm.progress.toFixed(0)}%</span>
                  </div>
                </div>
                {showFinance && (
                  <div className="hidden text-right sm:block">
                    <div className="text-sm font-medium">{formatMoneyShort(pm.spent)}</div>
                    <div className={pm.overrun > 0 ? 'text-xs text-red-600' : 'text-xs text-slate-500'}>
                      {pm.overrun > 0 ? `перерасход ${formatMoneyShort(pm.overrun)}` : 'в бюджете'}
                    </div>
                  </div>
                )}
                <ChevronRight size={16} className="text-slate-400" />
              </button>
            ))}
          </div>
        </div>
        <div className="card xl:col-span-2">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold"><Sparkles size={15} className="text-brand-600" /> Предупреждения AI</h3>
            <button className="text-xs text-brand-600 hover:underline" onClick={go('/assistant?ask=alerts')}>Обсудить в чате</button>
          </div>
          <div className="max-h-[420px] divide-y overflow-y-auto">
            {alerts.length === 0 && <div className="px-4 py-6 text-sm text-slate-500">Предупреждений нет</div>}
            {alerts.slice(0, 10).map((a) => (
              <button key={a.id} onClick={go(a.link)} className="flex w-full items-start gap-2 px-4 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <AlertTriangle size={15} className={a.severity === 'high' ? 'mt-0.5 shrink-0 text-red-500' : a.severity === 'medium' ? 'mt-0.5 shrink-0 text-amber-500' : 'mt-0.5 shrink-0 text-slate-400'} />
                <span className="text-sm">{a.text}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
