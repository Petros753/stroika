import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Sparkles } from 'lucide-react'
import { Badge, ProgressBar } from '../ui'
import { useStore } from '../../store'
import { useCan, useUserName } from '../../lib/hooks'
import { computeAlerts, projectMetrics } from '../../domain/calc'
import { PROJECT_STATUS_LABEL, PROJECT_STATUS_TONE } from '../../domain/labels'
import type { Project } from '../../domain/types'
import { formatMoney, formatMoneyShort } from '../../lib/format'
import { formatDate } from '../../lib/date'

export function OverviewTab({ project }: { project: Project }) {
  const navigate = useNavigate()
  const s = useStore()
  const name = useUserName()
  const finance = useCan('finance.view')
  const m = projectMetrics(project, s.stages)
  const alerts = computeAlerts(s).filter((a) => a.projectId === project.id)
  const activity = s.activity.filter((a) => a.projectId === project.id).slice(0, 6)
  const sections = Array.from(new Set(s.stages.filter((x) => x.projectId === project.id).map((x) => x.section)))

  const Stat = ({ label, value, sub, bad }: { label: string; value: string; sub?: string; bad?: boolean }) => (
    <div className="card p-4"><div className="text-xs text-slate-500">{label}</div><div className={'mt-1 text-lg font-semibold ' + (bad ? 'text-red-600' : '')}>{value}</div>{sub && <div className="text-xs text-slate-500">{sub}</div>}</div>
  )

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {finance && <Stat label="Бюджет по договору" value={formatMoneyShort(project.budget)} />}
        {finance && <Stat label="Фактические расходы" value={formatMoneyShort(m.spent)} sub={`из ${formatMoneyShort(m.plannedCost)} плановой себестоимости`} />}
        {finance && <Stat label="Планируемая прибыль" value={formatMoneyShort(m.plannedProfit)} sub={`прогноз: ${formatMoneyShort(m.forecastProfit)}`} bad={m.forecastProfit < 0} />}
        {finance && <Stat label="Перерасход" value={m.overrun > 0 ? formatMoneyShort(m.overrun) : '—'} sub={m.overrun > 0 ? `${m.overrunPct.toFixed(1)}% от освоенного` : 'нет'} bad={m.overrunPct >= 5} />}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="card p-4 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold">Об объекте</h3><Badge tone={PROJECT_STATUS_TONE[project.status]}>{PROJECT_STATUS_LABEL[project.status]}</Badge></div>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <div><dt className="label">Адрес</dt><dd>{project.address}</dd></div>
            <div><dt className="label">Заказчик</dt><dd>{project.customer}</dd></div>
            <div><dt className="label">Руководитель проекта</dt><dd>{name(project.managerId)}</dd></div>
            <div><dt className="label">Сроки</dt><dd>{formatDate(project.startDate)} — {formatDate(project.endDate)}</dd></div>
            {finance && <div><dt className="label">Бюджет, точно</dt><dd>{formatMoney(project.budget)}</dd></div>}
            <div><dt className="label">Корпуса и участки</dt><dd>{sections.join(', ') || '—'}</dd></div>
            {project.description && <div className="sm:col-span-2"><dt className="label">Описание</dt><dd>{project.description}</dd></div>}
          </dl>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <div className="mb-1 flex justify-between text-xs"><span className="text-slate-500">Готовность (факт)</span><span className="font-medium">{m.progress.toFixed(0)}%</span></div>
              <ProgressBar value={m.progress} tone="green" />
            </div>
            <div>
              <div className="mb-1 flex justify-between text-xs"><span className="text-slate-500">По графику на сегодня</span><span className="font-medium">{m.plannedProgress.toFixed(0)}%</span></div>
              <ProgressBar value={m.plannedProgress} tone={m.behind ? 'amber' : 'blue'} />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold"><Sparkles size={15} className="text-brand-600" /> Предупреждения AI</h3>
          </div>
          <div className="divide-y">
            {alerts.length === 0 && <div className="px-4 py-5 text-sm text-slate-500">Предупреждений нет</div>}
            {alerts.map((a) => (
              <button key={a.id} onClick={() => navigate(a.link)} className="flex w-full items-start gap-2 px-4 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <AlertTriangle size={14} className={a.severity === 'high' ? 'mt-0.5 shrink-0 text-red-500' : 'mt-0.5 shrink-0 text-amber-500'} />
                <span className="text-sm">{a.text.replace(project.name + ': ', '')}</span>
              </button>
            ))}
          </div>
          <div className="border-t p-3">
            <button className="btn-secondary w-full" onClick={() => navigate(`/assistant?project=${project.id}`)}><Sparkles size={15} /> Спросить AI об объекте</button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="border-b px-4 py-3"><h3 className="text-sm font-semibold">Последние действия</h3></div>
        <div className="divide-y">
          {activity.length === 0 && <div className="px-4 py-5 text-sm text-slate-500">Действий пока нет</div>}
          {activity.map((a) => (
            <div key={a.id} className="flex items-center justify-between px-4 py-2 text-sm"><span>{a.text}</span><span className="text-xs text-slate-400">{name(a.userId)} · {formatDate(a.date)}</span></div>
          ))}
        </div>
      </div>
    </div>
  )
}
