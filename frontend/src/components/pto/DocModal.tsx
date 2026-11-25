import { useEffect, useState } from 'react'
import { CheckCircle2, Download, FileSpreadsheet, FileText, Pencil, Printer, Send, Undo2 } from 'lucide-react'
import { actXlsx } from '../../lib/xlsx'
import { getBlob } from '../../lib/blobs'
import { Badge, Modal } from '../ui'
import { toast } from '../Toast'
import { useStore } from '../../store'
import { useCan, useUserName } from '../../lib/hooks'
import { EXEC_STATUS_LABEL, EXEC_STATUS_TONE } from '../../domain/labels'
import { execDocHtml } from '../../domain/execdocs'
import { formatDate } from '../../lib/date'
import { download } from '../../lib/download'

export function DocModal({ id, onClose }: { id: string | null; onClose: () => void }) {
  const doc = useStore((s) => s.execDocs.find((d) => d.id === id))
  const project = useStore((s) => s.projects.find((p) => p.id === doc?.projectId))
  const setStatus = useStore((s) => s.setExecStatus)
  const addVersion = useStore((s) => s.addExecVersion)
  const canCreate = useCan('pto.create')
  const canApprove = useCan('pto.approve')
  const name = useUserName()
  const [ver, setVer] = useState(0)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [note, setNote] = useState('')
  const [reject, setReject] = useState(false)
  const [reason, setReason] = useState('')
  const [scheme, setScheme] = useState<string | null>(null)
  useEffect(() => { setScheme(null); if (id) getBlob(`scheme:${id}`).then((b) => b && b.text().then(setScheme)).catch(() => undefined) }, [id])

  useEffect(() => { setEditing(false); setReject(false) }, [id])
  useEffect(() => { if (doc) setVer(doc.versions.length - 1) }, [id, doc?.versions.length]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!doc) return null
  const v = doc.versions[Math.min(ver, doc.versions.length - 1)]
  const isLast = v.version === doc.versions.length
  const base = `ID_${doc.id}_v${v.version}`
  const editable = isLast && canCreate && !editing

  const exportWord = () => {
    download(`${base}.doc`, execDocHtml(doc.title, v.version, v.body), 'application/msword;charset=utf-8')
    toast.ok('Документ выгружен в формате Word (.doc)')
  }
  const exportPdf = () => {
    // печать из скрытого фрейма: в диалоге выбрать «Сохранить как PDF»
    const f = document.createElement('iframe')
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
    document.body.appendChild(f)
    f.onload = () => { f.contentWindow?.focus(); f.contentWindow?.print(); setTimeout(() => f.remove(), 3000) }
    f.srcdoc = execDocHtml(doc.title, v.version, v.body)
    toast.info('В окне печати выберите «Сохранить как PDF»')
  }
  const startEdit = () => { setDraft(v.body); setNote(''); setEditing(true) }

  return (
    <Modal
      open wide onClose={onClose} title={doc.title}
      footer={
        <>
          <button className="btn-secondary" onClick={exportWord}><Download size={15} />Word</button>
          <button className="btn-secondary" onClick={() => actXlsx(doc.title, v.version, v.body, `${base}.xlsx`).then(() => toast.ok('Документ выгружен в Excel (.xlsx)')).catch(() => toast.error('Не удалось сформировать Excel'))}><FileSpreadsheet size={15} />Excel</button>
          <button className="btn-secondary" onClick={exportPdf}><Printer size={15} />PDF</button>
          {editable && (doc.status === 'draft' || doc.status === 'rejected') && (
            <>
              <button className="btn-secondary" onClick={startEdit}><Pencil size={15} />Править</button>
              <button className="btn-primary" onClick={() => { setStatus(doc.id, 'review'); toast.ok('Документ отправлен на согласование') }}><Send size={15} />На согласование</button>
            </>
          )}
          {doc.status === 'review' && canApprove && !reject && (
            <>
              <button className="btn-secondary" onClick={() => setReject(true)}><Undo2 size={15} />Вернуть</button>
              <button className="btn-primary" onClick={() => { setStatus(doc.id, 'approved'); toast.ok('Документ согласован') }}><CheckCircle2 size={15} />Согласовать</button>
            </>
          )}
          {editable && doc.status === 'approved' && <button className="btn-secondary" onClick={startEdit}><Pencil size={15} />Новая версия</button>}
        </>
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <Badge tone={EXEC_STATUS_TONE[doc.status]}>{EXEC_STATUS_LABEL[doc.status]}</Badge>
        <Badge>{doc.kind}</Badge>
        <span className="text-slate-500">{project?.name} · автор {name(doc.authorId)}</span>
        <label className="ml-auto flex items-center gap-2 text-xs text-slate-500">
          Версия
          <select className="input !w-auto !py-1" value={ver} onChange={(e) => { setVer(Number(e.target.value)); setEditing(false) }}>
            {doc.versions.map((x, i) => <option key={x.version} value={i}>v{x.version} · {formatDate(x.date)}</option>)}
          </select>
        </label>
      </div>
      <p className="mb-2 text-xs text-slate-500">v{v.version}: {v.note} · {name(v.authorId)}{!isLast && ' · это не последняя версия'}</p>

      {reject && (
        <div className="mb-3 rounded-lg border p-3">
          <label className="label">Причина возврата</label>
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Например: уточнить состав работ" />
          <div className="mt-2 flex gap-2">
            <button className="btn-primary" disabled={!reason.trim()} onClick={() => { setStatus(doc.id, 'rejected', reason.trim()); setReject(false); setReason(''); toast.info('Документ возвращён на доработку') }}>Вернуть на доработку</button>
            <button className="btn-secondary" onClick={() => setReject(false)}>Отмена</button>
          </div>
        </div>
      )}

      {editing ? (
        <div>
          <textarea className="input h-72 font-mono text-xs" value={draft} onChange={(e) => setDraft(e.target.value)} />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input className="input !w-64" placeholder="Комментарий к версии" value={note} onChange={(e) => setNote(e.target.value)} />
            <button className="btn-primary" disabled={draft.trim() === v.body.trim()} onClick={() => { addVersion(doc.id, draft, note.trim() || 'Правка'); setEditing(false); toast.ok('Сохранена новая версия') }}><FileText size={15} />Сохранить версию</button>
            <button className="btn-secondary" onClick={() => setEditing(false)}>Отмена</button>
          </div>
        </div>
      ) : (
        <>
        <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap rounded-lg border bg-slate-50 p-4 font-serif text-sm leading-relaxed dark:bg-slate-950">{v.body}</pre>
        {scheme && !editing && (
          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between text-sm font-medium">Графическая часть
              <button className="btn-ghost !py-0.5 text-xs" onClick={() => download(`${doc.title}.svg`, scheme, 'image/svg+xml')}><Download size={13} />SVG</button>
            </div>
            <div className="max-h-[60vh] overflow-auto rounded-lg border bg-white p-2 [&_svg]:h-auto [&_svg]:w-full" data-testid="doc-scheme" dangerouslySetInnerHTML={{ __html: scheme }} />
          </div>
        )}
        </>
      )}
    </Modal>
  )
}
