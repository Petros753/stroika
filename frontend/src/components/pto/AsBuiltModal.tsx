import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, FileUp, Printer, Save, Sparkles } from 'lucide-react'
import { Badge, Field, Modal } from '../ui'
import { toast } from '../Toast'
import { useCurrentUser, useStore } from '../../store'
import { useCan, useVisibleProjects } from '../../lib/hooks'
import { TODAY, formatDate } from '../../lib/date'
import { putBlob } from '../../lib/blobs'
import { printHtml } from '../../lib/download'
import { loadDrawing } from '../../lib/cadLoader'
import { UNIT_TO_M, encodeCp1251, writeDxf, type Drawing } from '../../domain/dxf'
import { demoSurvey, evaluate, findAxes, gridPoints, parseSurvey, schemeDrawing, schemeSvg, type SurveyRow } from '../../domain/asbuilt'

function save(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }))
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Исполнительная схема: оси и точки — из проектного DXF, факт — из съёмки геодезиста */
export function AsBuiltModal({ projectId: initProject, fileId: initFile, onClose, onSaved }: { projectId?: string; fileId?: string; onClose: () => void; onSaved?: (docId: string) => void }) {
  const projects = useVisibleProjects()
  const files = useStore((s) => s.cadFiles)
  const stages = useStore((s) => s.stages)
  const createDoc = useStore((s) => s.createExecDoc)
  const user = useCurrentUser()
  const canSave = useCan('pto.create')
  const withFiles = projects.filter((p) => files.some((f) => f.projectId === p.id))
  const [projectId, setProjectId] = useState(initProject && withFiles.some((p) => p.id === initProject) ? initProject : withFiles[0]?.id ?? '')
  const projFiles = files.filter((f) => f.projectId === projectId)
  const [fileId, setFileId] = useState(initFile ?? projFiles[0]?.id ?? '')
  const file = projFiles.find((f) => f.id === fileId) ?? projFiles[0]
  const [drawing, setDrawing] = useState<Drawing | null>(null)
  const [err, setErr] = useState('')
  const [axisLayer, setAxisLayer] = useState('')
  const [element, setElement] = useState('Колонны 1 этажа: положение в плане и отметки')
  const [tolXY, setTolXY] = useState(8)
  const [tolZ, setTolZ] = useState(10)
  const [projectZ, setProjectZ] = useState('')
  const [surveyor, setSurveyor] = useState('')
  const [stageId, setStageId] = useState('')
  const [survey, setSurvey] = useState<SurveyRow[]>([])
  const [demo, setDemo] = useState(false)
  const [csvErrors, setCsvErrors] = useState<string[]>([])
  const csv = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setDrawing(null); setErr(''); setSurvey([]); setDemo(false)
    const v = file?.versions[file.versions.length - 1]
    if (!v) return
    loadDrawing(v.key).then((d) => { setDrawing(d); setAxisLayer(d.layers.find((l) => /ос[иь]|axis|grid/i.test(l.name))?.name ?? d.layers[0]?.name ?? '0') }).catch((e) => setErr(String(e.message ?? e)))
  }, [file?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const axes = useMemo(() => (drawing && axisLayer ? findAxes(drawing, axisLayer) : []), [drawing, axisLayer])
  const points = useMemo(() => gridPoints(axes), [axes])
  const evaluated = useMemo(() => evaluate(points, survey, tolXY, tolZ), [points, survey, tolXY, tolZ])
  const project = projects.find((p) => p.id === projectId)
  const meta = { title: 'Исполнительная схема', element, project: project?.name ?? '', author: user.name, surveyor, date: formatDate(TODAY), tolXY, tolZ, demo }
  const svg = useMemo(() => (axes.length >= 2 && points.length ? schemeSvg(axes, evaluated, meta) : ''), [axes, evaluated, element, surveyor, tolXY, tolZ, demo, project?.name]) // eslint-disable-line react-hooks/exhaustive-deps
  const measured = evaluated.filter((p) => p.measured)
  const bad = measured.filter((p) => !p.ok || !p.zOk)
  const setRow = (id: string, k: 'dx' | 'dy' | 'dz', v: string) => {
    setDemo(false)
    setSurvey((rows) => {
      const num = v.trim() === '' ? undefined : Number(v.replace(',', '.'))
      const cur = rows.find((r) => r.id === id) ?? { id, dx: 0, dy: 0 }
      const next = { ...cur, [k]: num === undefined || !Number.isFinite(num) ? (k === 'dz' ? undefined : 0) : num }
      return [...rows.filter((r) => r.id !== id), next]
    })
  }

  const saveToId = async () => {
    const works = evaluated.filter((p) => p.measured).map((p) => `Точка ${p.id}: Δx ${p.dx > 0 ? '+' : ''}${p.dx} мм, Δy ${p.dy > 0 ? '+' : ''}${p.dy} мм${p.dz !== undefined ? `, Δh ${p.dz > 0 ? '+' : ''}${p.dz} мм` : ''} — ${p.ok && p.zOk ? 'в допуске' : 'ПРЕВЫШЕНИЕ ДОПУСКА'}`)
    const id = createDoc({
      projectId, stageId: stageId || undefined, kind: 'Исполнительная схема', title: `Исполнительная схема: ${element}`, works,
      note: `Построена по чертежу «${file?.name}» (оси слоя «${axisLayer}») и данным съёмки${surveyor ? ` (${surveyor})` : ''}. Допуск в плане ±${tolXY} мм, по высоте ±${tolZ} мм. Точек: ${measured.length}, с превышением: ${bad.length}. Графическая часть — во вложении документа.`,
    })
    await putBlob(`scheme:${id}`, new Blob([svg], { type: 'image/svg+xml' })).catch(() => undefined)
    toast.ok(bad.length ? `Схема сохранена в ИД. Превышений допуска: ${bad.length} — нужно решение` : 'Исполнительная схема сохранена в ИД')
    onSaved?.(id)
  }

  return (
    <Modal open xl onClose={onClose} title="Исполнительная схема по данным съёмки"
      footer={<>
        <span className="mr-auto self-center text-xs text-slate-500">
          {measured.length ? <>Замерено точек: <b>{measured.length}</b> из {points.length} · превышений: <b className={bad.length ? 'text-red-600' : ''}>{bad.length}</b></> : 'Загрузите или введите данные съёмки'}
        </span>
        {drawing && svg && <button className="btn-secondary" onClick={() => { save(`Исп_схема_${TODAY}.dxf`, encodeCp1251(writeDxf(schemeDrawing(drawing, axes, evaluated, meta))) as BlobPart, 'application/dxf'); toast.ok('Схема выгружена в DXF — откройте в AutoCAD / nanoCAD') }}><Download size={15} />DXF</button>}
        {svg && <button className="btn-secondary" onClick={() => { printHtml(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>@page{size:A4 landscape;margin:8mm}body{margin:0}svg{width:100%;height:auto}</style></head><body>${svg}</body></html>`); toast.info('В окне печати выберите «Сохранить как PDF»') }}><Printer size={15} />PDF</button>}
        {canSave && <button className="btn-primary" disabled={!measured.length || demo} title={demo ? 'Демо-данные нельзя сохранить в исполнительную документацию' : undefined} onClick={saveToId}><Save size={15} />Сохранить в ИД</button>}
      </>}>
      {withFiles.length === 0 ? <p className="text-sm text-slate-500">Нет проектных чертежей. Загрузите DXF в «AI CAD → Чертежи DXF».</p> : (
        <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Объект"><select className="input !py-1" value={projectId} onChange={(e) => { setProjectId(e.target.value); setFileId(files.find((f) => f.projectId === e.target.value)?.id ?? '') }}>{withFiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
              <Field label="Проектный чертёж"><select className="input !py-1" value={file?.id ?? ''} onChange={(e) => setFileId(e.target.value)}>{projFiles.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></Field>
              <Field label="Слой осей"><select className="input !py-1" aria-label="Слой осей" value={axisLayer} onChange={(e) => setAxisLayer(e.target.value)}>{drawing?.layers.map((l) => <option key={l.name}>{l.name}</option>)}</select></Field>
              <Field label="Этап"><select className="input !py-1" value={stageId} onChange={(e) => setStageId(e.target.value)}><option value="">—</option>{stages.filter((s) => s.projectId === projectId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
            </div>
            <Field label="Что снимали (конструкции)"><input className="input !py-1" value={element} onChange={(e) => setElement(e.target.value)} /></Field>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Допуск в плане, мм"><input type="number" min={1} className="input !py-1" aria-label="Допуск в плане" value={tolXY} onChange={(e) => setTolXY(Math.max(1, Number(e.target.value) || 1))} /></Field>
              <Field label="Допуск по высоте, мм"><input type="number" min={1} className="input !py-1" value={tolZ} onChange={(e) => setTolZ(Math.max(1, Number(e.target.value) || 1))} /></Field>
              <Field label="Проектная отм., м"><input className="input !py-1" placeholder="для Z" value={projectZ} onChange={(e) => setProjectZ(e.target.value)} /></Field>
            </div>
            <Field label="Съёмку выполнил (геодезист)"><input className="input !py-1" value={surveyor} placeholder="ФИО, организация" onChange={(e) => setSurveyor(e.target.value)} /></Field>
            <p className="text-xs text-slate-500">Допуски задаются по проекту и нормативам для данного вида конструкций — система их не подставляет.</p>

            <div className="rounded-lg border p-2">
              <div className="mb-2 flex flex-wrap gap-1">
                <button className="btn-secondary !px-2 !py-1 text-xs" onClick={() => csv.current?.click()}><FileUp size={13} />CSV съёмки</button>
                <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => save('shablon_semki.csv', '﻿точка;dx_мм;dy_мм;dh_мм\r\n' + points.map((p) => `${p.id};;;`).join('\r\n'), 'text/csv;charset=utf-8')}>Шаблон CSV</button>
                <button className="btn-ghost !px-2 !py-1 text-xs text-amber-700" onClick={() => { setSurvey(demoSurvey(points)); setDemo(true); toast.info('Демо-данные — только для показа, сохранить в ИД нельзя') }}><Sparkles size={13} />Демо-данные</button>
                <input ref={csv} type="file" accept=".csv,.txt" className="hidden" aria-label="Файл съёмки" onChange={async (e) => {
                  const f = e.target.files?.[0]; e.target.value = ''
                  if (!f || !drawing) return
                  const z = projectZ.trim() ? Number(projectZ.replace(',', '.')) : undefined
                  const r = parseSurvey(await f.text(), points, UNIT_TO_M[drawing.units] * 1000, Number.isFinite(z) ? z : undefined)
                  setSurvey(r.rows); setDemo(false); setCsvErrors(r.errors)
                  toast.ok(`Загружено точек: ${r.rows.length}${r.errors.length ? `, ошибок: ${r.errors.length}` : ''}`)
                }} />
              </div>
              {csvErrors.length > 0 && <ul className="mb-2 list-disc pl-4 text-xs text-red-600">{csvErrors.slice(0, 5).map((x) => <li key={x}>{x}</li>)}</ul>}
              <p className="mb-1 text-[11px] text-slate-500">CSV: «точка;dx;dy;dh» (отклонения, мм) или «точка;X;Y;Z» (координаты чертежа; Z в м — нужна проектная отметка).</p>
              <div className="max-h-56 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead><tr className="text-slate-500"><th className="text-left">Точка</th><th>Δx</th><th>Δy</th><th>Δh</th><th /></tr></thead>
                  <tbody>
                    {evaluated.map((p) => (
                      <tr key={p.id} data-pt={p.id}>
                        <td className="py-0.5 pr-1 font-medium">{p.id}</td>
                        {(['dx', 'dy', 'dz'] as const).map((k) => (
                          <td key={k} className="px-0.5"><input className="input !w-14 !px-1 !py-0.5 text-right text-xs" aria-label={`${p.id} ${k}`} value={p.measured ? (p[k] ?? '') : ''} onChange={(e) => setRow(p.id, k, e.target.value)} /></td>
                        ))}
                        <td className="pl-1">{p.measured ? (p.ok && p.zOk ? <Badge tone="green">ок</Badge> : <Badge tone="red">&gt; доп.</Badge>) : <span className="text-slate-400">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div className="min-w-0">
            {err ? <p className="text-sm text-red-600">{err}</p> : !drawing ? <p className="text-sm text-slate-500">Загрузка чертежа…</p> : !svg ? <p className="text-sm text-amber-700">На слое «{axisLayer}» не найдено осей (нужны горизонтальные и вертикальные отрезки). Выберите слой осей.</p> : (
              <div className="overflow-auto rounded-lg border bg-white p-2 [&_svg]:h-auto [&_svg]:w-full" data-testid="scheme-preview" dangerouslySetInnerHTML={{ __html: svg }} />
            )}
            {demo && <p className="mt-2 text-xs text-amber-700">Показаны демо-данные съёмки — для исполнительной документации загрузите реальные замеры геодезиста.</p>}
          </div>
        </div>
      )}
    </Modal>
  )
}
