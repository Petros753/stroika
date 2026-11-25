import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FileText, Plus, Ruler, Sparkles } from 'lucide-react'
import { Badge, Field, Modal, ProgressBar } from '../ui'
import { RequestForm } from '../procurement/RequestForm'
import { RequestDetail } from '../procurement/RequestDetail'
import { RequestsTable } from '../procurement/RequestsTable'
import { toast } from '../Toast'
import { useStore } from '../../store'
import { useCan, useUserName } from '../../lib/hooks'
import { analyzeProject } from '../../domain/analysis'
import { missingExecDocs } from '../../domain/calc'
import { EXEC_STATUS_LABEL, EXEC_STATUS_TONE } from '../../domain/labels'
import type { Project } from '../../domain/types'
import { formatMoney, formatMoneyShort } from '../../lib/format'
import { TODAY, formatDate } from '../../lib/date'

export function EstimatesTab({ project }: { project: Project }) {
  const navigate = useNavigate()
  const estimates = useStore((s) => s.estimates.filter((e) => e.projectId === project.id))
  const canUpload = useCan('estimate.upload')
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Сметы объекта</h3>
        <button className="btn-primary" onClick={() => navigate(`/estimates?project=${project.id}`)}>{canUpload ? 'Открыть в модуле смет' : 'Смотреть в модуле смет'}</button>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[560px]">
          <thead className="border-b"><tr><th className="th">Смета</th><th className="th">Версия</th><th className="th">Источник</th><th className="th">Дата</th><th className="th text-right">Позиций</th><th className="th text-right">Итого</th></tr></thead>
          <tbody className="divide-y">
            {estimates.length === 0 && <tr><td className="td text-slate-500" colSpan={6}>Смет по объекту пока нет</td></tr>}
            {estimates.map((e) => (
              <tr key={e.id} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50" onClick={() => navigate(`/estimates?project=${project.id}&open=${e.id}`)}>
                <td className="td font-medium">{e.name}</td><td className="td">v{e.version}</td><td className="td">{e.source}</td><td className="td">{formatDate(e.date)}</td>
                <td className="td text-right">{e.items.length}</td><td className="td text-right">{formatMoney(e.items.reduce((a, i) => a + i.qty * i.price, 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function CadTab({ project }: { project: Project }) {
  const navigate = useNavigate()
  const history = useStore((s) => s.cadHistory.length)
  return (
    <div className="card flex flex-col items-start gap-3 p-5">
      <Ruler size={28} className="text-brand-600" />
      <div>
        <h3 className="font-semibold">Чертежи и AI CAD</h3>
        <p className="mt-1 max-w-xl text-sm text-slate-500">Интерактивный просмотр плана здания «{project.name}»: слои, выбор элементов, подсчёт, AI-команды и экспорт SVG. Изменений в истории чертежа: {history}.</p>
      </div>
      <button className="btn-primary" onClick={() => navigate(`/cad?project=${project.id}`)}>Открыть чертёж</button>
    </div>
  )
}

export function ProcurementTab({ project }: { project: Project }) {
  const requests = useStore((s) => s.requests.filter((r) => r.projectId === project.id))
  const canCreate = useCan('request.create')
  const [creating, setCreating] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Заявки на закупку по объекту</h3>
        {canCreate && <button className="btn-primary" onClick={() => setCreating(true)}><Plus size={15} /> Новая заявка</button>}
      </div>
      <RequestsTable requests={[...requests].sort((a, b) => b.number.localeCompare(a.number))} onOpen={setOpenId} showProject={false} />
      <RequestForm key={String(creating)} open={creating} onClose={() => setCreating(false)} defaultProjectId={project.id} onCreated={setOpenId} />
      <RequestDetail requestId={openId} onClose={() => setOpenId(null)} />
    </div>
  )
}

export function ExecTab({ project }: { project: Project }) {
  const navigate = useNavigate()
  const s = useStore()
  const name = useUserName()
  const docs = s.execDocs.filter((d) => d.projectId === project.id)
  const missing = missingExecDocs(s, project.id)
  const total = s.requirements.filter((r) => r.projectId === project.id).length
  const ready = total - missing.length
  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Комплектность исполнительной документации</h3>
          <span className="text-sm">{ready} из {total}</span>
        </div>
        <ProgressBar value={total ? (ready / total) * 100 : 0} tone={missing.length ? 'amber' : 'green'} />
      </div>
      {missing.length > 0 && (
        <div className="card">
          <div className="border-b px-4 py-3"><h3 className="text-sm font-semibold">Не подготовлено ({missing.length})</h3></div>
          <div className="divide-y">
            {missing.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div><div className="text-sm font-medium">{r.title}</div><div className="text-xs text-slate-500">{r.kind}</div></div>
                <button className="btn-secondary !py-1" onClick={() => navigate(`/pto?project=${project.id}&new=${r.id}`)}>Подготовить</button>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead className="border-b"><tr><th className="th">Документ</th><th className="th">Вид</th><th className="th">Версий</th><th className="th">Автор</th><th className="th">Статус</th></tr></thead>
          <tbody className="divide-y">
            {docs.length === 0 && <tr><td className="td text-slate-500" colSpan={5}>Документов пока нет</td></tr>}
            {docs.map((d) => (
              <tr key={d.id} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50" onClick={() => navigate(`/pto?project=${project.id}&doc=${d.id}`)}>
                <td className="td font-medium">{d.title}</td><td className="td">{d.kind}</td><td className="td">{d.versions.length}</td><td className="td">{name(d.authorId)}</td>
                <td className="td"><Badge tone={EXEC_STATUS_TONE[d.status]}>{EXEC_STATUS_LABEL[d.status]}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function DocsTab({ project }: { project: Project }) {
  const s = useStore()
  const canSign = useCan('docs.sign')
  const docs = s.documents.filter((d) => d.projectId === project.id).sort((a, b) => b.date.localeCompare(a.date))
  const [adding, setAdding] = useState(false)
  const [f, setF] = useState({ name: '', type: 'Договор', counterparty: project.customer })
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Документы объекта</h3>
        {canSign && <button className="btn-primary" onClick={() => setAdding(true)}><Plus size={15} /> Добавить документ</button>}
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead className="border-b"><tr><th className="th">Документ</th><th className="th">Тип</th><th className="th">Контрагент</th><th className="th">Дата</th><th className="th">Статус</th></tr></thead>
          <tbody className="divide-y">
            {docs.length === 0 && <tr><td className="td text-slate-500" colSpan={5}>Документов нет</td></tr>}
            {docs.map((d) => (
              <tr key={d.id}>
                <td className="td font-medium"><FileText size={14} className="mr-1.5 inline text-slate-400" />{d.name}</td><td className="td">{d.type}</td><td className="td">{d.counterparty}</td><td className="td">{formatDate(d.date)}</td>
                <td className="td">{canSign ? (
                  <button className={d.status === 'signed' ? 'btn-secondary !py-1' : 'btn-primary !py-1'} onClick={() => s.toggleDocSigned(d.id)}>{d.status === 'signed' ? 'Подписан ✓' : 'Подписать'}</button>
                ) : <Badge tone={d.status === 'signed' ? 'green' : 'amber'}>{d.status === 'signed' ? 'Подписан' : 'Не подписан'}</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Modal open={adding} onClose={() => setAdding(false)} title="Новый документ"
        footer={<><button className="btn-secondary" onClick={() => setAdding(false)}>Отмена</button><button className="btn-primary" onClick={() => {
          if (f.name.trim().length < 3) return toast.error('Укажите название документа')
          s.addDocument({ projectId: project.id, name: f.name.trim(), type: f.type, counterparty: f.counterparty, date: TODAY, status: 'unsigned' })
          toast.ok('Документ добавлен'); setF({ ...f, name: '' }); setAdding(false)
        }}>Добавить</button></>}>
        <div className="grid gap-3">
          <Field label="Название"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></Field>
          <Field label="Тип"><select className="input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{['Договор', 'Допсоглашение', 'Акт КС-2', 'Справка КС-3', 'Счёт', 'Накладная', 'Акт'].map((t) => <option key={t}>{t}</option>)}</select></Field>
          <Field label="Контрагент"><input className="input" value={f.counterparty} onChange={(e) => setF({ ...f, counterparty: e.target.value })} /></Field>
        </div>
      </Modal>
    </div>
  )
}

export function AiTab({ project }: { project: Project }) {
  const navigate = useNavigate()
  const s = useStore()
  const a = analyzeProject(s, project.id)
  if (!a) return null
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-2.5 text-sm text-brand-800 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-200">
        Автоматический анализ по заданным правилам на текущих данных системы. Это демонстрационный алгоритм, а не языковая модель.
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="card p-4"><h3 className="mb-2 text-sm font-semibold">Сводка</h3><ul className="list-disc space-y-1.5 pl-4 text-sm">{a.summary.map((t) => <li key={t}>{t}</li>)}</ul></div>
        <div className="card p-4"><h3 className="mb-2 text-sm font-semibold text-red-600">Риски</h3><ul className="list-disc space-y-1.5 pl-4 text-sm">{a.risks.map((t) => <li key={t}>{t}</li>)}</ul></div>
        <div className="card p-4"><h3 className="mb-2 text-sm font-semibold text-emerald-600">Рекомендации</h3><ul className="list-disc space-y-1.5 pl-4 text-sm">{a.recommendations.map((t) => <li key={t}>{t}</li>)}</ul></div>
      </div>
      {a.stageOverruns.length > 0 && (
        <div className="card overflow-x-auto">
          <div className="border-b px-4 py-3"><h3 className="text-sm font-semibold">Перерасход по этапам</h3></div>
          <table className="w-full"><thead><tr><th className="th">Этап</th><th className="th">Корпус / участок</th><th className="th text-right">Перерасход</th></tr></thead>
            <tbody className="divide-y">{a.stageOverruns.map((o) => <tr key={o.stageId}><td className="td">{o.name}</td><td className="td text-slate-500">{o.section}</td><td className="td text-right font-medium text-red-600">{formatMoneyShort(o.overrun)}</td></tr>)}</tbody>
          </table>
        </div>
      )}
      <button className="btn-primary" onClick={() => navigate(`/assistant?project=${project.id}&ask=analyze`)}><Sparkles size={15} /> Обсудить в чате с ассистентом</button>
      <p className="text-xs text-slate-400">Подробности по этапам: <Link className="text-brand-600 hover:underline" to={`/projects/${project.id}?tab=stages`}>вкладка «Этапы и задачи»</Link></p>
    </div>
  )
}
