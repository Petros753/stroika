import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { bbox, cssColor, explode, type Drawing, type Ent } from '../../domain/dxf'

export interface ViewEvent { x: number; y: number; /** Точка с привязкой к ближайшей вершине */ sx: number; sy: number; snapped: boolean; pxToWorld: number }
export interface Overlay { kind: 'line' | 'point'; x1: number; y1: number; x2?: number; y2?: number; label?: string; color?: string }

interface Props {
  drawing: Drawing
  hidden: Set<string>
  selectedId: string | null
  highlight?: Set<string>
  overlays?: Overlay[]
  cursor?: string
  fitKey: number
  onClick: (ev: ViewEvent) => void
  onMove?: (ev: ViewEvent) => void
}

/** Элементы, которые рисуются: верхний уровень + развёрнутые вставки блоков (с id родителя) */
export interface RenderItem { pid: string; layer: string; e: Ent }
export function renderList(d: Drawing): RenderItem[] {
  const out: RenderItem[] = []
  for (const e of d.ents) {
    if (e.t === 'insert') explode(d, [e]).forEach((x) => out.push({ pid: e.id, layer: e.layer, e: x }))
    else out.push({ pid: e.id, layer: e.layer, e })
  }
  return out
}

const Shape = memo(function Shape({ e, color, w }: { e: Ent; color: string; w: number }) {
  const p = { stroke: color, strokeWidth: w, fill: 'none', vectorEffect: 'non-scaling-stroke' as const }
  switch (e.t) {
    case 'line': return <line x1={e.x1} y1={-e.y1} x2={e.x2} y2={-e.y2} {...p} />
    case 'poly': { const pts = e.pts.map(([x, y]) => `${x},${-y}`).join(' '); return e.closed ? <polygon points={pts} {...p} /> : <polyline points={pts} {...p} /> }
    case 'circle': return <circle cx={e.cx} cy={-e.cy} r={e.r} {...p} />
    case 'arc': {
      const a0 = (e.a0 * Math.PI) / 180, a1 = (e.a1 * Math.PI) / 180
      let sweep = e.a1 - e.a0; while (sweep < 0) sweep += 360
      const x0 = e.cx + e.r * Math.cos(a0), y0 = e.cy + e.r * Math.sin(a0), x1 = e.cx + e.r * Math.cos(a1), y1 = e.cy + e.r * Math.sin(a1)
      return <path d={`M ${x0} ${-y0} A ${e.r} ${e.r} 0 ${sweep > 180 ? 1 : 0} 0 ${x1} ${-y1}`} {...p} />
    }
    case 'text': return <text x={e.x} y={-e.y} fontSize={e.h} fill={color} transform={e.rot ? `rotate(${-e.rot} ${e.x} ${-e.y})` : undefined} style={{ fontFamily: 'Arial, sans-serif', userSelect: 'none' }}>{e.text}</text>
    default: return null
  }
})

export function DxfViewer({ drawing, hidden, selectedId, highlight, overlays = [], cursor = 'crosshair', fitKey, onClick, onMove }: Props) {
  const svg = useRef<SVGSVGElement>(null)
  const items = useMemo(() => renderList(drawing), [drawing])
  const layerColor = useMemo(() => Object.fromEntries(drawing.layers.map((l) => [l.name, l.color])), [drawing])
  const [vb, setVb] = useState({ x: 0, y: 0, w: 100, h: 100 })
  const drag = useRef<null | { cx: number; cy: number; vb: typeof vb; moved: boolean }>(null)

  // вписать чертёж
  useEffect(() => {
    const b = bbox(items.filter((i) => !hidden.has(i.layer)).map((i) => i.e)) ?? { x0: 0, y0: 0, x1: 100, y1: 100 }
    const m = Math.max(b.x1 - b.x0, b.y1 - b.y0) * 0.05 || 10
    setVb({ x: b.x0 - m, y: -b.y1 - m, w: b.x1 - b.x0 + 2 * m, h: b.y1 - b.y0 + 2 * m })
  }, [fitKey, drawing]) // eslint-disable-line react-hooks/exhaustive-deps

  const toWorld = (clientX: number, clientY: number) => {
    const s = svg.current!
    const pt = s.createSVGPoint(); pt.x = clientX; pt.y = clientY
    const p = pt.matrixTransform(s.getScreenCTM()!.inverse())
    return { x: p.x, y: -p.y }
  }
  const pxToWorld = () => { const r = svg.current!.getBoundingClientRect(); return Math.max(vb.w / r.width, vb.h / r.height) }
  const event = (clientX: number, clientY: number): ViewEvent => {
    const w = toWorld(clientX, clientY), k = pxToWorld(), tol = 10 * k
    let best: [number, number] | null = null, bd = tol
    for (const it of items) {
      if (hidden.has(it.layer)) continue
      const e = it.e
      const vs: [number, number][] = e.t === 'line' ? [[e.x1, e.y1], [e.x2, e.y2], [(e.x1 + e.x2) / 2, (e.y1 + e.y2) / 2]] : e.t === 'poly' ? e.pts : e.t === 'circle' ? [[e.cx, e.cy]] : []
      for (const [x, y] of vs) { const d = Math.hypot(x - w.x, y - w.y); if (d < bd) { bd = d; best = [x, y] } }
    }
    return { x: w.x, y: w.y, sx: best ? best[0] : w.x, sy: best ? best[1] : w.y, snapped: !!best, pxToWorld: k }
  }

  useEffect(() => {
    const s = svg.current
    if (!s) return
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      const w = toWorld(e.clientX, e.clientY), k = e.deltaY > 0 ? 1.2 : 1 / 1.2
      setVb((v) => ({ x: w.x - (w.x - v.x) * k, y: -w.y - (-w.y - v.y) * k, w: v.w * k, h: v.h * k }))
    }
    s.addEventListener('wheel', wheel, { passive: false })
    return () => s.removeEventListener('wheel', wheel)
  })

  return (
    <svg
      ref={svg} data-testid="dxf-svg" viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} preserveAspectRatio="xMidYMid meet"
      className="h-full w-full touch-none select-none bg-slate-900" style={{ cursor }}
      onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); drag.current = { cx: e.clientX, cy: e.clientY, vb, moved: false } }}
      onPointerMove={(e) => {
        const d = drag.current
        if (d) {
          const dx = e.clientX - d.cx, dy = e.clientY - d.cy
          if (d.moved || Math.hypot(dx, dy) > 4) {
            d.moved = true
            const r = svg.current!.getBoundingClientRect(), k = Math.max(d.vb.w / r.width, d.vb.h / r.height)
            setVb({ ...d.vb, x: d.vb.x - dx * k, y: d.vb.y - dy * k })
            return
          }
        }
        onMove?.(event(e.clientX, e.clientY))
      }}
      onPointerUp={(e) => { const d = drag.current; drag.current = null; if (d && !d.moved) onClick(event(e.clientX, e.clientY)) }}
    >
      {items.map((it, i) => {
        if (hidden.has(it.layer)) return null
        const sel = it.pid === selectedId, hl = highlight?.has(it.pid)
        const color = sel ? '#f97316' : hl ? '#22d3ee' : cssColor(it.e.color ?? layerColor[it.e.layer] ?? layerColor[it.layer], true)
        return <Shape key={it.pid + ':' + i} e={it.e} color={color} w={sel || hl ? 2.5 : 1} />
      })}
      {highlight && items.filter((it) => highlight.has(it.pid) && it.e.t === 'poly' && it.e.closed).map((it, i) => (
        <polygon key={'hf' + i} points={(it.e as Extract<Ent, { t: 'poly' }>).pts.map(([x, y]) => `${x},${-y}`).join(' ')} fill="#22d3ee" fillOpacity={0.15} stroke="none" />
      ))}
      {overlays.map((o, i) => {
        const k = vb.w / 900
        return (
          <g key={'ov' + i}>
            {o.kind === 'line' && o.x2 !== undefined && <line x1={o.x1} y1={-o.y1} x2={o.x2} y2={-o.y2!} stroke={o.color ?? '#facc15'} strokeWidth={2} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />}
            <circle cx={o.x1} cy={-o.y1} r={4 * k} fill={o.color ?? '#facc15'} />
            {o.x2 !== undefined && <circle cx={o.x2} cy={-o.y2!} r={4 * k} fill={o.color ?? '#facc15'} />}
            {o.label && <text x={o.x2 !== undefined ? (o.x1 + o.x2) / 2 : o.x1} y={-(o.y2 !== undefined ? (o.y1 + o.y2!) / 2 : o.y1) - 10 * k} textAnchor="middle" fontSize={14 * k} fill={o.color ?? '#facc15'} stroke="#0f172a" strokeWidth={3 * k} paintOrder="stroke" style={{ fontFamily: 'Arial', fontWeight: 600 }}>{o.label}</text>}
          </g>
        )
      })}
    </svg>
  )
}
