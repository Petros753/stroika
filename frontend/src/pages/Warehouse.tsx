import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertTriangle, ArrowDownToLine, ArrowRightLeft, ArrowUpFromLine, Search, ShoppingCart } from 'lucide-react'
import { Badge, PageHeader, Tabs } from '../components/ui'
import { MovementModal, type MoveMode } from '../components/warehouse/MovementModal'
import { RequestForm } from '../components/procurement/RequestForm'
import { useCurrentUser, useStore } from '../store'
import { useCan, useUserName, useVisibleProjects } from '../lib/hooks'
import { formatDate } from '../lib/date'
import { formatNumber } from '../lib/format'
import { procurementNeeds } from '../domain/calc'

export default function WarehousePage({ forProjectId }: { forProjectId?: string }) {
  const [params] = useSearchParams()
  const user = useCurrentUser()
  const s = useStore()
  const canMove = useCan('stock.move')
  const name = useUserName()
  const projects = useVisibleProjects()
  const visibleIds = new Set(projects.map((p) => p.id))
  const canCentral = ['admin', 'director', 'pm', 'supply', 'accountant'].includes(user.role)

  const warehouses = s.warehouses.filter((w) => (forProjectId ? w.projectId === forProjectId : w.projectId === null ? canCentral : visibleIds.has(w.projectId)))
  const [whId, setWhId] = useState<string>(params.get('wh') ?? '')
  const current = warehouses.find((w) => w.id === whId) ?? warehouses[0]
  const [tab, setTab] = useState<'stock' | 'history'>('stock')
  const [q, setQ] = useState(params.get('q') ?? '')
  const [mode, setMode] = useState<MoveMode | null>(null)
  const [moveMat, setMoveMat] = useState<string | undefined>()
  const [reqOpen, setReqOpen] = useState(false)
  const [reqKey, setReqKey] = useState(0)

  const rows = useMemo(
    () => s.stock
      .filter((x) => x.warehouseId === current?.id)
      .map((x) => ({ ...x, material: s.materials.find((m) => m.id === x.materialId)! }))
      .filter((x) => !q || x.material.name.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => Number(b.qty < b.minQty) - Number(a.qty < a.minQty) || a.material.name.localeCompare(b.material.name)),
    [s.stock, s.materials, current?.id, q],
  )
  const needs = procurementNeeds(s).filter((n) => current?.projectId && n.projectId === current.projectId && n.toBuy > 0)
  const movements = s.movements.filter((m) => m.fromWarehouseId === current?.id || m.toWarehouseId === current?.id)
  const whName = (id?: string) => s.warehouses.find((w) => w.id === id)?.name.replace('Склад объекта: ', '') ?? '—'

  if (!current) return <PageHeader title="Склад" subtitle="Нет доступных складов" />
  const lowCount = rows.filter((r) => r.qty < r.minQty).length

  return (
    <div>
      {!forProjectId && (
        <PageHeader
          title="Склад"
          subtitle="Центральный склад, склады объектов, движение материалов"
        />
      )}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {!forProjectId && (
          <select className="input !w-72" value={current.id} onChange={(e) => setWhId(e.target.value)}>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        )}
        <div className="relative">
          <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input !w-56 !pl-8" placeholder="Поиск материала" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex-1" />
        {canMove && (
          <>
            <button className="btn-secondary" onClick={() => { setMoveMat(undefined); setMode('in') }}><ArrowDownToLine size={15} /> Приход</button>
            <button className="btn-secondary" onClick={() => { setMoveMat(undefined); setMode('out') }}><ArrowUpFromLine size={15} /> Выдача</button>
            <button className="btn-secondary" onClick={() => { setMoveMat(undefined); setMode('transfer') }}><ArrowRightLeft size={15} /> Перемещение</button>
          </>
        )}
      </div>

      {lowCount > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-500/30 dark:bg-amber-500/10">
          <AlertTriangle size={18} className="text-amber-600" />
          <div className="flex-1 text-sm">
            <b>Недостаточно материалов: {lowCount} поз.</b>
            {needs.length > 0
              ? ` К закупке с учётом уже оформленных заявок: ${needs.length} поз.`
              : current.projectId ? ' Все недостающие позиции уже закрыты заявками.' : ''}
          </div>
          {needs.length > 0 && current.projectId && (
            <button className="btn-primary" onClick={() => { setReqKey((k) => k + 1); setReqOpen(true) }}><ShoppingCart size={15} /> Создать заявку на недостачу</button>
          )}
        </div>
      )}

      <Tabs value={tab} onChange={setTab} tabs={[{ key: 'stock', label: 'Остатки' }, { key: 'history', label: 'История движения' }]} />

      {tab === 'stock' && (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead className="border-b"><tr>
              <th className="th">Материал</th><th className="th text-right">Остаток</th><th className="th text-right">Минимум</th><th className="th">Состояние</th><th className="th" />
            </tr></thead>
            <tbody className="divide-y">
              {rows.length === 0 && <tr><td className="td text-slate-500" colSpan={5}>Нет позиций</td></tr>}
              {rows.map((r) => {
                const low = r.qty < r.minQty
                return (
                  <tr key={r.materialId} className={low ? 'bg-amber-50/50 dark:bg-amber-500/5' : ''}>
                    <td className="td font-medium">{r.material.name}</td>
                    <td className="td text-right">{formatNumber(r.qty)} {r.material.unit}</td>
                    <td className="td text-right text-slate-500">{formatNumber(r.minQty)}</td>
                    <td className="td">{r.qty === 0 ? <Badge tone="red">Нет в наличии</Badge> : low ? <Badge tone="amber">Не хватает {formatNumber(r.minQty - r.qty)}</Badge> : <Badge tone="green">В норме</Badge>}</td>
                    <td className="td text-right">
                      {canMove && (
                        <>
                          <button className="btn-ghost !px-2 !py-1" onClick={() => { setMoveMat(r.materialId); setMode('out') }}>Выдать</button>
                          <button className="btn-ghost !px-2 !py-1" onClick={() => { setMoveMat(r.materialId); setMode('transfer') }}>Переместить</button>
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'history' && (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead className="border-b"><tr><th className="th">Дата</th><th className="th">Операция</th><th className="th">Материал</th><th className="th text-right">Кол-во</th><th className="th">Откуда → куда</th><th className="th">Основание</th><th className="th">Кто</th></tr></thead>
            <tbody className="divide-y">
              {movements.length === 0 && <tr><td className="td text-slate-500" colSpan={7}>Движений нет</td></tr>}
              {movements.map((m) => {
                const mat = s.materials.find((x) => x.id === m.materialId)
                const incoming = m.toWarehouseId === current.id
                return (
                  <tr key={m.id}>
                    <td className="td">{formatDate(m.date)}</td>
                    <td className="td"><Badge tone={m.type === 'in' ? 'green' : m.type === 'out' ? 'amber' : 'violet'}>{m.type === 'in' ? 'Приход' : m.type === 'out' ? 'Выдача' : incoming ? 'Перемещение (получено)' : 'Перемещение (отправлено)'}</Badge></td>
                    <td className="td">{mat?.name}</td>
                    <td className="td text-right">{incoming ? '+' : '−'}{formatNumber(m.qty)} {mat?.unit}</td>
                    <td className="td text-xs text-slate-500">{m.fromWarehouseId ? whName(m.fromWarehouseId) : 'Поставщик'} → {m.toWarehouseId ? whName(m.toWarehouseId) : 'Работы'}</td>
                    <td className="td">{m.note}</td>
                    <td className="td">{name(m.userId)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {mode && (
        <MovementModal
          key={mode + moveMat + current.id}
          mode={mode} onClose={() => setMode(null)}
          warehouses={forProjectId ? s.warehouses.filter((w) => w.projectId === forProjectId || w.projectId === null) : warehouses}
          defaultWarehouseId={current.id} defaultMaterialId={moveMat}
        />
      )}
      {current.projectId && (
        <RequestForm
          key={reqKey} open={reqOpen} onClose={() => setReqOpen(false)} defaultProjectId={current.projectId}
          defaultItems={needs.map((n) => ({ materialId: n.materialId, qty: Math.ceil(n.toBuy) }))}
        />
      )}
    </div>
  )
}
