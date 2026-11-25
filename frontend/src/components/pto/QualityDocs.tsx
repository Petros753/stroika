import { useMemo, useState } from 'react'
import { CheckCircle2, Download, FilePlus2, Paperclip, Printer, ScanText, Search, XCircle } from 'lucide-react'
import { CertSearchModal } from './CertSearchModal'
import { Badge, Field, Modal, Table } from '../ui'
import { toast } from '../Toast'
import { useStore } from '../../store'
import { useCan, useUserName, useVisibleProjects } from '../../lib/hooks'
import { TODAY, formatDate } from '../../lib/date'
import { download, printHtml } from '../../lib/download'
import { getBlob, putBlob } from '../../lib/blobs'
import {
  CHECK_LABEL, CHECK_TONE, QUALITY_KINDS, VALIDITY_LABEL, VALIDITY_TONE, coverage, demoRecognize, qualityRegistryCsv, qualityRegistryHtml, validity,
} from '../../domain/quality'
import type { QualityDoc, QualityDocKind } from '../../domain/types'

type Filter = 'all' | 'problems' | 'pending'

export function QualityDocs({ projectId }: { projectId: string }) {
  const projects = useVisibleProjects()
  const state = useStore()
  const setCheck = useStore((s) => s.setQualityCheck)
  const canEdit = useCan('pto.create')
  const name = useUserName()
  const [filter, setFilter] = useState<Filter>('all')
  const [adding, setAdding] = useState<null | { projectId: string; materialId?: string }>(null)
  const [rejecting, setRejecting] = useState<QualityDoc | null>(null)
  const [reason, setReason] = useState('')
  const [searching, setSearching] = useState<null | { projectId: string; materialIds: string[] }>(null)

  const scope = projects.filter((p) => projectId === 'all' || p.id === projectId)
  const ids = new Set(scope.map((p) => p.id))
  const matName = (id: string) => state.materials.find((m) => m.id === id)?.name ?? id
  const pname = (id: string) => projects.find((p) => p.id === id)?.name ?? ''
  const cov = useMemo(() => scope.flatMap((p) => coverage(state, p.id, TODAY).map((r) => ({ ...r, projectId: p.id }))), [state, scope]) // eslint-disable-line react-hooks/exhaustive-deps
  const problemRows = cov.filter((r) => r.problems.length)

  const docs = state.qualityDocs.filter((d) => ids.has(d.projectId)).filter((d) => {
    if (filter === 'pending') return d.check === 'pending'
    if (filter === 'problems') return d.check === 'rejected' || ['expired', 'expiring'].includes(validity(d, TODAY))
    return true
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  const registryName = projectId === 'all' ? 'Все объекты' : pname(projectId)
  const allDocs = state.qualityDocs.filter((d) => ids.has(d.projectId))
  const openFile = async (d: QualityDoc) => {
    const blob = await getBlob(`qd:${d.id}`).catch(() => undefined)
    if (blob) { window.open(URL.createObjectURL(blob), '_blank'); return }
    toast.info(`Файл «${d.fileName}» — демо-запись: скан не прикладывался. Загруженные вами файлы открываются.`)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-slate-500">Документы о качестве привязаны к материалу, партии и поставке. Акты (АОСР, входной контроль) берут их в приложения.</p>
        <div className="ml-auto flex gap-2">
          <button className="btn-secondary" onClick={() => { download('reestr_kachestvo.csv', qualityRegistryCsv(allDocs, matName), 'text/csv;charset=utf-8'); toast.ok('Реестр выгружен в CSV') }}><Download size={15} />CSV</button>
          <button className="btn-secondary" onClick={() => { download('reestr_kachestvo.doc', qualityRegistryHtml(registryName, allDocs, matName, TODAY), 'application/msword;charset=utf-8'); toast.ok('Реестр выгружен в Word') }}><Download size={15} />Реестр Word</button>
          <button className="btn-secondary" onClick={() => { printHtml(qualityRegistryHtml(registryName, allDocs, matName, TODAY)); toast.info('В окне печати выберите «Сохранить как PDF»') }}><Printer size={15} />PDF</button>
          {canEdit && problemRows.length > 0 && projectId !== 'all' && <button className="btn-primary" onClick={() => setSearching({ projectId, materialIds: problemRows.filter((r) => r.problems.some((p) => !/входного контроля|истекает/.test(p))).map((r) => r.materialId) })}><Search size={15} />Найти недостающие</button>}
          {canEdit && <button className="btn-secondary" onClick={() => setAdding({ projectId: projectId === 'all' ? scope[0]?.id ?? '' : projectId })}><FilePlus2 size={15} />Добавить документ</button>}
        </div>
      </div>

      <div className="card p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-semibold">Комплектность по материалам на объекте</h3>
          <span className="text-sm text-slate-500">{cov.length - problemRows.length} из {cov.length} без замечаний</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead className="border-b"><tr>{projectId === 'all' && <th className="th">Объект</th>}<th className="th">Материал</th><th className="th">Сертификат / декларация</th><th className="th">Паспорт на партию</th><th className="th">Замечания</th><th className="th" /></tr></thead>
            <tbody className="divide-y">
              {cov.map((r) => (
                <tr key={r.projectId + r.materialId} data-cov={r.materialId}>
                  {projectId === 'all' && <td className="td text-slate-500">{pname(r.projectId)}</td>}
                  <td className="td font-medium">{matName(r.materialId)}</td>
                  <td className="td">{r.conformity ? <span className="text-emerald-700 dark:text-emerald-400">№ {r.conformity.number}</span> : r.conformityRequired ? <Badge tone="red">нет</Badge> : <span className="text-slate-400">не требуется</span>}</td>
                  <td className="td">{r.passport ? <span className="text-emerald-700 dark:text-emerald-400">№ {r.passport.number}</span> : r.passportRequired ? <Badge tone="red">нужен</Badge> : <span className="text-slate-400">не требуется</span>}</td>
                  <td className="td">{r.problems.length ? <div className="flex flex-wrap gap-1">{r.problems.map((p) => <Badge key={p} tone={/нет|истёк|отклон/.test(p) ? 'red' : 'amber'}>{p}</Badge>)}</div> : <Badge tone="green">в порядке</Badge>}</td>
                  <td className="td whitespace-nowrap text-right">{canEdit && r.problems.length > 0 && (
                    <span className="inline-flex gap-1">
                      <button className="btn-secondary !px-2 !py-1 text-xs" onClick={() => setSearching({ projectId: r.projectId, materialIds: [r.materialId] })}><Search size={12} />Найти</button>
                      <button className="btn-secondary !px-2 !py-1 text-xs" onClick={() => setAdding({ projectId: r.projectId, materialId: r.materialId })}>Добавить</button>
                    </span>
                  )}</td>
                </tr>
              ))}
              {cov.length === 0 && <tr><td className="td text-slate-500" colSpan={6}>Материалы на объект не поступали</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-500">Перечень материалов — по складу объекта и поставкам. Правило «для арматуры, бетона, окон и труб нужен паспорт на партию» — демо; в рабочей версии требования берутся из проекта.</p>
      </div>

      <div>
        <div className="mb-2 flex gap-1">
          {([['all', 'Все документы'], ['problems', 'Истекают / истекли / отклонены'], ['pending', 'Ожидают входного контроля']] as [Filter, string][]).map(([k, l]) => (
            <button key={k} className={k === filter ? 'btn-primary !py-1 text-xs' : 'btn-secondary !py-1 text-xs'} onClick={() => setFilter(k)}>{l}</button>
          ))}
        </div>
        <Table>
          <thead className="border-b"><tr>{projectId === 'all' && <th className="th">Объект</th>}<th className="th">Материал</th><th className="th">Документ</th><th className="th">Выдан</th><th className="th">Срок</th><th className="th">Партия / поставка</th><th className="th">Входной контроль</th><th className="th" /></tr></thead>
          <tbody className="divide-y">
            {docs.length === 0 && <tr><td className="td text-slate-500" colSpan={8}>Документов нет</td></tr>}
            {docs.map((d) => {
              const v = validity(d, TODAY)
              const order = state.orders.find((o) => o.id === d.orderId)
              return (
                <tr key={d.id} data-qd={d.id}>
                  {projectId === 'all' && <td className="td text-slate-500">{pname(d.projectId)}</td>}
                  <td className="td">{matName(d.materialId)}</td>
                  <td className="td"><div className="font-medium">{d.kind}</div><div className="text-xs text-slate-500">№ {d.number} от {formatDate(d.issuedAt)}</div>
                    {d.fileName && <button className="mt-0.5 flex items-center gap-1 text-xs text-brand-600 hover:underline" onClick={() => openFile(d)}><Paperclip size={12} />{d.fileName}</button>}</td>
                  <td className="td text-xs">{d.issuer}</td>
                  <td className="td"><Badge tone={VALIDITY_TONE[v]}>{VALIDITY_LABEL[v]}</Badge>{d.validUntil && <div className="text-xs text-slate-500">до {formatDate(d.validUntil)}</div>}</td>
                  <td className="td text-xs">{d.batch}{order && <div className="text-slate-500">{order.number}</div>}</td>
                  <td className="td"><Badge tone={CHECK_TONE[d.check]}>{CHECK_LABEL[d.check]}</Badge>
                    {d.checkedBy && <div className="text-xs text-slate-500">{name(d.checkedBy)}</div>}
                    {d.note && <div className="max-w-[220px] text-xs text-red-600">{d.note}</div>}</td>
                  <td className="td whitespace-nowrap text-right">
                    {canEdit && d.check === 'pending' && (
                      <span className="inline-flex gap-1">
                        <button className="btn-secondary !px-2 !py-1 text-xs text-emerald-700" onClick={() => { setCheck(d.id, 'accepted'); toast.ok('Документ принят на входном контроле') }}><CheckCircle2 size={13} />Принять</button>
                        <button className="btn-secondary !px-2 !py-1 text-xs text-red-600" onClick={() => { setRejecting(d); setReason('') }}><XCircle size={13} />Отклонить</button>
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </Table>
      </div>

      {adding && <AddModal init={adding} onClose={() => setAdding(null)} />}
      {searching && <CertSearchModal projectId={searching.projectId} materialIds={searching.materialIds} onClose={() => setSearching(null)} />}
      <Modal open={!!rejecting} onClose={() => setRejecting(null)} title="Отклонить документ на входном контроле"
        footer={<><button className="btn-secondary" onClick={() => setRejecting(null)}>Отмена</button>
          <button className="btn-primary" disabled={!reason.trim()} onClick={() => { setCheck(rejecting!.id, 'rejected', reason.trim()); setRejecting(null); toast.ok('Документ отклонён, снабжение уведомлено') }}>Отклонить</button></>}>
        <Field label="Причина (увидят снабжение и руководитель проекта)"><input className="input" autoFocus value={reason} placeholder="Например: номер партии не совпадает с накладной" onChange={(e) => setReason(e.target.value)} /></Field>
      </Modal>
    </div>
  )
}

function AddModal({ init, onClose }: { init: { projectId: string; materialId?: string }; onClose: () => void }) {
  const projects = useVisibleProjects()
  const materials = useStore((s) => s.materials)
  const orders = useStore((s) => s.orders)
  const add = useStore((s) => s.addQualityDoc)
  const [f, setF] = useState({
    projectId: init.projectId, materialId: init.materialId ?? materials[0].id, kind: 'Сертификат соответствия' as QualityDocKind,
    number: '', issuer: '', batch: '', issuedAt: TODAY, validUntil: '', orderId: '',
  })
  const [file, setFile] = useState<File | null>(null)
  const [recognized, setRecognized] = useState(false)
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }))
  const projOrders = orders.filter((o) => o.projectId === f.projectId && o.items.some((i) => i.materialId === f.materialId))
  const valid = f.number.trim() && f.issuer.trim() && f.issuedAt && (!f.validUntil || f.validUntil >= f.issuedAt)

  return (
    <Modal open wide onClose={onClose} title="Документ о качестве материала"
      footer={<><button className="btn-secondary" onClick={onClose}>Отмена</button>
        <button className="btn-primary" disabled={!valid} onClick={async () => {
          const id = add({
            projectId: f.projectId, materialId: f.materialId, kind: f.kind, number: f.number.trim(), issuer: f.issuer.trim(),
            batch: f.batch.trim() || undefined, issuedAt: f.issuedAt, validUntil: f.validUntil || undefined, orderId: f.orderId || undefined, fileName: file?.name,
          })
          if (file) await putBlob(`qd:${id}`, file).catch(() => toast.error('Не удалось сохранить файл в браузере'))
          toast.ok('Документ добавлен — ожидает входного контроля'); onClose()
        }}>Добавить</button></>}>
      <div className="mb-3 rounded-lg border border-dashed p-3">
        <div className="flex flex-wrap items-center gap-2">
          <input type="file" accept=".pdf,image/*" aria-label="Скан документа" className="text-sm" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setRecognized(false) }} />
          <button className="btn-secondary ml-auto !py-1 text-xs" disabled={!file} onClick={() => {
            const r = demoRecognize(file!.name, TODAY)
            setF((x) => ({ ...x, kind: r.kind ?? x.kind, number: r.number ?? x.number, issuedAt: r.issuedAt ?? x.issuedAt, validUntil: r.validUntil ?? '' }))
            setRecognized(true)
          }}><ScanText size={13} />Распознать (демо)</button>
        </div>
        {recognized && <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">Демо-распознавание: поля заполнены по имени файла. В рабочей версии номер, даты, изготовитель и партия извлекаются из скана (Docling + OCR) — проверьте значения.</p>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Объект"><select className="input" value={f.projectId} onChange={(e) => set('projectId', e.target.value)}>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <Field label="Материал"><select className="input" aria-label="Материал" value={f.materialId} onChange={(e) => set('materialId', e.target.value)}>{materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
        <Field label="Вид документа"><select className="input" value={f.kind} onChange={(e) => set('kind', e.target.value)}>{QUALITY_KINDS.map((k) => <option key={k}>{k}</option>)}</select></Field>
        <Field label="Номер"><input className="input" aria-label="Номер документа" value={f.number} onChange={(e) => set('number', e.target.value)} /></Field>
        <Field label="Выдан / изготовитель"><input className="input" aria-label="Изготовитель" value={f.issuer} onChange={(e) => set('issuer', e.target.value)} /></Field>
        <Field label="Партия / плавка (для паспорта)"><input className="input" value={f.batch} onChange={(e) => set('batch', e.target.value)} /></Field>
        <Field label="Дата выдачи"><input type="date" className="input" value={f.issuedAt} onChange={(e) => set('issuedAt', e.target.value)} /></Field>
        <Field label="Действует до (пусто — бессрочно)"><input type="date" className="input" value={f.validUntil} onChange={(e) => set('validUntil', e.target.value)} /></Field>
        <Field label="Поставка (заказ)" className="sm:col-span-2">
          <select className="input" value={f.orderId} onChange={(e) => set('orderId', e.target.value)}>
            <option value="">— не привязан —</option>{projOrders.map((o) => <option key={o.id} value={o.id}>{o.number} от {formatDate(o.createdAt)}</option>)}
          </select>
        </Field>
      </div>
      {f.validUntil && f.validUntil < f.issuedAt && <p className="mt-2 text-xs text-red-600">Срок действия раньше даты выдачи</p>}
    </Modal>
  )
}
