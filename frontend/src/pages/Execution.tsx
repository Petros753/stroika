import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CheckCircle2, ClipboardCheck, Download, FilePlus2, FileSpreadsheet, Printer, Trash2, Wallet, Wand2 } from 'lucide-react'
import { ks2Xlsx, ks3Xlsx } from '../lib/xlsx'
import { Badge, EmptyState, Field, Modal, PageHeader, ProgressBar, StatCard, Table, Tabs } from '../components/ui'
import { Confirm } from '../components/Confirm'
import { toast } from '../components/Toast'
import { useStore } from '../store'
import { useCan, useUserName, useVisibleProjects } from '../lib/hooks'
import { formatMoney, formatNumber } from '../lib/format'
import { TODAY, formatDate } from '../lib/date'
import { download, printHtml } from '../lib/download'
import {
  buildKs2, buildKs3, clampQty, executionProgress, ks2Csv, ks2Html, ks3Html, previousReports, round2,
} from '../domain/execution'
import type { Estimate, ExecutionReport } from '../domain/types'

const period = (r: ExecutionReport) => `${formatDate(r.dateFrom)} — ${formatDate(r.dateTo)}`

export default function Execution() {
  const [params, setParams] = useSearchParams()
  const projects = useVisibleProjects()
  const estimates = useStore((s) => s.estimates)
  const reports = useStore((s) => s.executionReports)
  const canEdit = useCan('execution.edit')
  const [openId, setOpenId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const name = useUserName()

  const ids = new Set(projects.map((p) => p.id))
  const pp = params.get('project')
  const projectId = pp && ids.has(pp) ? pp : projects[0]?.id ?? ''
  const project = projects.find((p) => p.id === projectId)
  const projEstimates = estimates.filter((e) => e.projectId === projectId)
  const projReports = reports.filter((r) => r.projectId === projectId).sort((a, b) => b.number - a.number)

  // основная смета выполнения — та, к которой привязаны справки; иначе последняя версия ГРАНД-Сметы
  const mainEstimate: Estimate | undefined =
    projEstimates.find((e) => e.id === projReports[0]?.estimateId) ??
    [...projEstimates.filter((e) => e.source === 'ГРАНД-Смета')].sort((a, b) => b.version - a.version)[0]
  const progress = mainEstimate ? executionProgress(mainEstimate, reports) : null

  if (!projects.length) return <PageHeader title="Выполнение" subtitle="Нет доступных объектов" />

  return (
    <div>
      <PageHeader
        title="Выполнение (КС-2 / КС-3)"
        subtitle="Объёмы выполненных работ по смете, акты КС-2 и справки КС-3"
        actions={
          <>
            <select className="input !w-auto" aria-label="Объект" value={projectId}
              onChange={(e) => { const n = new URLSearchParams(params); n.set('project', e.target.value); setParams(n, { replace: true }) }}>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {canEdit && projEstimates.length > 0 && (
              <button className="btn-primary" onClick={() => setCreating(true)}><FilePlus2 size={15} />Новый КС-2</button>
            )}
          </>
        }
      />

      {progress && mainEstimate && (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard icon={<Wallet size={18} />} label="Сметная стоимость" value={formatMoney(progress.total)} sub={`${mainEstimate.name} v${mainEstimate.version}`} />
            <StatCard icon={<CheckCircle2 size={18} />} tone="green" label="Выполнено (подписано)" value={formatMoney(progress.done)} sub={`КС-2 подписано: ${progress.reports}`} />
            <StatCard icon={<ClipboardCheck size={18} />} tone="violet" label="Процент выполнения" value={`${progress.percent.toFixed(1)}%`} />
            <StatCard icon={<Wallet size={18} />} tone="amber" label="Остаток по смете" value={formatMoney(progress.total - progress.done)} />
          </div>
          <ProgressBar value={progress.percent} tone="green" className="mb-5" />
        </>
      )}

      {projReports.length === 0 ? (
        <EmptyState title="Справок о выполнении пока нет" hint="Создайте КС-2 за период и внесите выполненные объёмы по позициям сметы." />
      ) : (
        <Table>
          <thead className="border-b">
            <tr><th className="th">№</th><th className="th">Период</th><th className="th">Смета</th><th className="th text-right">Сумма без НДС</th><th className="th text-right">С НДС 20%</th><th className="th">Статус</th><th className="th">Подписал</th></tr>
          </thead>
          <tbody className="divide-y">
            {projReports.map((r) => {
              const est = estimates.find((e) => e.id === r.estimateId)
              const k = est ? buildKs2(r, est, reports) : null
              return (
                <tr key={r.id} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50" onClick={() => setOpenId(r.id)} data-report={r.number}>
                  <td className="td font-medium">КС-2 №{r.number}</td>
                  <td className="td">{period(r)}</td>
                  <td className="td text-sm text-slate-500">{est ? `${est.name} v${est.version}` : '—'}</td>
                  <td className="td text-right">{k ? formatMoney(k.total) : '—'}</td>
                  <td className="td text-right font-medium">{k ? formatMoney(k.grand) : '—'}</td>
                  <td className="td">{r.status === 'signed' ? <Badge tone="green">подписан</Badge> : <Badge tone="amber">черновик</Badge>}</td>
                  <td className="td text-sm">{r.signedBy ? name(r.signedBy) : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </Table>
      )}
      <p className="mt-3 text-xs text-slate-500">
        Формы КС-2/КС-3 — демонстрационные, приближены к унифицированным. Перед использованием в работе бланки нужно сверить с действующими требованиями и договором.
      </p>

      {creating && project && (
        <CreateModal projectId={project.id} estimates={projEstimates} defaultEstimateId={mainEstimate?.id} reports={projReports}
          onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); setOpenId(id) }} />
      )}
      {openId && <ReportModal id={openId} projectName={project?.name ?? ''} onClose={() => setOpenId(null)} />}
    </div>
  )
}

function CreateModal({ projectId, estimates, defaultEstimateId, reports, onClose, onCreated }: {
  projectId: string; estimates: Estimate[]; defaultEstimateId?: string; reports: ExecutionReport[]
  onClose: () => void; onCreated: (id: string) => void
}) {
  const create = useStore((s) => s.createExecutionReport)
  const lastTo = reports.map((r) => r.dateTo).sort().pop()
  const nextFrom = lastTo ? new Date(new Date(lastTo).getTime() + 86400000).toISOString().slice(0, 10) : TODAY.slice(0, 8) + '01'
  const [estimateId, setEstimateId] = useState(defaultEstimateId ?? estimates[0]?.id ?? '')
  const [from, setFrom] = useState(nextFrom)
  const [to, setTo] = useState(nextFrom < TODAY ? TODAY : nextFrom)
  const valid = estimateId && from && to && from <= to
  return (
    <Modal open onClose={onClose} title="Новый КС-2"
      footer={<><button className="btn-secondary" onClick={onClose}>Отмена</button>
        <button className="btn-primary" disabled={!valid} onClick={() => { const id = create({ projectId, estimateId, dateFrom: from, dateTo: to }); toast.ok('Черновик КС-2 создан — внесите объёмы'); onCreated(id) }}>Создать</button></>}>
      <div className="space-y-3">
        <Field label="Смета">
          <select className="input" value={estimateId} onChange={(e) => setEstimateId(e.target.value)}>
            {estimates.map((e) => <option key={e.id} value={e.id}>{e.name} v{e.version} · {e.source}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Период с"><input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="по"><input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        </div>
        {from > to && <p className="text-xs text-red-600">Дата начала позже даты окончания</p>}
        <p className="text-xs text-slate-500">«Ранее выполнено» берётся из подписанных КС-2 этой сметы за предыдущие периоды.</p>
      </div>
    </Modal>
  )
}

function ReportModal({ id, projectName, onClose }: { id: string; projectName: string; onClose: () => void }) {
  const report = useStore((s) => s.executionReports.find((r) => r.id === id))
  const all = useStore((s) => s.executionReports)
  const estimate = useStore((s) => s.estimates.find((e) => e.id === report?.estimateId))
  const setQty = useStore((s) => s.setExecutionQty)
  const fill = useStore((s) => s.fillExecutionQty)
  const sign = useStore((s) => s.signExecutionReport)
  const remove = useStore((s) => s.deleteExecutionReport)
  const canEdit = useCan('execution.edit')
  const canSign = useCan('execution.approve')
  const [tab, setTab] = useState<'ks2' | 'ks3'>('ks2')
  const [onlyFilled, setOnlyFilled] = useState(false)
  const [confirm, setConfirm] = useState<null | 'sign' | 'delete'>(null)

  const ks2 = useMemo(() => (report && estimate ? buildKs2(report, estimate, all, onlyFilled) : null), [report, estimate, all, onlyFilled])
  const ks3 = useMemo(() => (report && estimate ? buildKs3(report, estimate, all) : null), [report, estimate, all])
  if (!report || !estimate || !ks2 || !ks3) return null

  const draft = report.status === 'draft'
  const editable = draft && canEdit
  const per = period(report)
  const prev = previousReports(all, report)
  const base = `KS_${report.number}_${report.dateTo}`

  /** Быстрое заполнение: доля от сметного объёма, но не больше остатка */
  const quickFill = (share: number) => {
    const q: Record<string, number> = {}
    for (const r of buildKs2(report, estimate, all).rows) {
      const v = clampQty(r.item, r.prevQty, round2(r.planQty * share))
      if (v > 0) q[r.item.id] = v
    }
    fill(report.id, q)
    toast.info(share ? `Заполнено ${Math.round(share * 100)}% от сметы (в пределах остатка)` : 'Объёмы очищены')
  }

  return (
    <>
      <Modal open xl onClose={onClose} title={`КС-2 / КС-3 №${report.number} · ${per}`}
        footer={
          <>
            {editable && <button className="btn-secondary mr-auto text-red-600" onClick={() => setConfirm('delete')}><Trash2 size={15} />Удалить черновик</button>}
            {tab === 'ks2' && <button className="btn-secondary" onClick={() => { download(`${base}_KS2.csv`, ks2Csv(buildKs2(report, estimate, all, true)), 'text/csv;charset=utf-8'); toast.ok('КС-2 выгружен в CSV') }}><Download size={15} />CSV</button>}
            <button className="btn-secondary" onClick={() => {
              const head = { number: report.number, project: projectName, estimate: `${estimate.name} v${estimate.version}`, period: per }
              const job = tab === 'ks2' ? ks2Xlsx(buildKs2(report, estimate, all, true), head, `${base}_KS2.xlsx`) : ks3Xlsx(ks3, head, `${base}_KS3.xlsx`)
              job.then(() => toast.ok('Выгружено в Excel (.xlsx), итоги считаются формулами')).catch(() => toast.error('Не удалось сформировать Excel'))
            }}><FileSpreadsheet size={15} />Excel</button>
            <button className="btn-secondary" onClick={() => {
              const html = tab === 'ks2' ? ks2Html(report, estimate, projectName, buildKs2(report, estimate, all, true), per) : ks3Html(report, estimate, projectName, ks3, per)
              download(`${base}_${tab === 'ks2' ? 'KS2' : 'KS3'}.doc`, html, 'application/msword;charset=utf-8'); toast.ok('Документ выгружен в Word (.doc)')
            }}><Download size={15} />Word</button>
            <button className="btn-secondary" onClick={() => {
              printHtml(tab === 'ks2' ? ks2Html(report, estimate, projectName, buildKs2(report, estimate, all, true), per) : ks3Html(report, estimate, projectName, ks3, per))
              toast.info('В окне печати выберите «Сохранить как PDF»')
            }}><Printer size={15} />PDF</button>
            {draft && canSign && <button className="btn-primary" disabled={ks2.total === 0 || ks2.overCount > 0} onClick={() => setConfirm('sign')}><CheckCircle2 size={15} />Подписать</button>}
          </>
        }>
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          {draft ? <Badge tone="amber">черновик</Badge> : <Badge tone="green">подписан</Badge>}
          <span className="text-slate-500">{projectName} · смета «{estimate.name}» v{estimate.version} · учтено ранее подписанных КС-2: {prev.length}</span>
          <span className="ml-auto">За период: <b>{formatMoney(ks2.total)}</b> · с НДС: <b>{formatMoney(ks2.grand)}</b></span>
        </div>
        <Tabs tabs={[{ key: 'ks2', label: 'КС-2 · акт о приёмке работ' }, { key: 'ks3', label: 'КС-3 · справка о стоимости' }]} value={tab} onChange={setTab} />

        {tab === 'ks2' ? (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={onlyFilled} onChange={(e) => setOnlyFilled(e.target.checked)} />Только заполненные</label>
              {editable && (
                <span className="ml-auto flex flex-wrap gap-1">
                  <span className="self-center text-xs text-slate-500"><Wand2 size={13} className="inline" /> Быстро заполнить:</span>
                  {[0.05, 0.1, 0.25].map((s) => <button key={s} className="btn-secondary !px-2 !py-1 text-xs" onClick={() => quickFill(s)}>{s * 100}%</button>)}
                  <button className="btn-secondary !px-2 !py-1 text-xs" onClick={() => quickFill(1)}>весь остаток</button>
                  <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => quickFill(0)}>очистить</button>
                </span>
              )}
            </div>
            {ks2.overCount > 0 && <p className="mb-2 rounded-lg bg-red-50 p-2 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-300">Объём превышает остаток по смете в {ks2.overCount} поз. — подписать нельзя.</p>}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-sm">
                <thead className="border-b">
                  <tr><th className="th">Шифр</th><th className="th">Наименование</th><th className="th">Ед.</th><th className="th text-right">По смете</th><th className="th text-right">Ранее</th><th className="th text-right">За период</th><th className="th text-right">Остаток</th><th className="th text-right">Цена</th><th className="th text-right">Стоимость</th></tr>
                </thead>
                {ks2.sections.map((s) => (
                  <tbody key={s.section} className="divide-y">
                    <tr className="bg-slate-50 dark:bg-slate-800/50"><td className="td font-semibold" colSpan={8}>{s.section}</td><td className="td text-right font-semibold">{formatMoney(s.sum)}</td></tr>
                    {s.rows.map((r) => (
                      <tr key={r.item.id} data-item={r.item.id} className={r.over ? 'bg-red-50 dark:bg-red-500/10' : ''}>
                        <td className="td whitespace-nowrap text-xs text-slate-500">{r.item.code}</td>
                        <td className="td">{r.item.name}</td>
                        <td className="td">{r.item.unit}</td>
                        <td className="td text-right">{formatNumber(r.planQty)}</td>
                        <td className="td text-right text-slate-500">{formatNumber(r.prevQty)}</td>
                        <td className="td text-right">
                          {editable ? (
                            <input type="number" min={0} step="any" aria-label="Выполнено за период" className="input !w-28 !py-1 text-right"
                              value={r.qty || ''} placeholder="0"
                              onChange={(e) => setQty(report.id, r.item.id, Math.max(0, Number(e.target.value) || 0))}
                              onBlur={(e) => { const v = clampQty(r.item, r.prevQty, Number(e.target.value) || 0); if (v !== r.qty) { setQty(report.id, r.item.id, v); toast.info('Объём ограничен остатком по смете') } }} />
                          ) : formatNumber(r.qty)}
                        </td>
                        <td className={`td text-right ${r.over ? 'font-semibold text-red-600' : 'text-slate-500'}`}>{formatNumber(r.remain)}</td>
                        <td className="td text-right">{formatMoney(r.item.price)}</td>
                        <td className="td text-right">{r.sum ? formatMoney(r.sum) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                ))}
                <tbody className="border-t-2">
                  <tr><td className="td text-right" colSpan={8}>Итого</td><td className="td text-right font-semibold">{formatMoney(ks2.total)}</td></tr>
                  <tr><td className="td text-right" colSpan={8}>НДС 20%</td><td className="td text-right">{formatMoney(ks2.vat)}</td></tr>
                  <tr><td className="td text-right font-semibold" colSpan={8}>Всего с НДС</td><td className="td text-right font-semibold">{formatMoney(ks2.grand)}</td></tr>
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead className="border-b"><tr><th className="th">Вид работ (раздел)</th><th className="th text-right">По смете</th><th className="th text-right">С начала до периода</th><th className="th text-right">За период</th><th className="th text-right">С начала работ</th><th className="th">Готовность</th></tr></thead>
              <tbody className="divide-y">
                {ks3.rows.map((r) => (
                  <tr key={r.section}>
                    <td className="td">{r.section}</td>
                    <td className="td text-right">{formatMoney(r.contract)}</td>
                    <td className="td text-right text-slate-500">{formatMoney(r.prev)}</td>
                    <td className="td text-right font-medium">{formatMoney(r.period)}</td>
                    <td className="td text-right">{formatMoney(r.sinceStart)}</td>
                    <td className="td w-40"><div className="flex items-center gap-2"><ProgressBar value={r.percent} tone="green" className="flex-1" /><span className="text-xs">{r.percent.toFixed(0)}%</span></div></td>
                  </tr>
                ))}
              </tbody>
              <tbody className="border-t-2">
                <tr className="font-semibold"><td className="td">Итого</td><td className="td text-right">{formatMoney(ks3.contract)}</td><td className="td text-right">{formatMoney(ks3.prev)}</td><td className="td text-right">{formatMoney(ks3.period)}</td><td className="td text-right">{formatMoney(ks3.sinceStart)}</td><td className="td" /></tr>
              </tbody>
            </table>
            <p className="mt-3 text-sm">За отчётный период: <b>{formatMoney(ks3.period)}</b> · НДС 20%: {formatMoney(ks3.vat)} · <b>к оплате с НДС: {formatMoney(ks3.grand)}</b></p>
          </div>
        )}
      </Modal>
      <Confirm
        open={confirm === 'sign'} title={`Подписать КС-2/КС-3 №${report.number}?`} okLabel="Подписать"
        text={`Сумма к оплате с НДС: ${formatMoney(ks2.grand)}. После подписания объёмы нельзя менять, они войдут в «ранее выполнено» следующих актов.`}
        onCancel={() => setConfirm(null)} onOk={() => { sign(report.id); setConfirm(null); toast.ok('КС-2/КС-3 подписаны, бухгалтерия уведомлена') }}
      />
      <Confirm
        open={confirm === 'delete'} danger title="Удалить черновик?" okLabel="Удалить" text={`КС-2 №${report.number} будет удалён.`}
        onCancel={() => setConfirm(null)} onOk={() => { remove(report.id); setConfirm(null); onClose(); toast.ok('Черновик удалён') }}
      />
    </>
  )
}
