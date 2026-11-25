import DxfParser from 'dxf-parser'

/** Работа с DXF в браузере: разбор → нормализованная модель → просмотр, правка, расчёты → запись DXF.
 *  DWG — закрытый формат: в рабочей версии конвертируется на сервере (ODA File Converter / LibreDWG) в DXF. */

export type DxfUnits = 'mm' | 'cm' | 'm'
export const UNIT_TO_M: Record<DxfUnits, number> = { mm: 0.001, cm: 0.01, m: 1 }
export const UNIT_LABEL: Record<DxfUnits, string> = { mm: 'мм', cm: 'см', m: 'м' }

interface Base { id: string; layer: string; color?: number }
export type Ent = Base & (
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number }
  | { t: 'poly'; pts: [number, number][]; closed: boolean }
  | { t: 'circle'; cx: number; cy: number; r: number }
  | { t: 'arc'; cx: number; cy: number; r: number; a0: number; a1: number }
  | { t: 'text'; x: number; y: number; h: number; text: string; rot: number }
  | { t: 'insert'; block: string; x: number; y: number; sx: number; sy: number; rot: number }
)
export interface Layer { name: string; color: number }
export interface Drawing {
  units: DxfUnits
  /** Единицы взяты из файла ($INSUNITS) или выбраны пользователем */
  unitsFromFile: boolean
  layers: Layer[]
  blocks: Record<string, { x: number; y: number; ents: Ent[] }>
  ents: Ent[]
  /** Сущности, которые не поддерживаются просмотрщиком (штриховки, размеры и т.п.) */
  skipped: Record<string, number>
}

// ---------- цвета AutoCAD (ACI, основные) ----------
const ACI: Record<number, number> = { 1: 0xff0000, 2: 0xffff00, 3: 0x00ff00, 4: 0x00ffff, 5: 0x0000ff, 6: 0xff00ff, 7: 0xffffff, 8: 0x808080, 9: 0xc0c0c0, 30: 0xff7f00, 140: 0x0080ff }
const nearestAci = (rgb: number) => {
  let best = 7, bd = Infinity
  for (const [k, v] of Object.entries(ACI)) {
    const d = ((v >> 16) - (rgb >> 16)) ** 2 + (((v >> 8) & 255) - ((rgb >> 8) & 255)) ** 2 + ((v & 255) - (rgb & 255)) ** 2
    if (d < bd) { bd = d; best = Number(k) }
  }
  return best
}
export const cssColor = (rgb: number | undefined, dark: boolean) => {
  if (rgb === undefined || rgb === 0xffffff || rgb === 0) return dark ? '#e5e7eb' : '#1f2937'
  return '#' + rgb.toString(16).padStart(6, '0')
}

// ---------- разбор ----------
let seq = 0
const nid = () => `e${++seq}`
const INSUNITS: Record<number, DxfUnits> = { 4: 'mm', 5: 'cm', 6: 'm' }

/* eslint-disable @typescript-eslint/no-explicit-any */
function convert(e: any, skipped: Record<string, number>): Ent | null {
  const layer = String(e.layer ?? '0')
  const color = typeof e.color === 'number' ? e.color : undefined
  const b = { id: nid(), layer, color }
  switch (e.type) {
    case 'LINE': return { ...b, t: 'line', x1: e.vertices[0].x, y1: e.vertices[0].y, x2: e.vertices[1].x, y2: e.vertices[1].y }
    case 'LWPOLYLINE': case 'POLYLINE': {
      const pts = (e.vertices ?? []).map((v: any) => [v.x, v.y] as [number, number])
      if (pts.length < 2) return null
      return { ...b, t: 'poly', pts, closed: !!e.shape || !!e.closed }
    }
    case 'CIRCLE': return { ...b, t: 'circle', cx: e.center.x, cy: e.center.y, r: e.radius }
    case 'ARC': return { ...b, t: 'arc', cx: e.center.x, cy: e.center.y, r: e.radius, a0: (e.startAngle * 180) / Math.PI, a1: (e.endAngle * 180) / Math.PI }
    case 'TEXT': return { ...b, t: 'text', x: e.startPoint?.x ?? 0, y: e.startPoint?.y ?? 0, h: e.textHeight ?? 2.5, text: String(e.text ?? ''), rot: e.rotation ?? 0 }
    case 'MTEXT': return {
      ...b, t: 'text', x: e.position?.x ?? 0, y: e.position?.y ?? 0, h: e.height ?? 2.5, rot: e.rotation ?? 0,
      text: String(e.text ?? '').replace(/\\P/g, ' ').replace(/\\[A-Za-z][^;]*;/g, '').replace(/[{}]/g, ''),
    }
    case 'INSERT': return { ...b, t: 'insert', block: e.name, x: e.position.x, y: e.position.y, sx: e.xScale ?? 1, sy: e.yScale ?? 1, rot: e.rotation ?? 0 }
    default: skipped[e.type] = (skipped[e.type] ?? 0) + 1; return null
  }
}

export function parseDxf(text: string): Drawing {
  const dxf: any = new DxfParser().parseSync(text)
  if (!dxf) throw new Error('Файл не распознан как DXF')
  const skipped: Record<string, number> = {}
  const ents = (dxf.entities ?? []).map((e: any) => convert(e, skipped)).filter(Boolean) as Ent[]
  const blocks: Drawing['blocks'] = {}
  for (const [name, blk] of Object.entries<any>(dxf.blocks ?? {})) {
    if (name.startsWith('*')) continue // служебные блоки (размеры, пространства листов)
    blocks[name] = { x: blk.position?.x ?? 0, y: blk.position?.y ?? 0, ents: (blk.entities ?? []).map((e: any) => convert(e, {})).filter(Boolean) as Ent[] }
  }
  const lt = dxf.tables?.layer?.layers ?? {}
  const names = new Set<string>([...Object.keys(lt), ...ents.map((e) => e.layer)])
  const layers = [...names].map((n) => ({ name: n, color: lt[n]?.color ?? 0xffffff }))
  const u = INSUNITS[dxf.header?.$INSUNITS as number]
  return { units: u ?? 'mm', unitsFromFile: !!u, layers, blocks, ents, skipped }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------- запись (ASCII DXF, совместимый с AutoCAD / nanoCAD / LibreCAD) ----------
const UNITS_CODE: Record<DxfUnits, number> = { mm: 4, cm: 5, m: 6 }
const r = (v: number) => (Math.round(v * 1e6) / 1e6).toString()
function entDxf(e: Ent, out: string[]) {
  const head = (type: string) => { out.push('0', type, '8', e.layer); if (e.color !== undefined && e.color !== 0xffffff) out.push('62', String(nearestAci(e.color))) }
  switch (e.t) {
    case 'line': head('LINE'); out.push('10', r(e.x1), '20', r(e.y1), '30', '0', '11', r(e.x2), '21', r(e.y2), '31', '0'); break
    case 'poly':
      head('POLYLINE'); out.push('66', '1', '10', '0', '20', '0', '30', '0', '70', e.closed ? '1' : '0')
      for (const [x, y] of e.pts) out.push('0', 'VERTEX', '8', e.layer, '10', r(x), '20', r(y), '30', '0')
      out.push('0', 'SEQEND', '8', e.layer); break
    case 'circle': head('CIRCLE'); out.push('10', r(e.cx), '20', r(e.cy), '30', '0', '40', r(e.r)); break
    case 'arc': head('ARC'); out.push('10', r(e.cx), '20', r(e.cy), '30', '0', '40', r(e.r), '50', r(e.a0), '51', r(e.a1)); break
    case 'text': head('TEXT'); out.push('10', r(e.x), '20', r(e.y), '30', '0', '40', r(e.h), '1', e.text, '50', r(e.rot)); break
    case 'insert': head('INSERT'); out.push('2', e.block, '10', r(e.x), '20', r(e.y), '30', '0', '41', r(e.sx), '42', r(e.sy), '50', r(e.rot)); break
  }
}
export function writeDxf(d: Drawing): string {
  const o: string[] = []
  o.push('0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1009', '9', '$DWGCODEPAGE', '3', 'ANSI_1251', '9', '$INSUNITS', '70', String(UNITS_CODE[d.units]), '0', 'ENDSEC')
  o.push('0', 'SECTION', '2', 'TABLES', '0', 'TABLE', '2', 'LAYER', '70', String(d.layers.length))
  for (const l of d.layers) o.push('0', 'LAYER', '2', l.name, '70', '0', '62', String(nearestAci(l.color)), '6', 'CONTINUOUS')
  o.push('0', 'ENDTAB', '0', 'ENDSEC')
  o.push('0', 'SECTION', '2', 'BLOCKS')
  for (const [name, b] of Object.entries(d.blocks)) {
    o.push('0', 'BLOCK', '8', '0', '2', name, '70', '0', '10', r(b.x), '20', r(b.y), '30', '0', '3', name)
    b.ents.forEach((e) => entDxf(e, o))
    o.push('0', 'ENDBLK', '8', '0')
  }
  o.push('0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES')
  d.ents.forEach((e) => entDxf(e, o))
  o.push('0', 'ENDSEC', '0', 'EOF')
  return o.join('\r\n') + '\r\n'
}

// ---------- геометрия ----------
export interface Box { x0: number; y0: number; x1: number; y1: number }
const rad = (a: number) => (a * Math.PI) / 180
function transform(e: Ent, ins: Extract<Ent, { t: 'insert' }>, base: { x: number; y: number }): Ent {
  const c = Math.cos(rad(ins.rot)), s = Math.sin(rad(ins.rot))
  const P = (x: number, y: number): [number, number] => { const lx = (x - base.x) * ins.sx, ly = (y - base.y) * ins.sy; return [ins.x + lx * c - ly * s, ins.y + lx * s + ly * c] }
  switch (e.t) {
    case 'line': { const [x1, y1] = P(e.x1, e.y1), [x2, y2] = P(e.x2, e.y2); return { ...e, x1, y1, x2, y2 } }
    case 'poly': return { ...e, pts: e.pts.map(([x, y]) => P(x, y)) }
    case 'circle': { const [cx, cy] = P(e.cx, e.cy); return { ...e, cx, cy, r: e.r * Math.abs(ins.sx) } }
    case 'arc': { const [cx, cy] = P(e.cx, e.cy); return { ...e, cx, cy, r: e.r * Math.abs(ins.sx), a0: e.a0 + ins.rot, a1: e.a1 + ins.rot } }
    case 'text': { const [x, y] = P(e.x, e.y); return { ...e, x, y, h: e.h * Math.abs(ins.sy), rot: e.rot + ins.rot } }
    default: return e
  }
}
/** Разворачивает вставки блоков в примитивы (для габаритов и привязок). Глубина вложенности ограничена. */
export function explode(d: Drawing, ents = d.ents, depth = 0): Ent[] {
  const out: Ent[] = []
  for (const e of ents) {
    if (e.t !== 'insert') { out.push(e); continue }
    const b = d.blocks[e.block]
    if (!b || depth > 4) continue
    out.push(...explode(d, b.ents, depth + 1).map((x) => ({ ...transform(x, e, b), layer: x.layer === '0' ? e.layer : x.layer })))
  }
  return out
}
export function bbox(ents: Ent[]): Box | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  const add = (x: number, y: number) => { if (!Number.isFinite(x) || !Number.isFinite(y)) return; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
  for (const e of ents) {
    if (e.t === 'line') { add(e.x1, e.y1); add(e.x2, e.y2) }
    else if (e.t === 'poly') e.pts.forEach(([x, y]) => add(x, y))
    else if (e.t === 'circle' || e.t === 'arc') { add(e.cx - e.r, e.cy - e.r); add(e.cx + e.r, e.cy + e.r) }
    else if (e.t === 'text') { add(e.x, e.y); add(e.x + e.h * e.text.length * 0.6, e.y + e.h) }
  }
  return x0 === Infinity ? null : { x0, y0, x1, y1 }
}
export function vertices(e: Ent): [number, number][] {
  if (e.t === 'line') return [[e.x1, e.y1], [e.x2, e.y2]]
  if (e.t === 'poly') return e.pts
  if (e.t === 'circle') return [[e.cx, e.cy]]
  if (e.t === 'arc') return [[e.cx + e.r * Math.cos(rad(e.a0)), e.cy + e.r * Math.sin(rad(e.a0))], [e.cx + e.r * Math.cos(rad(e.a1)), e.cy + e.r * Math.sin(rad(e.a1))], [e.cx, e.cy]]
  if (e.t === 'text' || e.t === 'insert') return [[e.x, e.y]]
  return []
}
export function length(e: Ent): number {
  if (e.t === 'line') return Math.hypot(e.x2 - e.x1, e.y2 - e.y1)
  if (e.t === 'poly') { let s = 0; const p = e.pts; for (let i = 1; i < p.length; i++) s += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); if (e.closed && p.length > 2) s += Math.hypot(p[0][0] - p[p.length - 1][0], p[0][1] - p[p.length - 1][1]); return s }
  if (e.t === 'circle') return 2 * Math.PI * e.r
  if (e.t === 'arc') { let a = e.a1 - e.a0; while (a < 0) a += 360; return rad(a) * e.r }
  return 0
}
export function area(e: Ent): number {
  if (e.t === 'poly' && e.closed && e.pts.length > 2) { let s = 0; const p = e.pts; for (let i = 0; i < p.length; i++) { const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length]; s += x1 * y2 - x2 * y1 } return Math.abs(s) / 2 }
  if (e.t === 'circle') return Math.PI * e.r * e.r
  return 0
}
export function pointInPoly(x: number, y: number, pts: [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
/** Расстояние от точки до сущности (для выбора кликом), в единицах чертежа */
export function distTo(e: Ent, x: number, y: number): number {
  const seg = (ax: number, ay: number, bx: number, by: number) => {
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy
    const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0
    return Math.hypot(x - ax - t * dx, y - ay - t * dy)
  }
  if (e.t === 'line') return seg(e.x1, e.y1, e.x2, e.y2)
  if (e.t === 'poly') { let m = Infinity; const p = e.pts; for (let i = 1; i < p.length; i++) m = Math.min(m, seg(p[i - 1][0], p[i - 1][1], p[i][0], p[i][1])); if (e.closed) m = Math.min(m, seg(p[p.length - 1][0], p[p.length - 1][1], p[0][0], p[0][1])); return m }
  if (e.t === 'circle' || e.t === 'arc') return Math.abs(Math.hypot(x - e.cx, y - e.cy) - e.r)
  if (e.t === 'text') { const w = e.h * e.text.length * 0.6; return x >= e.x && x <= e.x + w && y >= e.y && y <= e.y + e.h ? 0 : Math.hypot(x - e.x, y - e.y) }
  return Infinity
}
export const newId = nid

// ---------- кодировки ----------
/** DXF до AutoCAD 2007 хранит текст в кодовой странице Windows (для русского — 1251), новые — в UTF-8 */
export function decodeDxf(buf: ArrayBuffer): string {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf) } catch { return new TextDecoder('windows-1251').decode(buf) }
}
const CP1251_EXTRA: Record<string, number> = { 'Ё': 0xa8, 'ё': 0xb8, '№': 0xb9, '«': 0xab, '»': 0xbb, '—': 0x97, '–': 0x96, '°': 0xb0, '±': 0xb1, '×': 0x78 }
/** Кодирование в Windows-1251 (для записи DXF R12, который читают AutoCAD, nanoCAD, LibreCAD) */
export function encodeCp1251(text: string): Uint8Array {
  const out = new Uint8Array(text.length)
  for (let i = 0; i < text.length; i++) {
    const ch = text[i], c = ch.charCodeAt(0)
    if (c < 0x80) out[i] = c
    else if (c >= 0x410 && c <= 0x44f) out[i] = c - 0x350
    else out[i] = CP1251_EXTRA[ch] ?? 0x3f
  }
  return out
}
