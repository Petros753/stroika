import { useMemo, useState } from 'react'
import { Download, Pencil, RotateCcw, Save, Search, Trash2 } from 'lucide-react'
import { Badge, Modal } from '../ui'
import { Confirm } from '../Confirm'
import { toast } from '../Toast'
import { useStore } from '../../store'
import { useCan } from '../../lib/hooks'
import { correctionSummary, estimateCsv, estimateTotal, findDuplicates, groupBySection, itemCost } from '../../domain/estimates'
import type { EstimateItem } from '../../domain/types'
import { formatMoney, formatNumber } from '../../lib/format'
import { formatDate } from '../../lib/date'
import { download } from '../../lib/download'

export function EstimateView({ id, onClose, onOpen }: { id: string | null; onClose: () => void; onOpen?: (id: string) => void }) {
  const est = useStore((s) => s.estimates.find((e) => e.id === id))
  const project = useStore((s) => s.projects.find((p) => p.id === est?.projectId))
  const remove = useStore((s) => s.removeEstimate)
  const canEdit = useCan('estimate.upload')
  const [q, setQ] = useState('')
  const [confirm, setConfirm] = useState(false)
  const saveCorrection = useStore((s) => s.saveEstimateCorrection)
  const canCorrect = useCan('estimate.upload')
  /** Черновик корректировки: null — режим просмотра */
  const [draft, setDraft] = useState<EstimateItem[] | null>(null)
  const startCorrection = () => setDraft(est ? est.items.map((i) => ({ ...i })) : null)
  const patch = (itemId: string, p: Partial<EstimateItem>) => setDraft((d) => d && d.map((i) => (i.id === itemId ? { ...i, ...p } : i)))
  const summary = est && draft ? correctionSummary(est, draft) : null
  const orig = useMemo(() => new Map((est?.items ?? []).map((i) => [i.id, i])), [est])

  const dupIds = useMemo(() => new Set(est ? findDuplicates(est.items).flatMap((g) => g.items.slice(1).map((i) => i.id)) : []), [est])
  const groups = useMemo(() => {
    if (!est) return []
    const ql = q.trim().toLowerCase()
    const src = draft ?? est.items
    const items = ql ? src.filter((i) => i.name.toLowerCase().includes(ql) || i.code.toLowerCase().includes(ql)) : src
    return groupBySection(items)
  }, [est, q, draft])

  if (!est) return null
  return (
    <>
      <Modal
        open
        wide
        onClose={onClose}
        xl={!!draft}
        title={`${est.name} · v${est.version}${draft ? ' — корректировка' : ''}`}
        footer={draft && summary ? (
          <>
            <span className="mr-auto self-center text-sm">
              Исключено: <b>{summary.excluded}</b> · изменён объём: <b>{summary.changed}</b> · итог: {formatMoney(summary.before)} → <b>{formatMoney(summary.after)}</b>
              <span className={summary.after - summary.before < 0 ? ' text-emerald-600' : ' text-red-600'}> ({summary.after - summary.before >= 0 ? '+' : ''}{formatMoney(summary.after - summary.before)})</span>
            </span>
            <button className="btn-secondary" onClick={() => setDraft(null)}>Отмена</button>
            <button
              className="btn-primary"
              disabled={draft.every((i) => !!i.excluded === !!orig.get(i.id)?.excluded && i.qty === orig.get(i.id)?.qty)}
              onClick={() => {
                const note = `Корректировка v${est.version}: исключено ${summary.excluded}, изменено ${summary.changed}`
                const nid = saveCorrection(est.id, draft, note)
                setDraft(null)
                toast.ok('Сохранена новая версия сметы. Сравнить с исходной можно в «Сверке»')
                onOpen?.(nid)
              }}
            ><Save size={15} />Сохранить как новую версию</button>
          </>
        ) : (
          <>
            {canEdit && <button className="btn-secondary mr-auto text-red-600" onClick={() => setConfirm(true)}><Trash2 size={15} />Удалить</button>}
            {canCorrect && <button className="btn-secondary" onClick={startCorrection}><Pencil size={15} />Корректировка</button>}
            <button className="btn-secondary" onClick={() => { download(`smeta_${est.id}.csv`, estimateCsv(est), 'text/csv;charset=utf-8'); toast.ok('Смета выгружена в CSV (открывается в Excel)') }}><Download size={15} />Выгрузить CSV</button>
            <button className="btn-primary" onClick={onClose}>Закрыть</button>
          </>
        )}
      >
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <Badge tone="blue">{est.source}</Badge>
          <span className="text-slate-500">{project?.name} · {formatDate(est.date)} · {est.items.length} поз.</span>
          <span className="ml-auto font-semibold">Итого: {formatMoney(estimateTotal(est))}</span>
        </div>
        {est.note && !draft && <p className="mb-3 rounded-lg bg-blue-50 p-2 text-xs text-blue-800 dark:bg-blue-500/10 dark:text-blue-300">{est.note}. Исключённые работы показаны зачёркнутыми и не входят в итог, сверку и КС-2.</p>}
        {draft && <p className="mb-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">Снимите галочку, чтобы исключить работу, или измените объём. Исходная версия не меняется — сохраняется новая версия сметы.</p>}
        <div className="relative mb-3">
          <Search size={15} className="absolute left-2.5 top-2.5 text-slate-400" />
          <input className="input pl-8" placeholder="Поиск по шифру или наименованию" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {dupIds.size > 0 && <p className="mb-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">В смете найдены возможные дубли позиций ({dupIds.size}) — отмечены в списке.</p>}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse">
            <thead className="border-b"><tr>{draft && <th className="th w-8" title="Включена в смету">Вкл.</th>}<th className="th">Шифр</th><th className="th">Наименование</th><th className="th">Ед.</th><th className="th text-right">Объём</th><th className="th text-right">Цена</th><th className="th text-right">Стоимость</th></tr></thead>
            {groups.map((g) => (
              <tbody key={g.section} className="divide-y">
                <tr className="bg-slate-50 dark:bg-slate-800/50"><td className="td font-semibold" colSpan={draft ? 6 : 5}>{g.section}</td><td className="td text-right font-semibold">{formatMoney(g.total)}</td></tr>
                {g.items.map((i) => (
                  <tr key={i.id} className={i.excluded ? 'text-slate-400 line-through' : ''} data-item={i.id}>
                    {draft && <td className="td"><input type="checkbox" aria-label="Включить работу" checked={!i.excluded} onChange={(e) => patch(i.id, { excluded: !e.target.checked })} /></td>}
                    <td className="td whitespace-nowrap text-xs text-slate-500">{i.code}</td>
                    <td className="td">{i.name} {dupIds.has(i.id) && <Badge tone="amber">возможный дубль</Badge>} {i.excluded && <Badge tone="slate">исключена</Badge>}</td>
                    <td className="td">{i.unit}</td>
                    <td className="td text-right">
                      {draft && !i.excluded ? (
                        <span className="inline-flex items-center gap-1">
                          <input type="number" min={0} step="any" className={`input !w-28 !py-1 text-right${orig.get(i.id)?.qty !== i.qty ? ' !border-amber-500' : ''}`} value={i.qty}
                            onChange={(e) => patch(i.id, { qty: Math.max(0, Number(e.target.value) || 0) })} />
                          {orig.get(i.id)?.qty !== i.qty && <button className="btn-ghost !p-1" title="Вернуть исходный объём" onClick={() => patch(i.id, { qty: orig.get(i.id)!.qty })}><RotateCcw size={13} /></button>}
                        </span>
                      ) : formatNumber(i.qty)}
                    </td>
                    <td className="td text-right">{formatMoney(i.price)}</td>
                    <td className="td text-right">{i.excluded ? '—' : formatMoney(itemCost(i))}</td>
                  </tr>
                ))}
              </tbody>
            ))}
            {groups.length === 0 && <tbody><tr><td className="td text-slate-500" colSpan={draft ? 7 : 6}>Ничего не найдено</td></tr></tbody>}
          </table>
        </div>
      </Modal>
      <Confirm
        open={confirm} danger title="Удалить смету?" okLabel="Удалить"
        text={`Смета «${est.name}» v${est.version} будет удалена из демо-данных.`}
        onCancel={() => setConfirm(false)}
        onOk={() => { remove(est.id); setConfirm(false); onClose(); toast.ok('Смета удалена') }}
      />
    </>
  )
}
