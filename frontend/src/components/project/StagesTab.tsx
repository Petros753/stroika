import { useState } from 'react'
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react'
import clsx from 'clsx'
import { Badge, Field, Modal, ProgressBar } from '../ui'
import { Confirm } from '../Confirm'
import { toast } from '../Toast'
import { useStore } from '../../store'
import { useCan, useUserName } from '../../lib/hooks'
import { stagePlannedProgress } from '../../domain/calc'
import { PRIORITY_LABEL, PRIORITY_TONE, TASK_STATUS_LABEL, TASK_STATUS_TONE } from '../../domain/labels'
import type { Priority, Project, Stage, Task, TaskStatus } from '../../domain/types'
import { formatMoneyShort } from '../../lib/format'
import { TODAY, addDays, formatDate, isOverdue } from '../../lib/date'

const WORK_TYPES = [
  'Земляные работы', 'Монолитные работы', 'Строительно-монтажные работы', 'Инженерные системы', 'Отделочные работы',
  'Благоустройство', 'Пусконаладочные работы', 'Проектные работы',
]

function StageForm({ project, stage, onClose }: { project: Project; stage?: Stage; onClose: () => void }) {
  const stages = useStore((s) => s.stages.filter((x) => x.projectId === project.id))
  const add = useStore((s) => s.addStage)
  const update = useStore((s) => s.updateStage)
  const [f, setF] = useState({
    name: stage?.name ?? '', section: stage?.section ?? (stages[0]?.section ?? 'Корпус 1'), workType: stage?.workType ?? WORK_TYPES[0],
    startDate: stage?.startDate ?? TODAY, endDate: stage?.endDate ?? addDays(TODAY, 90), progress: stage?.progress ?? 0,
    plannedCost: stage?.plannedCost ?? 10_000_000, actualCost: stage?.actualCost ?? 0,
  })
  const [error, setError] = useState('')
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }))
  const sections = Array.from(new Set(stages.map((x) => x.section)))

  function save() {
    if (f.name.trim().length < 2) return setError('Укажите название этапа')
    if (!f.section.trim()) return setError('Укажите корпус или участок')
    if (f.endDate <= f.startDate) return setError('Дата окончания должна быть позже даты начала')
    if (f.progress < 0 || f.progress > 100) return setError('Готовность — от 0 до 100%')
    if (f.plannedCost < 0 || f.actualCost < 0) return setError('Суммы не могут быть отрицательными')
    if (stage) { update(stage.id, { ...f, name: f.name.trim() }); toast.ok('Этап обновлён') }
    else { add({ projectId: project.id, ...f, name: f.name.trim() }); toast.ok('Этап добавлен') }
    onClose()
  }
  return (
    <Modal open onClose={onClose} title={stage ? 'Редактирование этапа' : 'Новый этап'} wide
      footer={<><button className="btn-secondary" onClick={onClose}>Отмена</button><button className="btn-primary" onClick={save}>Сохранить</button></>}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Название этапа" className="sm:col-span-2"><input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} autoFocus /></Field>
        <Field label="Корпус / участок">
          <input className="input" list="sections" value={f.section} onChange={(e) => set('section', e.target.value)} />
          <datalist id="sections">{sections.map((x) => <option key={x} value={x} />)}</datalist>
        </Field>
        <Field label="Вид работ">
          <select className="input" value={f.workType} onChange={(e) => set('workType', e.target.value)}>
            {Array.from(new Set([...WORK_TYPES, f.workType])).map((w) => <option key={w}>{w}</option>)}
          </select>
        </Field>
        <Field label="Начало"><input type="date" className="input" value={f.startDate} onChange={(e) => set('startDate', e.target.value)} /></Field>
        <Field label="Окончание"><input type="date" className="input" value={f.endDate} onChange={(e) => set('endDate', e.target.value)} /></Field>
        <Field label="Готовность, %"><input type="number" min={0} max={100} className="input" value={f.progress} onChange={(e) => set('progress', Number(e.target.value))} /></Field>
        <div />
        <Field label="Плановая себестоимость, ₽"><input type="number" min={0} className="input" value={f.plannedCost} onChange={(e) => set('plannedCost', Number(e.target.value))} /></Field>
        <Field label="Фактические затраты, ₽"><input type="number" min={0} className="input" value={f.actualCost} onChange={(e) => set('actualCost', Number(e.target.value))} /></Field>
      </div>
      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{error}</p>}
    </Modal>
  )
}

function TaskForm({ project, onClose }: { project: Project; onClose: () => void }) {
  const stages = useStore((s) => s.stages.filter((x) => x.projectId === project.id))
  const users = useStore((s) => s.users)
  const add = useStore((s) => s.addTask)
  const assignees = users.filter((u) => u.projectIds.includes(project.id) || u.role === 'director')
  const [f, setF] = useState({
    title: '', stageId: stages[0]?.id ?? '', assigneeId: assignees[0]?.id ?? '', dueDate: addDays(TODAY, 7),
    priority: 'normal' as Priority, status: 'todo' as TaskStatus,
  })
  const [error, setError] = useState('')
  return (
    <Modal open onClose={onClose} title="Новая задача"
      footer={<><button className="btn-secondary" onClick={onClose}>Отмена</button><button className="btn-primary" onClick={() => {
        if (f.title.trim().length < 3) return setError('Опишите задачу')
        if (!f.stageId) return setError('Сначала добавьте этап')
        add({ projectId: project.id, ...f, title: f.title.trim() }); toast.ok('Задача создана'); onClose()
      }}>Создать</button></>}>
      <div className="grid gap-3">
        <Field label="Задача"><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} autoFocus /></Field>
        <Field label="Этап"><select className="input" value={f.stageId} onChange={(e) => setF({ ...f, stageId: e.target.value })}>{stages.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.section}</option>)}</select></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Исполнитель"><select className="input" value={f.assigneeId} onChange={(e) => setF({ ...f, assigneeId: e.target.value })}>{assignees.map((u) => <option key={u.id} value={u.id}>{u.name.split(' ').slice(0, 2).join(' ')}</option>)}</select></Field>
          <Field label="Срок"><input type="date" className="input" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></Field>
          <Field label="Приоритет"><select className="input" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value as Priority })}>{(Object.keys(PRIORITY_LABEL) as Priority[]).map((k) => <option key={k} value={k}>{PRIORITY_LABEL[k]}</option>)}</select></Field>
        </div>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{error}</p>}
      </div>
    </Modal>
  )
}

function ProgressCell({ stage, editable }: { stage: Stage; editable: boolean }) {
  const update = useStore((s) => s.updateStage)
  const [v, setV] = useState<string>(String(stage.progress))
  const planned = stagePlannedProgress(stage)
  const behind = planned - stage.progress >= 10 && stage.progress < 100
  const commit = () => {
    const n = Math.max(0, Math.min(100, Number(v) || 0))
    setV(String(n))
    if (n !== stage.progress) { update(stage.id, { progress: n }); toast.ok('Готовность этапа обновлена') }
  }
  return (
    <div className="flex items-center gap-2">
      <div className="w-24"><ProgressBar value={stage.progress} tone={behind ? 'amber' : stage.progress >= 100 ? 'green' : 'blue'} /></div>
      {editable ? (
        <input type="number" min={0} max={100} value={v} className="input !w-16 !px-2 !py-0.5 text-right" onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
      ) : <span className="text-sm">{stage.progress}%</span>}
      {behind && <Badge tone="red">план {planned.toFixed(0)}%</Badge>}
    </div>
  )
}

export function StagesTab({ project }: { project: Project }) {
  const s = useStore()
  const canStage = useCan('stage.edit')
  const canTask = useCan('task.edit')
  const name = useUserName()
  const [workType, setWorkType] = useState('all')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [editing, setEditing] = useState<Stage | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Stage | null>(null)
  const [taskForm, setTaskForm] = useState(false)
  const [taskFilter, setTaskFilter] = useState<'all' | 'open' | 'overdue'>('all')

  const stages = s.stages.filter((x) => x.projectId === project.id && (workType === 'all' || x.workType === workType))
  const sections = Array.from(new Set(stages.map((x) => x.section)))
  const workTypes = Array.from(new Set(s.stages.filter((x) => x.projectId === project.id).map((x) => x.workType)))
  const tasks = s.tasks
    .filter((t) => t.projectId === project.id)
    .filter((t) => taskFilter === 'all' ? true : taskFilter === 'open' ? t.status !== 'done' : t.status !== 'done' && isOverdue(t.dueDate))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))

  return (
    <div className="space-y-6">
      <section>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold">Структура объекта: корпуса, участки, этапы и виды работ</h3>
          <div className="flex-1" />
          <select className="input !w-60" value={workType} onChange={(e) => setWorkType(e.target.value)}>
            <option value="all">Все виды работ</option>
            {workTypes.map((w) => <option key={w}>{w}</option>)}
          </select>
          {canStage && <button className="btn-primary" onClick={() => setEditing('new')}><Plus size={15} /> Добавить этап</button>}
        </div>
        {sections.length === 0 && <div className="card px-4 py-8 text-center text-sm text-slate-500">Этапов пока нет. {canStage && 'Добавьте первый этап, чтобы готовность и затраты считались автоматически.'}</div>}
        <div className="space-y-3">
          {sections.map((sec) => {
            const rows = stages.filter((x) => x.section === sec)
            const open = !collapsed[sec]
            return (
              <div key={sec} className="card overflow-hidden">
                <button className="flex w-full items-center gap-2 border-b bg-slate-50 px-4 py-2 text-left dark:bg-slate-800/40" onClick={() => setCollapsed({ ...collapsed, [sec]: open })}>
                  {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <span className="text-sm font-semibold">{sec}</span>
                  <span className="text-xs text-slate-500">{rows.length} этап(ов)</span>
                </button>
                {open && (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[820px]">
                      <thead><tr><th className="th">Этап</th><th className="th">Вид работ</th><th className="th">Сроки</th><th className="th">Готовность</th><th className="th text-right">План / факт затрат</th><th className="th" /></tr></thead>
                      <tbody className="divide-y">
                        {rows.map((st) => (
                          <tr key={st.id}>
                            <td className="td font-medium">{st.name}</td>
                            <td className="td text-slate-500">{st.workType}</td>
                            <td className="td whitespace-nowrap text-xs">{formatDate(st.startDate)} — {formatDate(st.endDate)}</td>
                            <td className="td"><ProgressCell stage={st} editable={canStage} /></td>
                            <td className="td text-right whitespace-nowrap text-xs">{formatMoneyShort(st.plannedCost)} / <span className={st.actualCost > (st.plannedCost * st.progress) / 100 + 1 ? 'font-medium text-red-600' : ''}>{formatMoneyShort(st.actualCost)}</span></td>
                            <td className="td text-right whitespace-nowrap">
                              {canStage && <>
                                <button className="btn-ghost !p-1.5" onClick={() => setEditing(st)} aria-label="Редактировать"><Pencil size={14} /></button>
                                <button className="btn-ghost !p-1.5 text-red-600" onClick={() => setDeleting(st)} aria-label="Удалить"><Trash2 size={14} /></button>
                              </>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold">Задачи</h3>
          <div className="flex-1" />
          {(['all', 'open', 'overdue'] as const).map((k) => (
            <button key={k} className={taskFilter === k ? 'btn-primary !py-1' : 'btn-secondary !py-1'} onClick={() => setTaskFilter(k)}>{k === 'all' ? 'Все' : k === 'open' ? 'Открытые' : 'Просроченные'}</button>
          ))}
          {canTask && <button className="btn-primary" onClick={() => setTaskForm(true)}><Plus size={15} /> Задача</button>}
        </div>
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead className="border-b"><tr><th className="th">Задача</th><th className="th">Этап</th><th className="th">Исполнитель</th><th className="th">Срок</th><th className="th">Приоритет</th><th className="th">Статус</th><th className="th" /></tr></thead>
            <tbody className="divide-y">
              {tasks.length === 0 && <tr><td className="td text-slate-500" colSpan={7}>Задач нет</td></tr>}
              {tasks.map((t: Task) => {
                const od = t.status !== 'done' && isOverdue(t.dueDate)
                const stage = s.stages.find((x) => x.id === t.stageId)
                return (
                  <tr key={t.id}>
                    <td className={clsx('td font-medium', t.status === 'done' && 'text-slate-400 line-through')}>{t.title}</td>
                    <td className="td text-xs text-slate-500">{stage?.name} · {stage?.section}</td>
                    <td className="td">{name(t.assigneeId)}</td>
                    <td className={clsx('td whitespace-nowrap', od && 'font-medium text-red-600')}>{formatDate(t.dueDate)}</td>
                    <td className="td"><Badge tone={PRIORITY_TONE[t.priority]}>{PRIORITY_LABEL[t.priority]}</Badge></td>
                    <td className="td">
                      {canTask ? (
                        <select className="input !w-36 !py-1" value={t.status} onChange={(e) => s.updateTask(t.id, { status: e.target.value as TaskStatus })}>
                          {(Object.keys(TASK_STATUS_LABEL) as TaskStatus[]).map((k) => <option key={k} value={k}>{TASK_STATUS_LABEL[k]}</option>)}
                        </select>
                      ) : <Badge tone={TASK_STATUS_TONE[t.status]}>{TASK_STATUS_LABEL[t.status]}</Badge>}
                    </td>
                    <td className="td text-right">{canTask && <button className="btn-ghost !p-1.5 text-red-600" onClick={() => { s.removeTask(t.id); toast.ok('Задача удалена') }} aria-label="Удалить задачу"><Trash2 size={14} /></button>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {editing && <StageForm project={project} stage={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      {taskForm && <TaskForm project={project} onClose={() => setTaskForm(false)} />}
      <Confirm
        open={!!deleting} danger title="Удалить этап?" okLabel="Удалить"
        text={`Этап «${deleting?.name ?? ''}» и связанные с ним задачи будут удалены. Готовность и затраты объекта пересчитаются.`}
        onCancel={() => setDeleting(null)}
        onOk={() => { if (deleting) s.removeStage(deleting.id); setDeleting(null); toast.ok('Этап удалён') }}
      />
    </div>
  )
}
