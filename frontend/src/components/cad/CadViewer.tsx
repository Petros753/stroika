import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { Maximize2, ZoomIn, ZoomOut } from 'lucide-react'
import type { CadElement, CadLayer } from '../../domain/types'
import { LAYER_COLOR } from '../../domain/cad'

export const FIT = { x: -14, y: -14, w: 470, h: 262 }
export const FIT_FRAME = { x: -52, y: -52, w: 520, h: 332 }
type View = typeof FIT

const HL = '#db2777'
const SEL = '#2563eb'

export interface CadMarker { x: number; y: number; label: string }
export interface AsBuilt { project: string; sheet: string; date: string }

interface Props {
  elements: CadElement[]
  layers: Record<CadLayer, boolean>
  selectedId: string | null
  highlight: Set<string>
  markers: CadMarker[]
  asBuilt: AsBuilt | null
  focusRoomNo: number | null
  onSelect: (id: string | null) => void
  svgRef: RefObject<SVGSVGElement>
}

function Halo({ e, color, dash }: { e: CadElement; color: string; dash?: boolean }) {
  const common = { stroke: color, strokeLinecap: 'round' as const, fill: 'none', strokeDasharray: dash ? '2 1.5' : undefined }
  if (e.kind === 'room') return <rect x={e.x} y={e.y} width={e.w} height={e.h} fill={color} fillOpacity={0.14} stroke={color} strokeWidth={1} strokeDasharray={dash ? '3 2' : undefined} />
  if (e.x2 !== undefined && e.y2 !== undefined) return <line x1={e.x} y1={e.y} x2={e.x2} y2={e.y2} {...common} strokeWidth={e.kind === 'duct' ? 5 : e.kind === 'wall' ? 5 : 3.2} strokeOpacity={0.55} />
  if (e.kind === 'window' || e.kind === 'door') {
    const w = e.w ?? 10
    return <rect x={e.x - w / 2 - 1} y={e.y - 3} width={w + 2} height={6} {...common} strokeWidth={1.2} />
  }
  if (e.kind === 'fixture') return <rect x={e.x - (e.w ?? 4) / 2 - 1.5} y={e.y - (e.h ?? 4) / 2 - 1.5} width={(e.w ?? 4) + 3} height={(e.h ?? 4) + 3} {...common} strokeWidth={1.2} />
  return <circle cx={e.x} cy={e.y} r={4.2} {...common} strokeWidth={1.3} fill={color} fillOpacity={0.18} />
}

function Shape({ e }: { e: CadElement }) {
  const c = LAYER_COLOR[e.layer]
  switch (e.kind) {
    case 'wall': return <line x1={e.x} y1={e.y} x2={e.x2} y2={e.y2} stroke={c} strokeWidth={Number(e.props['Толщина'] ?? 1.5)} strokeLinecap="square" />
    case 'door': {
      const w = e.w ?? 10
      const dir = Number(e.props['Направление'] ?? 1)
      if (dir === 0) return <g><rect x={e.x - 1.8} y={e.y - w / 2} width={3.6} height={w} fill="#fff" /><line x1={e.x - 1.8} y1={e.y - w / 2} x2={e.x + 6} y2={e.y - w / 2 - 2} stroke={c} strokeWidth={0.6} /><line x1={e.x - 1.8} y1={e.y + w / 2} x2={e.x + 6} y2={e.y + w / 2 + 2} stroke={c} strokeWidth={0.6} /></g>
      const hx = e.x - w / 2
      return (
        <g>
          <rect x={hx} y={e.y - 1} width={w} height={2} fill="#fff" />
          <line x1={hx} y1={e.y} x2={hx} y2={e.y + dir * w} stroke={c} strokeWidth={0.6} />
          <path d={`M ${hx} ${e.y + dir * w} A ${w} ${w} 0 0 ${dir > 0 ? 0 : 1} ${hx + w} ${e.y}`} fill="none" stroke={c} strokeWidth={0.4} strokeDasharray="1.5 1" />
        </g>
      )
    }
    case 'window': {
      const w = e.w ?? 24
      return (
        <g>
          <rect x={e.x - w / 2} y={e.y - 2.2} width={w} height={4.4} fill="#fff" />
          <line x1={e.x - w / 2} y1={e.y - 1.2} x2={e.x + w / 2} y2={e.y - 1.2} stroke="#38bdf8" strokeWidth={0.5} />
          <line x1={e.x - w / 2} y1={e.y} x2={e.x + w / 2} y2={e.y} stroke="#38bdf8" strokeWidth={0.5} />
          <line x1={e.x - w / 2} y1={e.y + 1.2} x2={e.x + w / 2} y2={e.y + 1.2} stroke="#38bdf8" strokeWidth={0.5} />
        </g>
      )
    }
    case 'dim': {
      const vertical = e.x === e.x2
      const mx = (e.x + (e.x2 ?? e.x)) / 2, my = (e.y + (e.y2 ?? e.y)) / 2
      return (
        <g stroke={c} strokeWidth={0.4} fill={c}>
          <line x1={e.x} y1={e.y} x2={e.x2} y2={e.y2} />
          {vertical ? <><line x1={e.x - 1.5} y1={e.y} x2={e.x + 1.5} y2={e.y} /><line x1={e.x - 1.5} y1={e.y2} x2={e.x + 1.5} y2={e.y2} /></> : <><line x1={e.x} y1={e.y - 1.5} x2={e.x} y2={e.y + 1.5} /><line x1={e.x2} y1={e.y - 1.5} x2={e.x2} y2={e.y + 1.5} /></>}
          <text x={mx} y={my} fontSize={4} stroke="none" textAnchor="middle" transform={vertical ? `rotate(-90 ${mx} ${my}) translate(0 -1.6)` : undefined} dy={vertical ? 0 : -1.6}>{e.label}</text>
        </g>
      )
    }
    case 'socket': return <g><circle cx={e.x} cy={e.y} r={2} fill="#fff" stroke={c} strokeWidth={0.6} /><line x1={e.x - 2} y1={e.y} x2={e.x + 2} y2={e.y} stroke={c} strokeWidth={0.6} /></g>
    case 'switch': return <g><circle cx={e.x} cy={e.y} r={1.2} fill={c} /><line x1={e.x} y1={e.y} x2={e.x + 2.2} y2={e.y - 2.2} stroke={c} strokeWidth={0.6} /></g>
    case 'light': return <g stroke={c} strokeWidth={0.5} fill="none"><circle cx={e.x} cy={e.y} r={2.2} /><line x1={e.x - 1.6} y1={e.y - 1.6} x2={e.x + 1.6} y2={e.y + 1.6} /><line x1={e.x - 1.6} y1={e.y + 1.6} x2={e.x + 1.6} y2={e.y - 1.6} /></g>
    case 'cable': {
      const trunk = String(e.props['Цепь']).startsWith('Маг') || String(e.props['Цепь']).startsWith('Сто')
      return <line x1={e.x} y1={e.y} x2={e.x2} y2={e.y2} stroke={c} strokeWidth={trunk ? 1 : 0.6} strokeDasharray={trunk ? undefined : '3 1.5'} />
    }
    case 'pipe': {
      const sewer = String(e.props['Система']).startsWith('К')
      return <line x1={e.x} y1={e.y} x2={e.x2} y2={e.y2} stroke={c} strokeWidth={sewer ? 1.2 : 0.8} strokeDasharray={sewer ? '5 1.5 1 1.5' : undefined} />
    }
    case 'duct': {
      const wide = String(e.props['Сечение']).startsWith('400')
      return <g><line x1={e.x} y1={e.y} x2={e.x2} y2={e.y2} stroke={c} strokeWidth={wide ? 4 : 2} strokeOpacity={0.28} /><line x1={e.x} y1={e.y} x2={e.x2} y2={e.y2} stroke={c} strokeWidth={0.5} strokeDasharray="4 1" /></g>
    }
    case 'fixture': {
      const w = e.w ?? 4, h = e.h ?? 4
      if (e.label?.startsWith('ЩР')) return <g><rect x={e.x - w / 2} y={e.y - h / 2} width={w} height={h} fill="#fef3c7" stroke={c} strokeWidth={0.7} /><text x={e.x} y={e.y + 1} fontSize={3} textAnchor="middle" fill={c}>{e.label}</text></g>
      if (e.layer === 'plumbing') return e.label === 'У'
        ? <ellipse cx={e.x} cy={e.y} rx={w / 2} ry={h / 2.4} fill="#e0f2fe" stroke={c} strokeWidth={0.6} />
        : <rect x={e.x - w / 2} y={e.y - h / 2} width={w} height={h * 0.7} rx={1} fill="#e0f2fe" stroke={c} strokeWidth={0.6} />
      if (e.layer === 'vent') return <g stroke={c} strokeWidth={0.5} fill="#ecfdf5"><rect x={e.x - w / 2} y={e.y - h / 2} width={w} height={h} /><line x1={e.x - w / 2} y1={e.y - h / 2} x2={e.x + w / 2} y2={e.y + h / 2} /><line x1={e.x - w / 2} y1={e.y + h / 2} x2={e.x + w / 2} y2={e.y - h / 2} /></g>
      return <rect x={e.x - w / 2} y={e.y - h / 2} width={w} height={h} fill="#fff" stroke={c} strokeWidth={0.6} />
    }
    default: return null
  }
}

function HitArea({ e }: { e: CadElement }) {
  const common = { fill: 'transparent', stroke: 'transparent', 'data-id': e.id, style: { cursor: 'pointer' } }
  if (e.kind === 'room') return null
  if (e.x2 !== undefined && e.y2 !== undefined) return <line x1={e.x} y1={e.y} x2={e.x2} y2={e.y2} strokeWidth={e.kind === 'wall' ? 4 : 4.5} strokeLinecap="round" {...common} />
  if (e.kind === 'door' || e.kind === 'window') { const w = e.w ?? 10; return <rect x={e.x - w / 2} y={e.y - 3} width={w} height={6} {...common} /> }
  if (e.kind === 'fixture') return <rect x={e.x - (e.w ?? 4) / 2 - 1} y={e.y - (e.h ?? 4) / 2 - 1} width={(e.w ?? 4) + 2} height={(e.h ?? 4) + 2} {...common} />
  return <circle cx={e.x} cy={e.y} r={3.2} {...common} />
}

export function CadViewer({ elements, layers, selectedId, highlight, markers, asBuilt, focusRoomNo, onSelect, svgRef }: Props) {
  const [view, setView] = useState<View>(FIT)
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null)
  const visible = elements.filter((e) => layers[e.layer])
  const rooms = visible.filter((e) => e.kind === 'room')
  const others = visible.filter((e) => e.kind !== 'room' && e.kind !== 'dim')
  const dims = visible.filter((e) => e.kind === 'dim')
  const hl = visible.filter((e) => highlight.has(e.id))
  const sel = visible.find((e) => e.id === selectedId)

  const zoomAt = useCallback((factor: number, cx?: number, cy?: number) => {
    setView((v) => {
      const px = cx ?? v.x + v.w / 2, py = cy ?? v.y + v.h / 2
      const f = Math.max(0.05, Math.min(3, factor))
      const nw = v.w * f
      if (nw < 25 || nw > 1400) return v
      return { x: px - (px - v.x) * f, y: py - (py - v.y) * f, w: nw, h: v.h * f }
    })
  }, [])

  // колесо мыши — нативный обработчик, чтобы отключить прокрутку страницы
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault()
      const pt = svg.createSVGPoint()
      pt.x = ev.clientX; pt.y = ev.clientY
      const p = pt.matrixTransform(svg.getScreenCTM()!.inverse())
      zoomAt(ev.deltaY > 0 ? 1.15 : 1 / 1.15, p.x, p.y)
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [svgRef, zoomAt])

  // режим исполнительной схемы показывает лист целиком
  useEffect(() => { setView(asBuilt ? FIT_FRAME : FIT) }, [!!asBuilt]) // eslint-disable-line react-hooks/exhaustive-deps

  // фокус на помещении после AI-команды
  useEffect(() => {
    if (focusRoomNo === null) return
    const r = elements.find((e) => e.kind === 'room' && e.roomNo === focusRoomNo)
    if (r) setView({ x: r.x - 30, y: r.y - 30, w: (r.w ?? 80) + 60, h: (r.h ?? 80) + 60 })
  }, [focusRoomNo, elements])

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false }
  }
  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.x, dy = e.clientY - d.y
    if (!d.moved && Math.hypot(dx, dy) < 4) return
    d.moved = true
    const rect = e.currentTarget.getBoundingClientRect()
    const s = Math.max(view.w / rect.width, view.h / rect.height)
    setView((v) => ({ ...v, x: d.vx - dx * s, y: d.vy - dy * s }))
  }
  function onPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    const d = drag.current
    drag.current = null
    if (d?.moved) return
    const target = (document.elementFromPoint(e.clientX, e.clientY) as Element | null)?.closest('[data-id]')
    onSelect(target ? target.getAttribute('data-id') : null)
  }

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl border bg-white">
      <svg
        ref={svgRef}
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        className="h-full w-full touch-none select-none"
        style={{ cursor: drag.current?.moved ? 'grabbing' : 'grab', background: '#fff', fontFamily: 'Inter, Arial, sans-serif' }}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
      >
        <rect x={-2000} y={-2000} width={4000} height={4000} fill="#ffffff" />
        <g>
          {rooms.map((r) => (
            <rect key={r.id} x={r.x} y={r.y} width={r.w} height={r.h} fill={r.roomNo !== undefined && r.roomNo % 10 === 0 ? '#f1f5f9' : '#f8fafc'} data-id={r.id} style={{ cursor: 'pointer' }} />
          ))}
        </g>
        {/* подсветка и выбор — под символами */}
        <g className="cad-pulse">{hl.map((e) => <Halo key={'h' + e.id} e={e} color={HL} />)}</g>
        {sel && <Halo e={sel} color={SEL} dash />}
        <g>{others.filter((e) => e.kind === 'wall').map((e) => <Shape key={e.id} e={e} />)}</g>
        <g>{others.filter((e) => e.kind !== 'wall').map((e) => <Shape key={e.id} e={e} />)}</g>
        <g>{dims.map((e) => <Shape key={e.id} e={e} />)}</g>
        {layers.walls && (
          <g pointerEvents="none" textAnchor="middle" fill="#475569">
            {rooms.map((r) => (
              <g key={'t' + r.id}>
                <text x={r.x + (r.w ?? 0) / 2} y={r.y + (r.h ?? 0) / 2 - (r.roomNo !== undefined && r.roomNo % 10 === 0 ? 0 : 9)} fontSize={r.roomNo !== undefined && r.roomNo % 10 === 0 ? 4.2 : 4.4} fontWeight={600} dominantBaseline="middle">{r.label}</text>
                {!(r.roomNo !== undefined && r.roomNo % 10 === 0) && <text x={r.x + (r.w ?? 0) / 2} y={r.y + (r.h ?? 0) / 2 - 3} fontSize={3.6} fill="#94a3b8" dominantBaseline="middle">№{r.roomNo} · {r.props['Площадь, м²']} м²</text>}
              </g>
            ))}
          </g>
        )}
        {/* невидимые области выбора */}
        <g>{[...others, ...dims].map((e) => <HitArea key={'x' + e.id} e={e} />)}</g>
        {markers.map((m) => (
          <g key={m.label + m.x + m.y} pointerEvents="none">
            <circle cx={m.x} cy={m.y} r={5} fill="#ef4444" fillOpacity={0.18} stroke="#ef4444" strokeWidth={0.9} className="cad-pulse" />
            <text x={m.x + 6.5} y={m.y - 4.5} fontSize={4} fontWeight={700} fill="#b91c1c">{m.label}</text>
          </g>
        ))}
        {asBuilt && (
          <g pointerEvents="none" stroke="#0f172a" fill="none">
            <rect x={-48} y={-48} width={516} height={326} strokeWidth={1.2} />
            <rect x={-45} y={-45} width={510} height={320} strokeWidth={0.4} />
            <g transform="translate(300 238)" fill="#0f172a" stroke="none" fontSize={3.2}>
              <rect x={0} y={0} width={165} height={34} fill="#fff" stroke="#0f172a" strokeWidth={0.5} />
              <line x1={0} y1={12} x2={165} y2={12} stroke="#0f172a" strokeWidth={0.4} />
              <line x1={110} y1={12} x2={110} y2={34} stroke="#0f172a" strokeWidth={0.4} />
              <text x={4} y={8} fontSize={4} fontWeight={700}>ИСПОЛНИТЕЛЬНАЯ СХЕМА (ДЕМО)</text>
              <text x={4} y={20}>{asBuilt.project}</text>
              <text x={4} y={28}>Не является оформленной ИД</text>
              <text x={114} y={20}>{asBuilt.sheet}</text>
              <text x={114} y={28}>{asBuilt.date}</text>
            </g>
          </g>
        )}
      </svg>
      <div className="absolute left-3 top-3 flex flex-col gap-1">
        <button className="btn-secondary !p-1.5 shadow" onClick={() => zoomAt(1 / 1.3)} aria-label="Приблизить"><ZoomIn size={16} /></button>
        <button className="btn-secondary !p-1.5 shadow" onClick={() => zoomAt(1.3)} aria-label="Отдалить"><ZoomOut size={16} /></button>
        <button className="btn-secondary !p-1.5 shadow" onClick={() => setView(FIT)} aria-label="Показать весь план"><Maximize2 size={16} /></button>
      </div>
      <div className="pointer-events-none absolute bottom-2 left-3 text-[11px] text-slate-400">Колесо — масштаб · перетаскивание — перемещение · клик — выбор элемента</div>
    </div>
  )
}
