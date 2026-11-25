import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, ChevronRight, Package, Truck, X } from 'lucide-react'
import clsx from 'clsx'
import { Badge, Modal } from '../ui'
import { useStore } from '../../store'
import { useCan, useUserName } from '../../lib/hooks'
import { ORDER_STATUS_LABEL, PRIORITY_LABEL, PRIORITY_TONE, REQUEST_STATUS_LABEL, REQUEST_STATUS_TONE } from '../../domain/labels'
import { formatMoney } from '../../lib/format'
import { formatDate } from '../../lib/date'
import { requestTotal } from '../../domain/calc'
import { toast } from '../Toast'

const STEPS = ['Заявка', 'Согласование', 'Поставщик и заказ', 'Поставка на склад']

function stepIndex(status: string): number {
  if (status === 'draft') return 0
  if (status === 'pending' || status === 'rejected') return 1
  if (status === 'approved') return 2
  if (status === 'ordered') return 3
  return 4
}

export function RequestDetail({ requestId, onClose }: { requestId: string | null; onClose: () => void }) {
  const navigate = useNavigate()
  const s = useStore()
  const name = useUserName()
  const canApprove = useCan('request.approve')
  const canSupplier = useCan('request.supplier')
  const canReceive = useCan('order.receive')
  const canCreate = useCan('request.create')
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')

  const r = s.requests.find((x) => x.id === requestId)
  if (!r) return <Modal open={false} onClose={onClose} title="" children={null} />
  const project = s.projects.find((p) => p.id === r.projectId)
  const order = s.orders.find((o) => o.requestId === r.id)
  const supplier = s.suppliers.find((x) => x.id === r.supplierId)
  const step = stepIndex(r.status)
  const ref = requestTotal(r.items, Object.fromEntries(s.materials.map((m) => [m.id, m.refPrice])))

  const comparison = s.suppliers
    .map((sup) => ({ sup, total: requestTotal(r.items, sup.prices), missing: r.items.filter((i) => sup.prices[i.materialId] === undefined).length }))
    .sort((a, b) => (a.total === null ? 1 : b.total === null ? -1 : a.total - b.total))
  const covering = comparison.filter((c) => c.total !== null)
  const cheapest = covering[0]?.sup.id
  const fastest = [...covering].sort((a, b) => a.sup.deliveryDays - b.sup.deliveryDays)[0]?.sup.id

  function close() { setRejecting(false); setReason(''); onClose() }

  return (
    <Modal open={!!requestId} onClose={close} title={`Заявка ${r.number}`} wide
      footer={<button className="btn-secondary" onClick={close}>Закрыть</button>}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge tone={REQUEST_STATUS_TONE[r.status]}>{REQUEST_STATUS_LABEL[r.status]}</Badge>
        <Badge tone={PRIORITY_TONE[r.priority]}>{PRIORITY_LABEL[r.priority]}</Badge>
        <span className="text-sm text-slate-500">{project?.name}</span>
      </div>

      <ol className="mb-5 flex items-center gap-1 overflow-x-auto text-xs">
        {STEPS.map((label, i) => (
          <li key={label} className="flex items-center gap-1">
            <span className={clsx('flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 font-medium',
              r.status === 'rejected' && i === 1 ? 'bg-red-100 text-red-700 dark:bg-red-500/15' :
              i < step ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15' : i === step ? 'bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800')}>
              {i < step && <Check size={12} />} {label}
            </span>
            {i < STEPS.length - 1 && <ChevronRight size={14} className="text-slate-300" />}
          </li>
        ))}
      </ol>

      <dl className="mb-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
        <div><dt className="label">Автор</dt><dd>{name(r.authorId)}</dd></div>
        <div><dt className="label">Снабженец</dt><dd>{name(r.responsibleId)}</dd></div>
        <div><dt className="label">Создана</dt><dd>{formatDate(r.createdAt)}</dd></div>
        <div><dt className="label">Нужно к</dt><dd>{formatDate(r.neededBy)}</dd></div>
      </dl>
      {r.comment && <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">Комментарий: {r.comment}</p>}
      {r.rejectReason && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">Причина отклонения: {r.rejectReason}</p>}

      <table className="mb-1 w-full text-sm">
        <thead><tr><th className="th">Материал</th><th className="th text-right">Кол-во</th><th className="th text-right">Ориент. цена</th></tr></thead>
        <tbody className="divide-y">
          {r.items.map((it) => {
            const m = s.materials.find((x) => x.id === it.materialId)!
            return (
              <tr key={it.materialId}>
                <td className="td">{m.name}</td>
                <td className="td text-right">{it.qty} {m.unit}</td>
                <td className="td text-right">{formatMoney(it.qty * m.refPrice)}</td>
              </tr>
            )
          })}
        </tbody>
        <tfoot><tr><td className="td font-medium" colSpan={2}>Итого (ориентировочно)</td><td className="td text-right font-semibold">{ref !== null ? formatMoney(ref) : '—'}</td></tr></tfoot>
      </table>

      {/* Действия по статусам */}
      {r.status === 'draft' && canCreate && (
        <div className="mt-4 flex gap-2">
          <button className="btn-primary" onClick={() => { s.submitRequest(r.id); toast.ok('Заявка отправлена на согласование') }}>Отправить на согласование</button>
          <button className="btn-secondary text-red-600" onClick={() => { s.deleteRequest(r.id); toast.ok('Черновик удалён'); close() }}>Удалить черновик</button>
        </div>
      )}
      {r.status === 'rejected' && canCreate && (
        <div className="mt-4"><button className="btn-primary" onClick={() => { s.submitRequest(r.id); toast.ok('Заявка отправлена повторно') }}>Отправить повторно</button></div>
      )}
      {r.status === 'pending' && (
        canApprove ? (
          <div className="mt-4">
            {!rejecting ? (
              <div className="flex gap-2">
                <button className="btn-primary" onClick={() => { s.approveRequest(r.id); toast.ok(`Заявка ${r.number} согласована`) }}><Check size={15} /> Согласовать</button>
                <button className="btn-secondary text-red-600" onClick={() => setRejecting(true)}><X size={15} /> Отклонить</button>
              </div>
            ) : (
              <div className="space-y-2">
                <input className="input" placeholder="Причина отклонения (обязательно)" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
                <div className="flex gap-2">
                  <button className="btn-danger" disabled={reason.trim().length < 3} onClick={() => { s.rejectRequest(r.id, reason.trim()); toast.ok('Заявка отклонена'); setRejecting(false); setReason('') }}>Подтвердить отклонение</button>
                  <button className="btn-secondary" onClick={() => setRejecting(false)}>Отмена</button>
                </div>
              </div>
            )}
          </div>
        ) : <p className="mt-4 text-sm text-slate-500">Ожидает согласования руководителем. У вашей роли нет права согласования.</p>
      )}

      {r.status === 'approved' && (
        <div className="mt-5">
          <h4 className="mb-2 text-sm font-semibold">Сравнение поставщиков</h4>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead><tr><th className="th">Поставщик</th><th className="th text-right">Итого</th><th className="th text-right">Срок</th><th className="th text-right">Рейтинг</th><th className="th" /></tr></thead>
              <tbody className="divide-y">
                {comparison.map(({ sup, total, missing }) => (
                  <tr key={sup.id} className={total === null ? 'opacity-60' : ''}>
                    <td className="td">
                      <div className="font-medium">{sup.name}</div>
                      <div className="mt-0.5 flex gap-1">
                        {sup.id === cheapest && <Badge tone="green">Дешевле всех</Badge>}
                        {sup.id === fastest && <Badge tone="blue">Быстрее всех</Badge>}
                        {missing > 0 && <Badge tone="slate">Нет позиций: {missing}</Badge>}
                      </div>
                    </td>
                    <td className="td text-right">{total === null ? '—' : formatMoney(total)}</td>
                    <td className="td text-right">{sup.deliveryDays} дн.</td>
                    <td className="td text-right">{sup.rating.toFixed(1)}</td>
                    <td className="td text-right">
                      {canSupplier && total !== null && (
                        <button className="btn-primary !py-1" onClick={() => { const id = s.chooseSupplier(r.id, sup.id); if (id) toast.ok(`Сформирован заказ у «${sup.name}»`) }}>Выбрать</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!canSupplier && <p className="mt-2 text-sm text-slate-500">Поставщика выбирает снабженец.</p>}
        </div>
      )}

      {(r.status === 'ordered' || r.status === 'delivered') && order && (
        <div className="mt-5 rounded-lg border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold">Заказ {order.number}</div>
              <div className="text-sm text-slate-500">{supplier?.name} · ожидается {formatDate(order.expectedDate)} · {formatMoney(order.items.reduce((a, i) => a + i.qty * i.price, 0))}</div>
            </div>
            <Badge tone={order.status === 'delivered' ? 'green' : order.status === 'shipped' ? 'violet' : 'blue'}>{ORDER_STATUS_LABEL[order.status]}</Badge>
          </div>
          {canReceive && order.status === 'placed' && (
            <button className="btn-secondary mt-3" onClick={() => { s.advanceOrder(order.id); toast.ok('Заказ отмечен как отправленный') }}><Truck size={15} /> Отметить отгрузку</button>
          )}
          {canReceive && order.status !== 'delivered' && (
            <button className="btn-primary ml-2 mt-3" onClick={() => { s.receiveOrder(order.id); toast.ok('Материалы оприходованы на склад объекта') }}><Package size={15} /> Принять на склад</button>
          )}
          {order.status === 'delivered' && (
            <button className="btn-secondary mt-3" onClick={() => { close(); navigate('/warehouse') }}>Открыть склад</button>
          )}
        </div>
      )}
    </Modal>
  )
}
