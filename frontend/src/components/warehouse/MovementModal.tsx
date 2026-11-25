import { useState } from 'react'
import { Field, Modal } from '../ui'
import { useStore } from '../../store'
import { toast } from '../Toast'
import type { Warehouse } from '../../domain/types'

export type MoveMode = 'in' | 'out' | 'transfer'

const TITLE: Record<MoveMode, string> = { in: 'Приход материалов', out: 'Выдача материалов', transfer: 'Перемещение между складами' }

export function MovementModal({
  mode, onClose, warehouses, defaultWarehouseId, defaultMaterialId,
}: { mode: MoveMode | null; onClose: () => void; warehouses: Warehouse[]; defaultWarehouseId?: string; defaultMaterialId?: string }) {
  const materials = useStore((s) => s.materials)
  const stock = useStore((s) => s.stock)
  const receive = useStore((s) => s.receiveStock)
  const issue = useStore((s) => s.issueStock)
  const transfer = useStore((s) => s.transferStock)
  const [from, setFrom] = useState(defaultWarehouseId ?? warehouses[0]?.id ?? '')
  const [to, setTo] = useState('')
  const [materialId, setMaterialId] = useState(defaultMaterialId ?? materials[0].id)
  const [qty, setQty] = useState(1)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  if (!mode) return null
  const wh = defaultWarehouseId && warehouses.some((w) => w.id === defaultWarehouseId) ? from : (from || warehouses[0]?.id)
  const target = to || warehouses.find((w) => w.id !== wh)?.id || ''
  const available = stock.find((x) => x.warehouseId === wh && x.materialId === materialId)?.qty ?? 0
  const unit = materials.find((m) => m.id === materialId)?.unit

  function submit() {
    if (!(qty > 0)) return setError('Количество должно быть больше нуля')
    let err: string | null = null
    if (mode === 'in') receive({ warehouseId: wh, materialId, qty, note: note || 'Приход вручную' })
    else if (mode === 'out') err = issue({ warehouseId: wh, materialId, qty, note: note || 'Выдача в работу' })
    else err = transfer({ fromId: wh, toId: target, materialId, qty, note: note || 'Перемещение' })
    if (err) return setError(err)
    toast.ok(TITLE[mode!] + ' выполнено')
    setError(''); setQty(1); setNote('')
    onClose()
  }

  return (
    <Modal open onClose={onClose} title={TITLE[mode]}
      footer={<><button className="btn-secondary" onClick={onClose}>Отмена</button><button className="btn-primary" onClick={submit}>Выполнить</button></>}>
      <div className="grid grid-cols-1 gap-3">
        <Field label={mode === 'transfer' ? 'Склад-отправитель' : 'Склад'}>
          <select className="input" value={wh} onChange={(e) => setFrom(e.target.value)}>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </Field>
        {mode === 'transfer' && (
          <Field label="Склад-получатель">
            <select className="input" value={target} onChange={(e) => setTo(e.target.value)}>
              {warehouses.filter((w) => w.id !== wh).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="Материал">
          <select className="input" value={materialId} onChange={(e) => setMaterialId(e.target.value)}>
            {materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </Field>
        <Field label={`Количество, ${unit}${mode !== 'in' ? ` (доступно: ${available})` : ''}`}>
          <input type="number" min={0} className="input" value={qty} onChange={(e) => setQty(Number(e.target.value))} />
        </Field>
        <Field label="Основание / комментарий">
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Например: армирование перекрытия" />
        </Field>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{error}</p>}
      </div>
    </Modal>
  )
}
