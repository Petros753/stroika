import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
import { Badge, PageHeader, Tabs, Table } from '../components/ui'
import { RequestForm } from '../components/procurement/RequestForm'
import { RequestDetail } from '../components/procurement/RequestDetail'
import { RequestsTable } from '../components/procurement/RequestsTable'
import { useStore } from '../store'
import { useCan, useVisibleProjects } from '../lib/hooks'
import { ORDER_STATUS_LABEL, REQUEST_STATUS_LABEL } from '../domain/labels'
import type { RequestStatus } from '../domain/types'
import { formatMoney, shortName } from '../lib/format'
import { formatDate } from '../lib/date'
import { toast } from '../components/Toast'

type Tab = 'requests' | 'orders' | 'suppliers'

export default function Procurement() {
  const [params, setParams] = useSearchParams()
  const [tab, setTab] = useState<Tab>('requests')
  const [creating, setCreating] = useState(false)
  const [openId, setOpenId] = useState<string | null>(params.get('open'))
  const [status, setStatus] = useState<RequestStatus | 'all'>('all')
  const [q, setQ] = useState('')
  const projects = useVisibleProjects()
  const projectFilter = params.get('project') ?? 'all'
  const s = useStore()
  const canCreate = useCan('request.create')
  const canReceive = useCan('order.receive')
  const ids = new Set(projects.map((p) => p.id))

  const requests = useMemo(
    () => s.requests
      .filter((r) => ids.has(r.projectId) && (projectFilter === 'all' || r.projectId === projectFilter))
      .filter((r) => status === 'all' || r.status === status)
      .filter((r) => !q || `${r.number} ${r.comment ?? ''}`.toLowerCase().includes(q.toLowerCase()) ||
        r.items.some((i) => s.materials.find((m) => m.id === i.materialId)?.name.toLowerCase().includes(q.toLowerCase())))
      .sort((a, b) => b.number.localeCompare(a.number)),
    [s.requests, s.materials, projectFilter, status, q, projects],
  )
  const orders = s.orders.filter((o) => ids.has(o.projectId) && (projectFilter === 'all' || o.projectId === projectFilter))
  const counts = (st: RequestStatus) => s.requests.filter((r) => ids.has(r.projectId) && r.status === st).length

  return (
    <div>
      <PageHeader
        title="Снабжение"
        subtitle="Заявка прораба → согласование → выбор поставщика → заказ → приёмка на склад"
        actions={canCreate && <button className="btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> Новая заявка</button>}
      />
      <Tabs
        value={tab} onChange={setTab}
        tabs={[
          { key: 'requests', label: 'Заявки', badge: counts('pending') },
          { key: 'orders', label: 'Заказы и поставки' },
          { key: 'suppliers', label: 'Поставщики и цены' },
        ]}
      />

      {tab === 'requests' && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className="input !w-56 !pl-8" placeholder="Номер или материал" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <select className="input !w-60" value={projectFilter} onChange={(e) => { const p = new URLSearchParams(params); if (e.target.value === 'all') p.delete('project'); else p.set('project', e.target.value); setParams(p) }}>
              <option value="all">Все объекты</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <div className="flex flex-wrap gap-1">
              <button className={status === 'all' ? 'btn-primary !py-1' : 'btn-secondary !py-1'} onClick={() => setStatus('all')}>Все</button>
              {(Object.keys(REQUEST_STATUS_LABEL) as RequestStatus[]).map((k) => (
                <button key={k} className={status === k ? 'btn-primary !py-1' : 'btn-secondary !py-1'} onClick={() => setStatus(k)}>
                  {REQUEST_STATUS_LABEL[k]} <span className="opacity-70">{counts(k)}</span>
                </button>
              ))}
            </div>
          </div>
          <RequestsTable requests={requests} onOpen={setOpenId} />
        </>
      )}

      {tab === 'orders' && (
        <Table>
          <thead className="border-b"><tr>
            <th className="th">Заказ</th><th className="th">Заявка</th><th className="th">Объект</th><th className="th">Поставщик</th>
            <th className="th text-right">Сумма</th><th className="th">Ожидается</th><th className="th">Статус</th><th className="th" />
          </tr></thead>
          <tbody className="divide-y">
            {orders.length === 0 && <tr><td className="td text-slate-500" colSpan={8}>Заказов пока нет</td></tr>}
            {orders.map((o) => {
              const req = s.requests.find((r) => r.id === o.requestId)
              return (
                <tr key={o.id}>
                  <td className="td font-medium">{o.number}</td>
                  <td className="td"><button className="text-brand-600 hover:underline" onClick={() => setOpenId(o.requestId)}>{req?.number}</button></td>
                  <td className="td">{shortName(s.projects.find((p) => p.id === o.projectId)?.name ?? '')}</td>
                  <td className="td">{s.suppliers.find((x) => x.id === o.supplierId)?.name}</td>
                  <td className="td text-right">{formatMoney(o.items.reduce((a, i) => a + i.qty * i.price, 0))}</td>
                  <td className="td">{formatDate(o.expectedDate)}</td>
                  <td className="td"><Badge tone={o.status === 'delivered' ? 'green' : o.status === 'shipped' ? 'violet' : 'blue'}>{ORDER_STATUS_LABEL[o.status]}</Badge></td>
                  <td className="td text-right">
                    {canReceive && o.status !== 'delivered' && (
                      <button className="btn-primary !py-1" onClick={() => { s.receiveOrder(o.id); toast.ok(`Заказ ${o.number} принят на склад`) }}>Принять на склад</button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </Table>
      )}

      {tab === 'suppliers' && (
        <Table>
          <thead className="border-b"><tr>
            <th className="th">Материал</th>
            {s.suppliers.map((sp) => <th key={sp.id} className="th text-right">{sp.name.replace(/^(ООО|АО) /, '')}</th>)}
          </tr></thead>
          <tbody className="divide-y">
            {s.materials.map((m) => {
              const prices = s.suppliers.map((sp) => sp.prices[m.id]).filter((x): x is number => x !== undefined)
              const min = Math.min(...prices)
              return (
                <tr key={m.id}>
                  <td className="td">{m.name}, {m.unit}</td>
                  {s.suppliers.map((sp) => {
                    const p = sp.prices[m.id]
                    return <td key={sp.id} className={'td text-right ' + (p === min ? 'font-semibold text-emerald-600' : '')}>{p === undefined ? <span className="text-slate-300">—</span> : formatMoney(p)}</td>
                  })}
                </tr>
              )
            })}
            <tr className="bg-slate-50 dark:bg-slate-800/40">
              <td className="td font-medium">Срок поставки / рейтинг</td>
              {s.suppliers.map((sp) => <td key={sp.id} className="td text-right text-xs">{sp.deliveryDays} дн. · ★ {sp.rating.toFixed(1)}</td>)}
            </tr>
          </tbody>
        </Table>
      )}

      <RequestForm open={creating} onClose={() => setCreating(false)} defaultProjectId={projectFilter !== 'all' ? projectFilter : undefined} onCreated={(id) => setOpenId(id)} />
      <RequestDetail requestId={openId} onClose={() => { setOpenId(null); if (params.get('open')) { const p = new URLSearchParams(params); p.delete('open'); setParams(p) } }} />
    </div>
  )
}
