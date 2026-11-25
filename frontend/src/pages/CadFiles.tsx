import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Download, Eye, EyeOff, FileUp, Maximize2, MousePointer2, PenLine, Ruler, Save, Trash2, Type } from 'lucide-react'
import clsx from 'clsx'
import { Badge, EmptyState, Field, Modal, Tabs } from '../components/ui'
import { DxfViewer, renderList, type Overlay, type ViewEvent } from '../components/cad/DxfViewer'
import { toast } from '../components/Toast'
import { useStore } from '../store'
import { useCan, useUserName, useVisibleProjects } from '../lib/hooks'
import { formatDate } from '../lib/date'
import { genId } from '../lib/format'
import { putBlob } from '../lib/blobs'
import { loadDrawing } from '../lib/cadLoader'
import {
  UNIT_LABEL, UNIT_TO_M, area, cssColor, decodeDxf, distTo, encodeCp1251, length, newId, parseDxf, writeDxf, type Drawing, type DxfUnits, type Ent,
} from '../domain/dxf'
import { demoDrawing } from '../domain/dxfDemo'
import { blockCounts, layerStats, openings, takeoff, takeoffCsv } from '../domain/dxfCalc'

type Tool = 'select' | 'measure' | 'line' | 'text'
type Side = 'layers' | 'props' | 'calc' | 'versions'
const fmt = (v: number, d = 2) => v.toLocaleString('ru-RU', { maximumFractionDigits: d, minimumFractionDigits: d })

function saveBlob(name: string, bytes: Uint8Array) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/dxf' }))
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function CadFiles() {
  const [params, setParams] = useSearchParams()
  const projects = useVisibleProjects()
  const files = useStore((s) => s.cadFiles)
  const addFile = useStore((s) => s.addCadFile)
  const addVersion = useStore((s) => s.addCadFileVersion)
  const canEdit = useCan('cad.edit')
  const canPto = useCan('pto.create')
  const nav = useNavigate()
  const name = useUserName()

  const projectId = projects.find((p) => p.id === params.get('project'))?.id ?? projects[0]?.id ?? ''
  const projFiles = files.filter((f) => f.projectId === projectId)
  const [fileId, setFileId] = useState<string | null>(projFiles[0]?.id ?? null)
  const file = files.find((f) => f.id === fileId && f.projectId === projectId) ?? projFiles[0]
  const [verNo, setVerNo] = useState<number | null>(null)
  const ver = file?.versions.find((v) => v.version === verNo) ?? file?.versions[file.versions.length - 1]

  const [drawing, setDrawing] = useState<Drawing | null>(null)
  const [err, setErr] = useState('')
  const [edits, setEdits] = useState<string[]>([])
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<string | null>(null)
  const [highlight, setHighlight] = useState<Set<string>>(new Set())
  const [tool, setTool] = useState<Tool>('select')
  const [side, setSide] = useState<Side>('layers')
  const [fitKey, setFitKey] = useState(0)
  const [pending, setPending] = useState<{ x: number; y: number } | null>(null)
  const [hover, setHover] = useState<ViewEvent | null>(null)
  const [measure, setMeasure] = useState<Overlay | null>(null)
  const [newLayer, setNewLayer] = useState('')
  const [textValue, setTextValue] = useState('')
  const [dwgInfo, setDwgInfo] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)
  const [note, setNote] = useState('')
  const upload = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setDrawing(null); setErr(''); setEdits([]); setSelected(null); setHighlight(new Set()); setMeasure(null); setPending(null)
    if (!ver) return
    loadDrawing(ver.key).then((d) => { setDrawing(d); setNewLayer(d.layers.find((l) => l.name !== '0')?.name ?? '0'); setFitKey((k) => k + 1) }).catch((e) => setErr(String(e.message ?? e)))
  }, [ver?.key]) // eslint-disable-line react-hooks/exhaustive-deps

  const items = useMemo(() => (drawing ? renderList(drawing) : []), [drawing])
  const sel = drawing?.ents.find((e) => e.id === selected)
  const k = drawing ? UNIT_TO_M[drawing.units] : 1
  const u = drawing ? UNIT_LABEL[drawing.units] : ''
  const mutate = (fn: (d: Drawing) => Drawing, label: string) => { setDrawing((d) => (d ? fn(d) : d)); setEdits((e) => [...e, label]) }

  const onClick = (ev: ViewEvent) => {
    if (!drawing) return
    if (tool === 'select') {
      let best: string | null = null, bd = 6 * ev.pxToWorld
      for (const it of items) { if (hidden.has(it.layer)) continue; const d = distTo(it.e, ev.x, ev.y); if (d < bd) { bd = d; best = it.pid } }
      setSelected(best); setHighlight(new Set()); if (best) setSide('props')
      return
    }
    const p = { x: ev.sx, y: ev.sy }
    if (tool === 'measure') {
      if (!pending || measure?.x2 !== undefined && !pending) { setPending(p); setMeasure({ kind: 'point', x1: p.x, y1: p.y }); return }
      const dist = Math.hypot(p.x - pending.x, p.y - pending.y)
      setMeasure({ kind: 'line', x1: pending.x, y1: pending.y, x2: p.x, y2: p.y, label: `${fmt(dist, 0)} ${u} = ${fmt(dist * k, 3)} м` })
      setPending(null); return
    }
    if (!canEdit) return
    if (tool === 'line') {
      if (!pending) { setPending(p); return }
      const e: Ent = { id: newId(), layer: newLayer, t: 'line', x1: pending.x, y1: pending.y, x2: p.x, y2: p.y }
      mutate((d) => ({ ...d, ents: [...d.ents, e] }), `Линия на слое «${newLayer}», ${fmt(Math.hypot(p.x - pending.x, p.y - pending.y) * k, 3)} м`)
      setPending(null); return
    }
    if (tool === 'text') {
      if (!textValue.trim()) { toast.info('Введите текст на панели инструментов'); return }
      const h = Math.max(1, (drawing.units === 'mm' ? 300 : drawing.units === 'cm' ? 30 : 0.3))
      const e: Ent = { id: newId(), layer: newLayer, t: 'text', x: p.x, y: p.y, h, text: textValue.trim(), rot: 0 }
      mutate((d) => ({ ...d, ents: [...d.ents, e] }), `Текст «${textValue.trim()}» на слое «${newLayer}»`)
    }
  }
  const removeSelected = () => {
    if (!sel) return
    mutate((d) => ({ ...d, ents: d.ents.filter((e) => e.id !== sel.id) }), `Удалён объект ${sel.t === 'insert' ? `блок «${sel.block}»` : TYPE_LABEL[sel.t]} (слой «${sel.layer}»)`)
    setSelected(null)
  }
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return
      if (e.key === 'Delete' && canEdit) removeSelected()
      if (e.key === 'Escape') { setPending(null); setMeasure(null) }
    }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  })

  const onUpload = async (f: File) => {
    if (/\.dwg$/i.test(f.name)) { setDwgInfo(true); return }
    if (!/\.dxf$/i.test(f.name)) { toast.error('Поддерживается DXF (DWG — через конвертацию)'); return }
    try {
      const buf = await f.arrayBuffer()
      const d = parseDxf(decodeDxf(buf))
      if (!d.ents.length) throw new Error('В файле нет поддерживаемых объектов')
      const key = genId('dxf')
      await putBlob(key, new Blob([buf]))
      const id = addFile({ projectId, name: f.name, format: 'DXF', key, size: f.size })
      setFileId(id); setVerNo(null)
      toast.ok(`Чертёж загружен: ${d.ents.length} объектов, ${d.layers.length} слоёв${d.unitsFromFile ? '' : ' — проверьте единицы измерения'}`)
    } catch (e) { toast.error('Не удалось прочитать DXF: ' + String((e as Error).message ?? e)) }
  }
  const saveVersion = async () => {
    if (!drawing || !file) return
    const bytes = encodeCp1251(writeDxf(drawing))
    const key = genId('dxf')
    await putBlob(key, new Blob([bytes as BlobPart]))
    const v = addVersion(file.id, { key, note: note.trim() || `Правки: ${edits.length}`, edits, size: bytes.length })
    setSaveOpen(false); setNote(''); setVerNo(v); toast.ok(`Сохранена версия ${v}. Предыдущие версии не изменены`)
  }

  const stats = useMemo(() => (drawing ? layerStats(drawing) : []), [drawing])
  const overlays: Overlay[] = [
    ...(measure ? [measure] : []),
    ...(pending && hover && tool !== 'select' ? [{ kind: 'line' as const, x1: pending.x, y1: pending.y, x2: hover.sx, y2: hover.sy, label: `${fmt(Math.hypot(hover.sx - pending.x, hover.sy - pending.y) * k, 3)} м`, color: tool === 'line' ? '#4ade80' : '#facc15' }] : []),
    ...(hover?.snapped && tool !== 'select' ? [{ kind: 'point' as const, x1: hover.sx, y1: hover.sy, color: '#f472b6' }] : []),
  ]

  if (!projects.length) return <EmptyState title="Нет доступных объектов" />

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select className="input !w-auto" aria-label="Объект" value={projectId} onChange={(e) => { const n = new URLSearchParams(params); n.set('project', e.target.value); setParams(n, { replace: true }); setFileId(null); setVerNo(null) }}>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className="input !w-auto min-w-[220px]" aria-label="Чертёж" value={file?.id ?? ''} onChange={(e) => { setFileId(e.target.value); setVerNo(null) }} disabled={!projFiles.length}>
          {projFiles.length === 0 && <option value="">Нет чертежей</option>}
          {projFiles.map((f) => <option key={f.id} value={f.id}>{f.name} · v{f.versions.length}</option>)}
        </select>
        <div className="ml-auto flex gap-2">
          {canPto && file && <button className="btn-secondary" onClick={() => nav(`/pto?project=${projectId}&asbuilt=1&file=${file.id}`)}><Ruler size={15} />Исполнительная схема</button>}
          <button className="btn-secondary" onClick={() => { saveBlob('primer_plan_etazha.dxf', encodeCp1251(writeDxf(demoDrawing()))); toast.ok('Пример DXF скачан — можно загрузить его обратно') }}><Download size={15} />Пример DXF</button>
          {canEdit && <button className="btn-primary" onClick={() => upload.current?.click()}><FileUp size={15} />Загрузить DXF / DWG</button>}
          <input ref={upload} type="file" accept=".dxf,.dwg" className="hidden" aria-label="Файл чертежа" onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = '' }} />
        </div>
      </div>

      {!file ? (
        <EmptyState title="Чертежей по объекту нет" hint="Загрузите DXF из AutoCAD, nanoCAD, Компас или Renga. DWG сохраните как DXF — в рабочей версии конвертация на сервере." />
      ) : (
        <div className="grid gap-3 xl:grid-cols-[1fr_340px]">
          <div className="card flex min-w-0 flex-col overflow-hidden">
            <div className="flex flex-wrap items-center gap-1 border-b p-2">
              {([['select', 'Выбор', MousePointer2], ['measure', 'Измерить', Ruler], ...(canEdit ? [['line', 'Линия', PenLine], ['text', 'Текст', Type]] : [])] as [Tool, string, typeof Ruler][]).map(([t, l, I]) => (
                <button key={t} onClick={() => { setTool(t); setPending(null) }} className={clsx('btn-secondary !px-2 !py-1 text-xs', tool === t && '!border-brand-500 !bg-brand-50 !text-brand-700 dark:!bg-brand-500/10')}><I size={14} />{l}</button>
              ))}
              {canEdit && (tool === 'line' || tool === 'text') && (
                <select className="input !w-auto !py-1 text-xs" aria-label="Слой для новых объектов" value={newLayer} onChange={(e) => setNewLayer(e.target.value)}>
                  {drawing?.layers.map((l) => <option key={l.name}>{l.name}</option>)}
                </select>
              )}
              {canEdit && tool === 'text' && <input className="input !w-48 !py-1 text-xs" placeholder="Текст, затем клик по чертежу" aria-label="Текст надписи" value={textValue} onChange={(e) => setTextValue(e.target.value)} />}
              {canEdit && sel && <button className="btn-secondary !px-2 !py-1 text-xs text-red-600" onClick={removeSelected}><Trash2 size={14} />Удалить</button>}
              <button className="btn-ghost ml-auto !px-2 !py-1 text-xs" onClick={() => setFitKey((x) => x + 1)}><Maximize2 size={14} />Вписать</button>
            </div>
            <div className="relative h-[560px]">
              {err ? <p className="p-10 text-sm text-red-600">{err}</p> : !drawing ? <p className="p-10 text-sm text-slate-500">Загрузка чертежа…</p> : (
                <DxfViewer drawing={drawing} hidden={hidden} selectedId={selected} highlight={highlight} overlays={overlays} fitKey={fitKey}
                  cursor={tool === 'select' ? 'default' : 'crosshair'} onClick={onClick} onMove={setHover} />
              )}
              <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/60 px-2 py-0.5 text-[11px] text-slate-200">
                {hover ? `X ${fmt(hover.x, 0)}  Y ${fmt(hover.y, 0)} ${u}` : 'Колесо — масштаб, перетаскивание — сдвиг'}{tool === 'measure' && ' · Измерение: две точки (привязка к вершинам), Esc — сброс'}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t p-2 text-xs">
              <span className="text-slate-500">{file.name} · v{ver?.version} · {ver && formatDate(ver.date)} · {ver && name(ver.authorId)}</span>
              {drawing && !drawing.unitsFromFile && (
                <label className="flex items-center gap-1 text-amber-700 dark:text-amber-300">Единицы в файле не указаны:
                  <select className="input !w-auto !py-0.5 text-xs" value={drawing.units} onChange={(e) => setDrawing({ ...drawing, units: e.target.value as DxfUnits })}>
                    {(['mm', 'cm', 'm'] as DxfUnits[]).map((x) => <option key={x} value={x}>{UNIT_LABEL[x]}</option>)}
                  </select>
                </label>
              )}
              {drawing && Object.keys(drawing.skipped).length > 0 && <span className="text-slate-500" title={Object.entries(drawing.skipped).map(([t, n]) => `${t}: ${n}`).join(', ')}>Не отображаются: {Object.values(drawing.skipped).reduce((a, b) => a + b, 0)} объектов (размеры, штриховки…)</span>}
              {edits.length > 0 && <Badge tone="amber">несохранённых правок: {edits.length}</Badge>}
              {drawing && <button className="btn-secondary ml-auto !py-1 text-xs" onClick={() => { saveBlob(file.name.replace(/(\.dxf)?$/i, edits.length ? '_edit.dxf' : '.dxf'), encodeCp1251(writeDxf(drawing))); toast.ok('DXF скачан — открывается в AutoCAD, nanoCAD, LibreCAD') }}><Download size={13} />Скачать DXF</button>}
              {canEdit && <button className="btn-primary !py-1 text-xs" disabled={!edits.length} onClick={() => setSaveOpen(true)}><Save size={13} />Сохранить версию</button>}
            </div>
          </div>

          <div className="card min-w-0 p-3">
            <Tabs<Side> value={side} onChange={setSide} tabs={[{ key: 'layers', label: 'Слои' }, { key: 'props', label: 'Свойства' }, { key: 'calc', label: 'Расчёты' }, { key: 'versions', label: 'Версии' }]} />
            {!drawing ? null : side === 'layers' ? (
              <div className="space-y-1 text-sm">
                {stats.filter((s) => s.count > 0).map((s) => {
                  const l = drawing.layers.find((x) => x.name === s.layer)
                  const off = hidden.has(s.layer)
                  return (
                    <div key={s.layer} data-layer={s.layer} className="flex items-center gap-2 rounded-lg border px-2 py-1.5">
                      <button aria-label={`Видимость слоя ${s.layer}`} onClick={() => setHidden((h) => { const n = new Set(h); if (n.has(s.layer)) n.delete(s.layer); else n.add(s.layer); return n })}>{off ? <EyeOff size={15} className="text-slate-400" /> : <Eye size={15} />}</button>
                      <span className="h-3 w-3 rounded-sm border" style={{ background: cssColor(l?.color, true) }} />
                      <button className={clsx('min-w-0 flex-1 truncate text-left', off && 'text-slate-400')} onClick={() => setHighlight(new Set(drawing.ents.filter((e) => e.layer === s.layer).map((e) => e.id)))}>{s.layer}</button>
                      <span className="text-xs text-slate-500">{s.count} · {s.inserts ? `${s.inserts} бл.` : `${fmt(s.length, 1)} м`}</span>
                    </div>
                  )
                })}
                <p className="pt-1 text-xs text-slate-500">Клик по названию — подсветить объекты слоя. Длины — в метрах ({UNIT_LABEL[drawing.units]} в файле).</p>
              </div>
            ) : side === 'props' ? (
              sel ? <Props e={sel} k={k} u={u} layers={drawing.layers.map((l) => l.name)} canEdit={canEdit}
                onLayer={(layer) => { mutate((d) => ({ ...d, ents: d.ents.map((e) => (e.id === sel.id ? { ...e, layer } : e)) }), `Объект перенесён на слой «${layer}»`) }} />
                : <p className="text-sm text-slate-500">Выберите объект на чертеже (инструмент «Выбор»).</p>
            ) : side === 'calc' ? (
              <Calc drawing={drawing} fileName={file.name} onRooms={(ids) => setHighlight(new Set(ids))} />
            ) : (
              <div className="space-y-1">
                {file.versions.map((v) => (
                  <button key={v.version} data-cadver={v.version} onClick={() => setVerNo(v.version)} className={clsx('w-full rounded-lg border p-2 text-left text-xs', v.version === ver?.version ? 'border-brand-500 bg-brand-50/60 dark:bg-brand-500/10' : 'hover:border-slate-400')}>
                    <div className="flex justify-between font-medium"><span>v{v.version}{v.version === 1 && ' · исходный'}</span><span className="text-slate-500">{formatDate(v.date)}</span></div>
                    <div className="text-slate-500">{name(v.authorId)} · {v.note}</div>
                    {v.edits.length > 0 && <ul className="mt-1 list-disc pl-4 text-slate-600 dark:text-slate-400">{v.edits.slice(0, 6).map((e, i) => <li key={i}>{e}</li>)}{v.edits.length > 6 && <li>… ещё {v.edits.length - 6}</li>}</ul>}
                  </button>
                ))}
                {edits.length > 0 && <div className="rounded-lg border border-amber-300 p-2 text-xs"><b>Несохранённые правки:</b><ul className="list-disc pl-4">{edits.map((e, i) => <li key={i}>{e}</li>)}</ul></div>}
              </div>
            )}
          </div>
        </div>
      )}

      <Modal open={dwgInfo} onClose={() => setDwgInfo(false)} title="DWG: нужна конвертация" footer={<button className="btn-primary" onClick={() => setDwgInfo(false)}>Понятно</button>}>
        <p className="text-sm">DWG — закрытый формат Autodesk, в браузере его надёжно не прочитать. В рабочей версии сервер автоматически конвертирует DWG в DXF (ODA File Converter или LibreDWG) и чертёж открывается здесь же.</p>
        <p className="mt-2 text-sm">Сейчас: откройте файл в AutoCAD / nanoCAD и сохраните как <b>DXF</b> (любая версия), затем загрузите.</p>
      </Modal>
      <Modal open={saveOpen} onClose={() => setSaveOpen(false)} title="Сохранить новую версию чертежа"
        footer={<><button className="btn-secondary" onClick={() => setSaveOpen(false)}>Отмена</button><button className="btn-primary" onClick={saveVersion}>Сохранить v{(file?.versions.length ?? 0) + 1}</button></>}>
        <Field label="Комментарий к версии"><input className="input" autoFocus value={note} placeholder="Например: изменение по письму заказчика № 45" onChange={(e) => setNote(e.target.value)} /></Field>
        <ul className="mt-3 list-disc pl-5 text-xs text-slate-600 dark:text-slate-400">{edits.map((e, i) => <li key={i}>{e}</li>)}</ul>
        <p className="mt-2 text-xs text-slate-500">Предыдущие версии сохраняются. Файл записывается в DXF R12 (Windows-1251) — открывается в AutoCAD, nanoCAD, LibreCAD.</p>
      </Modal>
    </div>
  )
}

const TYPE_LABEL: Record<Ent['t'], string> = { line: 'Отрезок', poly: 'Полилиния', circle: 'Окружность', arc: 'Дуга', text: 'Текст', insert: 'Блок' }

function Props({ e, k, u, layers, canEdit, onLayer }: { e: Ent; k: number; u: string; layers: string[]; canEdit: boolean; onLayer: (l: string) => void }) {
  const L = length(e), A = area(e)
  const rows: [string, string][] = [['Тип', e.t === 'insert' ? `Блок «${e.block}»` : TYPE_LABEL[e.t] + (e.t === 'poly' && e.closed ? ' (замкнутая)' : '')]]
  if (L) rows.push([e.t === 'poly' && e.closed ? 'Периметр' : 'Длина', `${fmt(L, 0)} ${u} = ${fmt(L * k, 3)} м`])
  if (A) rows.push(['Площадь', `${fmt(A * k * k, 2)} м²`])
  if (e.t === 'poly') rows.push(['Вершин', String(e.pts.length)])
  if (e.t === 'circle' || e.t === 'arc') rows.push(['Радиус', `${fmt(e.r, 0)} ${u}`])
  if (e.t === 'text') rows.push(['Текст', e.text], ['Высота', `${fmt(e.h, 0)} ${u}`])
  if (e.t === 'insert') rows.push(['Точка вставки', `${fmt(e.x, 0)}; ${fmt(e.y, 0)}`], ['Поворот', `${fmt(e.rot, 0)}°`])
  return (
    <div className="space-y-2 text-sm">
      {rows.map(([a, b]) => <div key={a} className="flex justify-between gap-3 border-b pb-1"><span className="text-slate-500">{a}</span><span className="text-right font-medium" data-prop={a}>{b}</span></div>)}
      <Field label="Слой">
        <select className="input" value={e.layer} disabled={!canEdit} onChange={(ev) => onLayer(ev.target.value)}>{layers.map((l) => <option key={l}>{l}</option>)}</select>
      </Field>
    </div>
  )
}

function Calc({ drawing, fileName, onRooms }: { drawing: Drawing; fileName: string; onRooms: (ids: string[]) => void }) {
  const names = drawing.layers.map((l) => l.name)
  const stats = layerStats(drawing)
  const guess = (re: RegExp, fallback: (s: typeof stats) => string) => names.find((n) => re.test(n)) ?? fallback(stats)
  const op = openings(drawing)
  const [p, setP] = useState(() => ({
    wallLayer: guess(/стен|wall/i, (s) => [...s].sort((a, b) => b.length - a.length)[0]?.layer ?? '0'),
    roomLayer: guess(/помещ|room|площ/i, (s) => [...s].sort((a, b) => b.closedCount - a.closedCount)[0]?.layer ?? '0'),
    doubleLines: true, height: 3, thicknessMm: 380, autoOpen: true, openingsArea: 0,
  }))
  const openArea = p.autoOpen ? op.doorArea + op.windowArea : p.openingsArea
  const t = takeoff(drawing, { ...p, openingsArea: openArea })
  const blocks = blockCounts(drawing)
  const set = (patch: Partial<typeof p>) => setP((x) => ({ ...x, ...patch }))
  const R = ({ l, v, unit }: { l: string; v: number; unit: string }) => <div className="flex justify-between border-b py-1 text-sm" data-calc={l}><span className="text-slate-500">{l}</span><b>{fmt(v)} {unit}</b></div>
  return (
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Слой стен"><select className="input !py-1" aria-label="Слой стен" value={p.wallLayer} onChange={(e) => set({ wallLayer: e.target.value })}>{names.map((n) => <option key={n}>{n}</option>)}</select></Field>
        <Field label="Слой помещений"><select className="input !py-1" aria-label="Слой помещений" value={p.roomLayer} onChange={(e) => set({ roomLayer: e.target.value })}>{names.map((n) => <option key={n}>{n}</option>)}</select></Field>
        <Field label="Высота, м"><input type="number" step="0.1" min={0} className="input !py-1" aria-label="Высота" value={p.height} onChange={(e) => set({ height: Math.max(0, Number(e.target.value) || 0) })} /></Field>
        <Field label="Толщина стен, мм"><input type="number" min={0} className="input !py-1" value={p.thicknessMm} onChange={(e) => set({ thicknessMm: Math.max(0, Number(e.target.value) || 0) })} /></Field>
      </div>
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={p.doubleLines} onChange={(e) => set({ doubleLines: e.target.checked })} />Стены нарисованы двумя линиями (длина ÷ 2)</label>
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={p.autoOpen} onChange={(e) => set({ autoOpen: e.target.checked })} />Проёмы по блокам: дверей {op.doors}, окон {op.windows} = {fmt(op.doorArea + op.windowArea)} м²</label>
      {!p.autoOpen && <Field label="Проёмы, м²"><input type="number" min={0} className="input !py-1" value={p.openingsArea} onChange={(e) => set({ openingsArea: Math.max(0, Number(e.target.value) || 0) })} /></Field>}
      <div>
        <R l="Стены: длина по оси" v={t.wallLength} unit="м" />
        <R l="Стены: площадь за вычетом проёмов" v={t.wallArea} unit="м²" />
        <R l="Стены: объём" v={t.wallVolume} unit="м³" />
        <R l="Полы / потолки" v={t.floorArea} unit="м²" />
        <R l="Отделка стен помещений" v={t.finishArea} unit="м²" />
        <R l="Плинтус" v={t.skirting} unit="м" />
      </div>
      <div>
        <div className="mb-1 font-semibold">Помещения ({t.rooms.length})</div>
        {t.rooms.length === 0 ? <p className="text-xs text-slate-500">На слое нет замкнутых контуров</p> : t.rooms.map((r) => (
          <button key={r.id} data-room={r.name} className="flex w-full justify-between rounded px-1 py-0.5 text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => onRooms([r.id])}>
            <span>{r.name}</span><span>{fmt(r.area)} м² · P {fmt(r.perimeter)} м</span>
          </button>
        ))}
        {t.rooms.length > 0 && <button className="mt-1 text-xs text-brand-600 hover:underline" onClick={() => onRooms(t.rooms.map((r) => r.id))}>Подсветить все</button>}
      </div>
      {blocks.length > 0 && (
        <div>
          <div className="mb-1 font-semibold">Блоки (спецификация)</div>
          {blocks.map((b) => <div key={b.block + b.layer} className="flex justify-between text-xs"><span>{b.block} <span className="text-slate-400">· {b.layer}</span></span><b>{b.count} шт</b></div>)}
        </div>
      )}
      <button className="btn-secondary w-full" onClick={() => { download(`vedomost_${fileName.replace(/\.dxf$/i, '')}.csv`, takeoffCsv(fileName, t, blocks, { height: p.height, thicknessMm: p.thicknessMm, openingsArea: openArea })); toast.ok('Ведомость объёмов выгружена (CSV, открывается в Excel)') }}><Download size={15} />Ведомость объёмов CSV</button>
      <p className="text-xs text-slate-500">Подсчёт объёмов по геометрии чертежа (обмер). Прочностные и конструктивные расчёты здесь не выполняются — их делает инженер-конструктор в сертифицированном ПО.</p>
    </div>
  )
}

function download(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
