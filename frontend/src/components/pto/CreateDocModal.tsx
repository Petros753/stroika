import { useEffect, useMemo, useState } from 'react'
import { Modal, Field } from '../ui'
import { toast } from '../Toast'
import { useStore } from '../../store'
import { useVisibleProjects } from '../../lib/hooks'
import { EXEC_KIND_GROUPS, KIND_INFO, qualityLine, suggestWorks } from '../../domain/execdocs'
import { validity } from '../../domain/quality'
import { TODAY } from '../../lib/date'
import type { ExecDocKind } from '../../domain/types'

export function CreateDocModal({
  open, onClose, defaultProject, requirementId, onCreated,
}: { open: boolean; onClose: () => void; defaultProject: string; requirementId?: string | null; onCreated: (id: string) => void }) {
  const projects = useVisibleProjects()
  const stages = useStore((s) => s.stages)
  const requirements = useStore((s) => s.requirements)
  const create = useStore((s) => s.createExecDoc)
  const qualityDocs = useStore((s) => s.qualityDocs)
  const materials = useStore((s) => s.materials)
  const [attach, setAttach] = useState<string[]>([])
  const req = requirements.find((r) => r.id === requirementId)

  const [projectId, setProjectId] = useState(defaultProject)
  const [kind, setKind] = useState<ExecDocKind>('АОСР')
  const [stageId, setStageId] = useState('')
  const [title, setTitle] = useState('')
  const [works, setWorks] = useState('')
  const [note, setNote] = useState('')

  const projStages = useMemo(() => stages.filter((s) => s.projectId === projectId), [stages, projectId])
  const stage = projStages.find((s) => s.id === stageId)
  const withMaterials = !!KIND_INFO[kind].materials
  /** Можно прикладывать только действующие и не отклонённые документы */
  const projQuality = useMemo(() => qualityDocs.filter((d) => d.projectId === projectId && d.check !== 'rejected' && validity(d, TODAY) !== 'expired'), [qualityDocs, projectId])
  useEffect(() => { if (open) setAttach(withMaterials ? projQuality.filter((d) => d.check === 'accepted').map((d) => d.id) : []) }, [open, projectId, kind]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return
    if (req) {
      setProjectId(req.projectId); setKind(req.kind); setStageId(req.stageId ?? ''); setTitle(req.title)
    } else {
      setProjectId(defaultProject); setKind('АОСР'); setStageId(''); setTitle('')
    }
    setNote('')
  }, [open, requirementId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (open) setWorks(suggestWorks(kind, stage).join('\n')) }, [open, kind, stageId, projectId]) // eslint-disable-line react-hooks/exhaustive-deps

  const finalTitle = title.trim() || `${kind}${stage ? ': ' + stage.name : ''}`
  const lines = works.split('\n').map((x) => x.trim()).filter(Boolean)

  return (
    <Modal
      open={open} onClose={onClose} title={req ? 'Подготовить документ по требованию' : 'Новый документ ИД'} wide
      footer={<><button className="btn-secondary" onClick={onClose}>Отмена</button>
        <button className="btn-primary" disabled={!lines.length} onClick={() => {
          const id = create({ projectId, stageId: stageId || undefined, requirementId: req?.id, kind, title: finalTitle, works: lines, note: note.trim() || undefined, qualityDocIds: withMaterials ? attach : undefined })
          toast.ok('Черновик документа создан по шаблону')
          onCreated(id)
        }}>Создать черновик</button></>}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Объект">
          <select className="input" value={projectId} disabled={!!req} onChange={(e) => { setProjectId(e.target.value); setStageId('') }}>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Вид документа">
          <select className="input" aria-label="Вид документа" value={kind} disabled={!!req} onChange={(e) => setKind(e.target.value as ExecDocKind)}>
            {EXEC_KIND_GROUPS.map((g) => <optgroup key={g.group} label={g.group}>{g.kinds.map((k) => <option key={k} value={k}>{k}</option>)}</optgroup>)}
          </select>
        </Field>
        <Field label="Этап (по желанию)">
          <select className="input" value={stageId} onChange={(e) => setStageId(e.target.value)}>
            <option value="">— без привязки —</option>
            {projStages.map((s) => <option key={s.id} value={s.id}>{s.section} · {s.name}</option>)}
          </select>
        </Field>
        <Field label="Название"><input className="input" value={title} placeholder={finalTitle} onChange={(e) => setTitle(e.target.value)} /></Field>
      </div>
      <Field label="Состав работ / записей (по строке на пункт)" className="mt-3">
        <textarea className="input h-28" value={works} onChange={(e) => setWorks(e.target.value)} />
      </Field>
      {withMaterials && (
        <Field label={`Приложить документы о качестве (${attach.length} из ${projQuality.length})`} className="mt-3">
          {projQuality.length === 0 ? <p className="text-xs text-slate-500">По объекту нет действующих документов о качестве — добавьте их во вкладке «Сертификаты и паспорта».</p> : (
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border p-2">
              {projQuality.map((d) => (
                <label key={d.id} className="flex items-start gap-2 text-xs">
                  <input type="checkbox" className="mt-0.5" checked={attach.includes(d.id)} onChange={(e) => setAttach((a) => (e.target.checked ? [...a, d.id] : a.filter((x) => x !== d.id)))} />
                  <span>{qualityLine(d, materials)}{d.check === 'pending' && <span className="text-amber-600"> — ещё не прошёл входной контроль</span>}</span>
                </label>
              ))}
            </div>
          )}
        </Field>
      )}
      <Field label="Примечание" className="mt-3"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <p className="mt-3 text-xs text-slate-500">{KIND_INFO[kind].title}. Документ формируется по демо-шаблону с оговоркой: это не юридически проверенная форма.</p>
    </Modal>
  )
}
