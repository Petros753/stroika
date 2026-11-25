import { useEffect, useMemo, useState } from 'react'
import { Download, FileText, Sparkles } from 'lucide-react'
import clsx from 'clsx'
import { Badge, Modal } from '../ui'
import { toast } from '../Toast'
import { useCan } from '../../lib/hooks'
import { ROW_STATUS_LABEL, reconCsv, reconSummary, reconcile, type RowStatus } from '../../domain/estimates'
import type { Estimate } from '../../domain/types'
import { formatMoney, formatNumber } from '../../lib/format'
import { download } from '../../lib/download'
import type { Tone } from '../../domain/labels'

const TONE: Record<RowStatus, Tone> = { match: 'green', qty: 'amber', price: 'amber', both: 'red', only_a: 'red', only_b: 'violet' }
const FILTERS: { key: RowStatus | 'all' | 'diff'; label: string }[] = [
  { key: 'all', label: 'Все' }, { key: 'diff', label: 'Только расхождения' }, { key: 'qty', label: 'Объём' }, { key: 'price', label: 'Цена' },
  { key: 'only_a', label: 'Нет в B' }, { key: 'only_b', label: 'Нет в A' }, { key: 'match', label: 'Совпадают' },
]

const label = (e: Estimate) => `${e.name} v${e.version} · ${e.source}`

/** Сверка двух смет одного объекта. optionsA/optionsB задают, какие сметы можно выбирать. */
export function ReconcileView({
  optionsA, optionsB, titleA, titleB, budget,
}: { optionsA: Estimate[]; optionsB: Estimate[]; titleA: string; titleB: string; budget?: number }) {
  const [aId, setA] = useState('')
  const [bId, setB] = useState('')
  const [filter, setFilter] = useState<RowStatus | 'all' | 'diff'>('diff')
  const [pdf, setPdf] = useState(false)
  const canCompare = useCan('estimate.compare')

  const idsKey = optionsA.map((e) => e.id).join() + '|' + optionsB.map((e) => e.id).join()
  useEffect(() => {
    // выбор по умолчанию: последняя версия A и самая свежая смета из B, не равная A
    const a = [...optionsA].sort((x, y) => y.version - x.version || y.date.localeCompare(x.date))[0]
    const b = [...optionsB].filter((e) => e.id !== a?.id).sort((x, y) => y.date.localeCompare(x.date) || y.version - x.version)[0]
    setA(a?.id ?? '')
    setB(b?.id ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey])

  const A = optionsA.find((e) => e.id === aId)
  const B = optionsB.find((e) => e.id === bId)
  const rec = useMemo(() => (A && B ? reconcile(A, B) : null), [A, B])

  if (!optionsA.length || !optionsB.length) return <div className="card p-6 text-sm text-slate-500">Для сверки нужны минимум две сметы по объекту.</div>
  if (!A || !B || !rec) return <div className="card p-6 text-sm text-slate-500">Выберите две сметы для сверки.</div>
  if (!canCompare) return <div className="card p-6 text-sm text-slate-500">Сверка доступна сметчику, руководителю проекта, директору и администратору.</div>

  const rows = rec.rows.filter((r) => (filter === 'all' ? true : filter === 'diff' ? r.status !== 'match' || r.matchedBy === 'name' : filter === 'qty' ? r.status === 'qty' || r.status === 'both' : filter === 'price' ? r.status === 'price' || r.status === 'both' : r.status === filter))
  const summary = reconSummary(rec, label(A), label(B), budget)
  const exportCsv = () => {
    download(`sverka_${A.id}_${B.id}.csv`, reconCsv(rec, label(A), label(B)), 'text/csv;charset=utf-8')
    toast.ok('Отчёт сверки выгружен в CSV')
  }

  return (
    <div className="space-y-4">
      <div className="card grid gap-3 p-4 md:grid-cols-[1fr_auto_1fr] md:items-end">
        <div>
          <label className="label">{titleA}</label>
          <select className="input" value={aId} onChange={(e) => setA(e.target.value)}>{optionsA.map((e) => <option key={e.id} value={e.id}>{label(e)}</option>)}</select>
        </div>
        <button className="btn-secondary" title="Поменять местами" onClick={() => { setA(bId); setB(aId) }} disabled={!optionsA.some((e) => e.id === bId) || !optionsB.some((e) => e.id === aId)}>⇄</button>
        <div>
          <label className="label">{titleB}</label>
          <select className="input" value={bId} onChange={(e) => setB(e.target.value)}>{optionsB.map((e) => <option key={e.id} value={e.id}>{label(e)}</option>)}</select>
        </div>
      </div>

      {A.id === B.id && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">Выбрана одна и та же смета — выберите разные.</p>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi title="Итого A" value={formatMoney(rec.totalA)} />
        <Kpi title="Итого B" value={formatMoney(rec.totalB)} />
        <Kpi title="Разница B − A" value={`${rec.diff >= 0 ? '+' : '−'}${formatMoney(Math.abs(rec.diff))}`} sub={`${rec.diffPct >= 0 ? '+' : ''}${rec.diffPct.toFixed(1).replace('.', ',')} %`} tone={Math.abs(rec.diffPct) < 1 ? 'green' : rec.diffPct > 0 ? 'red' : 'amber'} />
        <Kpi title="Подозрительные дубли" value={`${rec.duplicatesA.length + rec.duplicatesB.length} гр.`} sub={rec.duplicatesCost ? formatMoney(rec.duplicatesCost) : 'не найдено'} tone={rec.duplicatesCost ? 'amber' : 'green'} />
      </div>

      <div className="card p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><Sparkles size={16} className="text-brand-600" />Выводы по сверке <Badge>по правилам, не LLM</Badge></div>
        <ul className="list-disc space-y-1 pl-5 text-sm">{summary.map((t) => <li key={t}>{t}</li>)}</ul>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn-primary" onClick={exportCsv}><Download size={15} />Отчёт CSV</button>
          <button className="btn-secondary" onClick={() => setPdf(true)}><FileText size={15} />Отчёт PDF</button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)} className={clsx('rounded-full border px-3 py-1 text-xs font-medium transition', filter === f.key ? 'border-brand-600 bg-brand-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800')}>
            {f.label}{f.key !== 'all' && f.key !== 'diff' && f.key !== 'qty' && f.key !== 'price' ? ` · ${rec.counts[f.key]}` : ''}
          </button>
        ))}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse">
          <thead className="border-b"><tr>
            <th className="th">Статус</th><th className="th">Позиция</th><th className="th text-right">Объём A</th><th className="th text-right">Объём B</th>
            <th className="th text-right">Цена A</th><th className="th text-right">Цена B</th><th className="th text-right">Δ стоимость</th>
          </tr></thead>
          <tbody className="divide-y">
            {rows.length === 0 && <tr><td className="td text-slate-500" colSpan={7}>Нет строк по выбранному фильтру</td></tr>}
            {rows.map((r) => {
              const it = r.a ?? r.b!
              return (
                <tr key={r.key}>
                  <td className="td"><Badge tone={TONE[r.status]}>{ROW_STATUS_LABEL[r.status]}</Badge>{r.suspectedDuplicate && <Badge tone="amber" className="ml-1">дубль?</Badge>}</td>
                  <td className="td"><div className="font-medium">{it.name}</div><div className="text-xs text-slate-500">{it.code} · {it.unit}{r.note ? ` · ${r.note}` : ''}</div></td>
                  <td className="td text-right">{r.a ? formatNumber(r.a.qty) : '—'}</td>
                  <td className={clsx('td text-right', (r.status === 'qty' || r.status === 'both') && 'font-semibold text-amber-700 dark:text-amber-300')}>{r.b ? formatNumber(r.b.qty) : '—'}</td>
                  <td className="td whitespace-nowrap text-right">{r.a ? formatMoney(r.a.price) : '—'}</td>
                  <td className={clsx('td whitespace-nowrap text-right', (r.status === 'price' || r.status === 'both') && 'font-semibold text-amber-700 dark:text-amber-300')}>{r.b ? formatMoney(r.b.price) : '—'}</td>
                  <td className={clsx('td whitespace-nowrap text-right font-medium', r.dCost > 0.5 ? 'text-red-600' : r.dCost < -0.5 ? 'text-emerald-600' : 'text-slate-400')}>{Math.abs(r.dCost) < 0.5 ? '0' : `${r.dCost > 0 ? '+' : '−'}${formatMoney(Math.abs(r.dCost))}`}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <Modal open={pdf} onClose={() => setPdf(false)} title="Отчёт PDF (демо)" footer={<button className="btn-primary" onClick={() => setPdf(false)}>Понятно</button>}>
        <p className="text-sm">В демо-версии PDF не формируется — чтобы не выдавать заглушку за настоящий файл. Реальный отчёт сверки доступен в CSV (кнопка «Отчёт CSV», открывается в Excel).</p>
        <p className="mt-2 text-sm text-slate-500">В рабочей версии PDF формирует backend (WeasyPrint/ReportLab) по тем же данным сверки.</p>
      </Modal>
    </div>
  )
}

function Kpi({ title, value, sub, tone }: { title: string; value: string; sub?: string; tone?: 'green' | 'amber' | 'red' }) {
  const c = tone === 'red' ? 'text-red-600' : tone === 'amber' ? 'text-amber-600' : tone === 'green' ? 'text-emerald-600' : ''
  return (
    <div className="card p-4">
      <div className="text-xs font-medium text-slate-500">{title}</div>
      <div className={clsx('mt-1 text-lg font-semibold', c)}>{value}</div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
  )
}
