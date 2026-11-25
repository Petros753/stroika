import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Field, Modal } from '../ui'
import { useStore } from '../../store'
import { useVisibleProjects } from '../../lib/hooks'
import { PRIORITY_LABEL } from '../../domain/labels'
import type { Priority, RequestItem } from '../../domain/types'
import { TODAY, addDays } from '../../lib/date'
import { toast } from '../Toast'

export function RequestForm({
  open, onClose, defaultProjectId, defaultItems, onCreated,
}: { open: boolean; onClose: () => void; defaultProjectId?: string; defaultItems?: RequestItem[]; onCreated?: (id: string) => void }) {
  const projects = useVisibleProjects()
  const materials = useStore((s) => s.materials)
  const create = useStore((s) => s.createRequest)
  const [projectId, setProjectId] = useState(defaultProjectId ?? '')
  const [priority, setPriority] = useState<Priority>('normal')
  const [neededBy, setNeededBy] = useState(addDays(TODAY, 10))
  const [comment, setComment] = useState('')
  const [items, setItems] = useState<RequestItem[]>(defaultItems && defaultItems.length ? defaultItems : [{ materialId: materials[0].id, qty: 1 }])
  const [error, setError] = useState('')

  const pid = projectId || defaultProjectId || projects[0]?.id || ''

  function submit(send: boolean) {
    if (!pid) return setError('Выберите объект')
    const clean = items.filter((i) => i.qty > 0)
    if (clean.length === 0) return setError('Добавьте хотя бы один материал с количеством больше нуля')
    const ids = new Set(clean.map((i) => i.materialId))
    if (ids.size !== clean.length) return setError('Материал указан несколько раз — объедините позиции')
    if (neededBy < TODAY) return setError('Срок поставки не может быть в прошлом')
    const id = create({ projectId: pid, items: clean, priority, neededBy, comment: comment.trim() || undefined, submit: send })
    toast.ok(send ? 'Заявка создана и отправлена на согласование' : 'Черновик заявки сохранён')
    setError('')
    setItems([{ materialId: materials[0].id, qty: 1 }])
    setComment('')
    onCreated?.(id)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Новая заявка на закупку"
      wide
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Отмена</button>
          <button className="btn-secondary" onClick={() => submit(false)}>Сохранить черновик</button>
          <button className="btn-primary" onClick={() => submit(true)}>Отправить на согласование</button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Строительный объект" className="sm:col-span-3">
          <select className="input" value={pid} onChange={(e) => setProjectId(e.target.value)} disabled={!!defaultProjectId}>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Приоритет">
          <select className="input" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
            {(Object.keys(PRIORITY_LABEL) as Priority[]).map((k) => <option key={k} value={k}>{PRIORITY_LABEL[k]}</option>)}
          </select>
        </Field>
        <Field label="Нужно к дате">
          <input type="date" className="input" value={neededBy} min={TODAY} onChange={(e) => setNeededBy(e.target.value)} />
        </Field>
        <Field label="Комментарий">
          <input className="input" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Например: корпус 2, 14 этаж" />
        </Field>
      </div>

      <div className="mt-4">
        <div className="mb-1 flex items-center justify-between">
          <span className="label !mb-0">Материалы</span>
          <button className="btn-ghost !px-2 !py-1 text-brand-600" onClick={() => setItems([...items, { materialId: materials[0].id, qty: 1 }])}>
            <Plus size={14} /> Добавить позицию
          </button>
        </div>
        <div className="space-y-2">
          {items.map((it, idx) => {
            const mat = materials.find((m) => m.id === it.materialId)
            return (
              <div key={idx} className="flex items-center gap-2">
                <select className="input flex-1" value={it.materialId} onChange={(e) => setItems(items.map((x, i) => (i === idx ? { ...x, materialId: e.target.value } : x)))}>
                  {materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                <input
                  type="number" min={0} className="input !w-28" value={it.qty}
                  onChange={(e) => setItems(items.map((x, i) => (i === idx ? { ...x, qty: Number(e.target.value) } : x)))}
                />
                <span className="w-10 text-sm text-slate-500">{mat?.unit}</span>
                <button className="btn-ghost !p-1.5 text-red-600" disabled={items.length === 1} onClick={() => setItems(items.filter((_, i) => i !== idx))} aria-label="Удалить позицию">
                  <Trash2 size={15} />
                </button>
              </div>
            )
          })}
        </div>
      </div>
      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{error}</p>}
    </Modal>
  )
}
