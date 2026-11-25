import { useState } from 'react'
import { Field, Modal } from '../ui'
import { useStore } from '../../store'
import { PROJECT_STATUS_LABEL } from '../../domain/labels'
import type { Project, ProjectStatus } from '../../domain/types'
import { toast } from '../Toast'
import { TODAY, addDays } from '../../lib/date'

export function ProjectForm({ open, onClose, project, onSaved }: { open: boolean; onClose: () => void; project?: Project; onSaved?: (id: string) => void }) {
  const users = useStore((s) => s.users)
  const stagesCount = useStore((s) => s.stages.filter((x) => x.projectId === project?.id).length)
  const add = useStore((s) => s.addProject)
  const update = useStore((s) => s.updateProject)
  const managers = users.filter((u) => u.role === 'pm' || u.role === 'director')
  const [f, setF] = useState({
    name: project?.name ?? '', address: project?.address ?? '', customer: project?.customer ?? '',
    managerId: project?.managerId ?? managers[0]?.id ?? '', startDate: project?.startDate ?? TODAY,
    endDate: project?.endDate ?? addDays(TODAY, 365), budget: project?.budget ?? 100_000_000,
    status: (project?.status ?? 'planning') as ProjectStatus, progress: project?.progress ?? 0, description: project?.description ?? '',
  })
  const [error, setError] = useState('')
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }))

  function save() {
    if (f.name.trim().length < 3) return setError('Укажите название объекта')
    if (!f.address.trim()) return setError('Укажите адрес')
    if (!f.customer.trim()) return setError('Укажите заказчика')
    if (!(f.budget > 0)) return setError('Бюджет должен быть больше нуля')
    if (f.endDate <= f.startDate) return setError('Дата завершения должна быть позже даты начала')
    if (f.progress < 0 || f.progress > 100) return setError('Готовность — от 0 до 100%')
    setError('')
    if (project) {
      update(project.id, { ...f, name: f.name.trim(), address: f.address.trim(), customer: f.customer.trim() })
      toast.ok('Изменения сохранены')
      onSaved?.(project.id)
    } else {
      const id = add({ ...f, name: f.name.trim(), address: f.address.trim(), customer: f.customer.trim() })
      toast.ok('Объект создан')
      onSaved?.(id)
    }
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={project ? 'Редактирование объекта' : 'Новый строительный объект'} wide
      footer={<><button className="btn-secondary" onClick={onClose}>Отмена</button><button className="btn-primary" onClick={save}>Сохранить</button></>}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Название" className="sm:col-span-2"><input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} autoFocus /></Field>
        <Field label="Адрес" className="sm:col-span-2"><input className="input" value={f.address} onChange={(e) => set('address', e.target.value)} /></Field>
        <Field label="Заказчик"><input className="input" value={f.customer} onChange={(e) => set('customer', e.target.value)} /></Field>
        <Field label="Руководитель проекта">
          <select className="input" value={f.managerId} onChange={(e) => set('managerId', e.target.value)}>
            {managers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </Field>
        <Field label="Дата начала"><input type="date" className="input" value={f.startDate} onChange={(e) => set('startDate', e.target.value)} /></Field>
        <Field label="Дата завершения"><input type="date" className="input" value={f.endDate} onChange={(e) => set('endDate', e.target.value)} /></Field>
        <Field label="Бюджет по договору, ₽"><input type="number" min={0} className="input" value={f.budget} onChange={(e) => set('budget', Number(e.target.value))} /></Field>
        <Field label="Статус">
          <select className="input" value={f.status} onChange={(e) => set('status', e.target.value as ProjectStatus)}>
            {(Object.keys(PROJECT_STATUS_LABEL) as ProjectStatus[]).map((k) => <option key={k} value={k}>{PROJECT_STATUS_LABEL[k]}</option>)}
          </select>
        </Field>
        <Field label={stagesCount > 0 ? 'Готовность, % (считается по этапам)' : 'Готовность, %'}>
          <input type="number" min={0} max={100} className="input" value={f.progress} disabled={stagesCount > 0} onChange={(e) => set('progress', Number(e.target.value))} />
        </Field>
        <Field label="Описание" className="sm:col-span-2"><textarea className="input min-h-[60px]" value={f.description} onChange={(e) => set('description', e.target.value)} /></Field>
      </div>
      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{error}</p>}
    </Modal>
  )
}
