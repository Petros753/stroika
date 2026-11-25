import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { ArrowUpRight, Crop, Download, Eye, EyeOff, Grid3x3, RotateCcw, RotateCw, Save, Square, Stamp, Type, Undo2 } from 'lucide-react'
import clsx from 'clsx'
import { Badge, Modal } from '../ui'
import { toast } from '../Toast'
import { useStore } from '../../store'
import { useCan, useUserName } from '../../lib/hooks'
import { formatDate } from '../../lib/date'
import { applyOp, applyOps, describeOp } from '../../domain/photo'
import { downloadCanvas, loadBase } from '../../lib/photoLoader'
import type { PhotoOp } from '../../domain/types'

type Tool = 'arrow' | 'rect' | 'text' | 'crop' | 'blur'
const COLORS = ['#ef4444', '#facc15', '#ffffff', '#22c55e']
const TOOLS: { key: Tool; label: string; icon: typeof Crop }[] = [
  { key: 'arrow', label: 'Стрелка', icon: ArrowUpRight }, { key: 'rect', label: 'Рамка', icon: Square }, { key: 'text', label: 'Подпись', icon: Type },
  { key: 'crop', label: 'Кадрировать', icon: Crop }, { key: 'blur', label: 'Размыть', icon: Grid3x3 },
]

export function PhotoEditor({ id, onClose }: { id: string; onClose: () => void }) {
  const photo = useStore((s) => s.photos.find((p) => p.id === id))
  const project = useStore((s) => s.projects.find((p) => p.id === photo?.projectId))
  const stage = useStore((s) => s.stages.find((x) => x.id === photo?.stageId))
  const saveVersion = useStore((s) => s.savePhotoVersion)
  const canEdit = useCan('pto.create')
  const name = useUserName()

  const [verNo, setVerNo] = useState(photo?.versions.length ?? 1)
  const [newOps, setNewOps] = useState<PhotoOp[]>([])
  const [tool, setTool] = useState<Tool>('arrow')
  const [color, setColor] = useState(COLORS[0])
  const [text, setText] = useState('')
  const [base, setBase] = useState<HTMLCanvasElement | null>(null)
  const [err, setErr] = useState('')
  const [original, setOriginal] = useState(false)
  const [drag, setDrag] = useState<null | { x0: number; y0: number; x1: number; y1: number }>(null)
  const view = useRef<HTMLCanvasElement>(null)

  useEffect(() => { if (photo) loadBase(photo.src).then(setBase).catch((e) => setErr(String(e.message ?? e))) }, [photo?.src]) // eslint-disable-line react-hooks/exhaustive-deps
  const ver = photo?.versions.find((v) => v.version === verNo) ?? photo?.versions[photo.versions.length - 1]
  const rendered = useMemo(() => (base && ver ? applyOps(base, [...ver.ops, ...newOps]) : null), [base, ver, newOps])
  const shown = original ? base : rendered

  // отрисовка в окно + превью перетаскивания
  useEffect(() => {
    const c = view.current
    if (!c || !shown) return
    const maxW = Math.min(880, (c.parentElement?.clientWidth ?? 880)), maxH = 540
    const k = Math.min(maxW / shown.width, maxH / shown.height)
    c.width = Math.round(shown.width * k); c.height = Math.round(shown.height * k)
    const g = c.getContext('2d')!
    g.drawImage(shown, 0, 0, c.width, c.height)
    if (drag) {
      const x = Math.min(drag.x0, drag.x1) * c.width, y = Math.min(drag.y0, drag.y1) * c.height
      const w = Math.abs(drag.x1 - drag.x0) * c.width, h = Math.abs(drag.y1 - drag.y0) * c.height
      g.setLineDash([6, 4]); g.lineWidth = 2; g.strokeStyle = tool === 'crop' ? '#ffffff' : tool === 'blur' ? '#60a5fa' : color
      if (tool === 'arrow') { g.beginPath(); g.moveTo(drag.x0 * c.width, drag.y0 * c.height); g.lineTo(drag.x1 * c.width, drag.y1 * c.height); g.stroke() }
      else g.strokeRect(x, y, w, h)
      if (tool === 'crop') { g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(0, 0, c.width, y); g.fillRect(0, y + h, c.width, c.height - y - h); g.fillRect(0, y, x, h); g.fillRect(x + w, y, c.width - x - w, h) }
      g.setLineDash([])
    }
  }, [shown, drag, tool, color])

  if (!photo || !ver) return null
  const editable = canEdit && !original
  const push = (op: PhotoOp) => {
    // проверяем, что правка применима (например, кадр не нулевой)
    if (rendered) applyOp(rendered, op)
    setNewOps((o) => (op.t === 'adjust' && o[o.length - 1]?.t === 'adjust' ? [...o.slice(0, -1), op] : [...o, op]))
  }
  const pos = (e: RPointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) }
  }
  const onDown = (e: RPointerEvent<HTMLCanvasElement>) => {
    if (!editable) return
    const p = pos(e)
    if (tool === 'text') {
      if (!text.trim()) { toast.info('Введите текст подписи в поле над снимком'); return }
      push({ t: 'text', x: p.x, y: p.y, text: text.trim(), color }); return
    }
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y })
  }
  const onMove = (e: RPointerEvent<HTMLCanvasElement>) => { if (drag) { const p = pos(e); setDrag({ ...drag, x1: p.x, y1: p.y }) } }
  const onUp = () => {
    if (!drag) return
    const x = Math.min(drag.x0, drag.x1), y = Math.min(drag.y0, drag.y1), w = Math.abs(drag.x1 - drag.x0), h = Math.abs(drag.y1 - drag.y0)
    setDrag(null)
    if (tool === 'arrow') { if (Math.hypot(w, h) > 0.02) push({ t: 'arrow', x1: drag.x0, y1: drag.y0, x2: drag.x1, y2: drag.y1, color }); return }
    if (w < 0.02 || h < 0.02) return
    if (tool === 'rect') push({ t: 'rect', x, y, w, h, color })
    else if (tool === 'blur') push({ t: 'blur', x, y, w, h })
    else if (tool === 'crop') push({ t: 'crop', x, y, w, h })
  }
  const adjust = [...newOps].reverse().find((o): o is Extract<PhotoOp, { t: 'adjust' }> => o.t === 'adjust')
  const stampText = [formatDate(photo.takenAt), project?.name, stage ? `${stage.section} · ${stage.name}` : ''].filter(Boolean).join(' · ')

  return (
    <Modal open xl onClose={onClose} title={photo.title}
      footer={<>
        <span className="mr-auto self-center text-xs text-slate-500">{project?.name}{stage ? ` · ${stage.name}` : ''} · снято {formatDate(photo.takenAt)} · {name(photo.authorId)}</span>
        {rendered && <button className="btn-secondary" onClick={() => { downloadCanvas(rendered, `foto_${photo.id}_v${ver.version}${newOps.length ? '_new' : ''}.jpg`); toast.ok('Фото скачано (JPEG)') }}><Download size={15} />Скачать JPEG</button>}
        {canEdit && <button className="btn-primary" disabled={!newOps.length} onClick={() => {
          const v = saveVersion(photo.id, [...ver.ops, ...newOps], newOps.map(describeOp))
          setNewOps([]); setVerNo(v); toast.ok(`Сохранена версия ${v}. Оригинал не изменён`)
        }}><Save size={15} />Сохранить как версию {photo.versions.length + 1}</button>}
      </>}>
      <div className="grid gap-4 lg:grid-cols-[1fr_240px]">
        <div className="min-w-0">
          {canEdit && (
            <div className="mb-2 flex flex-wrap items-center gap-1">
              {TOOLS.map((t) => (
                <button key={t.key} title={t.label} onClick={() => setTool(t.key)} className={clsx('btn-secondary !px-2 !py-1 text-xs', tool === t.key && '!border-brand-500 !bg-brand-50 !text-brand-700 dark:!bg-brand-500/10')}>
                  <t.icon size={14} />{t.label}
                </button>
              ))}
              <span className="mx-1 h-5 border-l" />
              <button className="btn-secondary !px-2 !py-1 text-xs" title="Повернуть влево" onClick={() => push({ t: 'rotate', deg: -90 })}><RotateCcw size={14} /></button>
              <button className="btn-secondary !px-2 !py-1 text-xs" title="Повернуть вправо" onClick={() => push({ t: 'rotate', deg: 90 })}><RotateCw size={14} /></button>
              <button className="btn-secondary !px-2 !py-1 text-xs" onClick={() => push({ t: 'stamp', text: stampText })}><Stamp size={14} />Штамп</button>
              <span className="mx-1 h-5 border-l" />
              {COLORS.map((c) => <button key={c} aria-label={`Цвет ${c}`} onClick={() => setColor(c)} className={clsx('h-6 w-6 rounded-full border-2', color === c ? 'border-brand-500' : 'border-slate-300')} style={{ background: c }} />)}
              <button className="btn-ghost ml-auto !px-2 !py-1 text-xs" disabled={!newOps.length} onClick={() => setNewOps((o) => o.slice(0, -1))}><Undo2 size={14} />Отменить</button>
            </div>
          )}
          {canEdit && tool === 'text' && <input className="input mb-2" placeholder="Текст подписи — затем кликните по снимку" value={text} onChange={(e) => setText(e.target.value)} aria-label="Текст подписи" />}
          <div className="relative flex justify-center rounded-lg bg-slate-900/90 p-2">
            {err ? <p className="p-10 text-sm text-slate-300">{err}</p> : !base ? <p className="p-10 text-sm text-slate-300">Загрузка…</p> : (
              <canvas ref={view} data-testid="photo-canvas" className={clsx('max-w-full touch-none', editable ? 'cursor-crosshair' : 'cursor-default')}
                onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={() => drag && onUp()} />
            )}
            {original && <span className="absolute left-3 top-3 rounded bg-black/60 px-2 py-0.5 text-xs text-white">Оригинал</span>}
          </div>
          {canEdit && (
            <div className="mt-2 flex flex-wrap items-center gap-4 text-xs">
              <label className="flex items-center gap-2">Яркость <input type="range" min={50} max={160} value={adjust?.brightness ?? 100} onChange={(e) => push({ t: 'adjust', brightness: Number(e.target.value), contrast: adjust?.contrast ?? 100 })} /> {adjust?.brightness ?? 100}%</label>
              <label className="flex items-center gap-2">Контраст <input type="range" min={50} max={160} value={adjust?.contrast ?? 100} onChange={(e) => push({ t: 'adjust', brightness: adjust?.brightness ?? 100, contrast: Number(e.target.value) })} /> {adjust?.contrast ?? 100}%</label>
              {shown && <span className="ml-auto text-slate-500">{shown.width}×{shown.height} px</span>}
            </div>
          )}
        </div>

        <div className="space-y-3 text-sm">
          <button className="btn-secondary w-full" onPointerDown={() => setOriginal(true)} onPointerUp={() => setOriginal(false)} onPointerLeave={() => setOriginal(false)}>
            {original ? <EyeOff size={15} /> : <Eye size={15} />}Удерживать: оригинал
          </button>
          <div>
            <div className="mb-1 font-semibold">Версии</div>
            <div className="space-y-1">
              {photo.versions.map((v) => (
                <button key={v.version} data-version={v.version} onClick={() => { setVerNo(v.version); setNewOps([]) }}
                  className={clsx('w-full rounded-lg border p-2 text-left text-xs', v.version === ver.version ? 'border-brand-500 bg-brand-50/60 dark:bg-brand-500/10' : 'hover:border-slate-400')}>
                  <div className="flex justify-between font-medium"><span>v{v.version} {v.version === 1 && '· оригинал'}</span><span className="text-slate-500">{formatDate(v.date)}</span></div>
                  <div className="text-slate-500">{name(v.authorId)}</div>
                  {v.version > 1 && <ul className="mt-1 list-disc pl-4 text-slate-600 dark:text-slate-400">{v.edits.map((e, i) => <li key={i}>{e}</li>)}</ul>}
                </button>
              ))}
            </div>
          </div>
          {newOps.length > 0 && (
            <div>
              <div className="mb-1 flex items-center gap-2 font-semibold">Несохранённые правки <Badge tone="amber">{newOps.length}</Badge></div>
              <ul className="list-disc pl-4 text-xs text-slate-600 dark:text-slate-400">{newOps.map((o, i) => <li key={i}>{describeOp(o)}</li>)}</ul>
            </div>
          )}
          <p className="text-xs text-slate-500">Только технические правки. Содержимое снимка не дорисовывается — фото остаётся доказательством для исполнительной документации. Каждая версия хранит полный журнал правок.</p>
        </div>
      </div>
    </Modal>
  )
}
