import { UNIT_TO_M, type Drawing, type Ent } from './dxf'

/** Исполнительная схема: проектные точки (пересечения осей из DXF) + данные съёмки → отклонения, допуски, схема.
 *  Фактические значения берутся ТОЛЬКО из съёмки (геодезист: CSV или ввод). Без съёмки схема не формируется. */

export interface GridPoint { id: string; x: number; y: number }
export interface Axis { name: string; vertical: boolean; pos: number; from: number; to: number }
export interface SurveyRow { id: string; dx: number; dy: number; dz?: number }
export interface Evaluated extends GridPoint { dx: number; dy: number; dz?: number; d: number; ok: boolean; zOk: boolean; measured: boolean }

type Line = Extract<Ent, { t: 'line' }>
type Text = Extract<Ent, { t: 'text' }>

/** Оси: прямые на слое осей; имя — ближайшая надпись у конца оси (в марке) */
export function findAxes(d: Drawing, layer: string): Axis[] {
  const lines = d.ents.filter((e): e is Line => e.t === 'line' && e.layer === layer)
  const texts = d.ents.filter((e): e is Text => e.t === 'text' && e.layer === layer)
  const axes: Axis[] = []
  for (const l of lines) {
    const dx = Math.abs(l.x2 - l.x1), dy = Math.abs(l.y2 - l.y1)
    const vertical = dx < dy * 0.01
    if (!vertical && dy > dx * 0.01) continue // наклонные оси не поддерживаются
    const ends: [number, number][] = [[l.x1, l.y1], [l.x2, l.y2]]
    const len = Math.max(dx, dy)
    let best: Text | null = null, bd = len * 0.12
    for (const t of texts) for (const [x, y] of ends) { const dd = Math.hypot(t.x - x, t.y - y); if (dd < bd) { bd = dd; best = t } }
    axes.push({ name: best?.text.trim() ?? '', vertical, pos: vertical ? (l.x1 + l.x2) / 2 : (l.y1 + l.y2) / 2, from: vertical ? Math.min(l.y1, l.y2) : Math.min(l.x1, l.x2), to: vertical ? Math.max(l.y1, l.y2) : Math.max(l.x1, l.x2) })
  }
  const v = axes.filter((a) => a.vertical).sort((a, b) => a.pos - b.pos)
  const h = axes.filter((a) => !a.vertical).sort((a, b) => a.pos - b.pos)
  const LETTERS = 'АБВГДЕЖИКЛМНПРСТУФШЭЮЯ'
  v.forEach((a, i) => { if (!a.name) a.name = String(i + 1) })
  h.forEach((a, i) => { if (!a.name) a.name = LETTERS[i] ?? `Р${i + 1}` })
  return [...v, ...h]
}

export function gridPoints(axes: Axis[]): GridPoint[] {
  const v = axes.filter((a) => a.vertical), h = axes.filter((a) => !a.vertical)
  const out: GridPoint[] = []
  for (const a of h) for (const b of v) if (b.pos >= a.from && b.pos <= a.to && a.pos >= b.from && a.pos <= b.to) out.push({ id: `${b.name}/${a.name}`, x: b.pos, y: a.pos })
  return out
}

/** CSV съёмки: «точка;dx;dy;dz» (отклонения, мм) или «точка;X;Y;Z» (координаты в единицах чертежа) */
/** projectZ — проектная отметка, м (для абсолютных высот Z в метрах) */
export function parseSurvey(text: string, points: GridPoint[], unitsToMm: number, projectZ?: number): { rows: SurveyRow[]; errors: string[] } {
  const lines = text.replace(/\r/g, '').split('\n').map((l) => l.trim()).filter(Boolean)
  const errors: string[] = []
  if (!lines.length) return { rows: [], errors: ['Файл пустой'] }
  const sep = lines[0].includes(';') ? ';' : lines[0].includes('\t') ? '\t' : ','
  const head = lines[0].toLowerCase()
  const hasHeader = /[a-zа-я]/i.test(head.split(sep).slice(1).join(''))
  const deviations = !hasHeader || /dx|δx|откл/.test(head)
  const rows: SurveyRow[] = []
  for (const [i, l] of (hasHeader ? lines.slice(1) : lines).entries()) {
    const c = l.split(sep).map((x) => x.trim().replace(',', '.'))
    const id = c[0]
    const p = points.find((q) => q.id.toLowerCase() === id.toLowerCase())
    const n = c.slice(1).map((v) => (v === '' ? NaN : Number(v)))
    if (!p) { errors.push(`Строка ${i + 1 + (hasHeader ? 1 : 0)}: точка «${id}» не найдена на схеме`); continue }
    if (n.length < 2 || n.slice(0, 2).some((v) => !Number.isFinite(v))) { errors.push(`Строка ${i + 1 + (hasHeader ? 1 : 0)}: нет чисел X/Y`); continue }
    rows.push(deviations
      ? { id: p.id, dx: n[0], dy: n[1], dz: Number.isFinite(n[2]) ? n[2] : undefined }
      : { id: p.id, dx: Math.round((n[0] - p.x) * unitsToMm * 10) / 10, dy: Math.round((n[1] - p.y) * unitsToMm * 10) / 10, dz: Number.isFinite(n[2]) && projectZ !== undefined ? Math.round((n[2] - projectZ) * 1000) : undefined })
  }
  return { rows, errors }
}

export function evaluate(points: GridPoint[], survey: SurveyRow[], tolXY: number, tolZ: number): Evaluated[] {
  return points.map((p) => {
    const s = survey.find((r) => r.id === p.id)
    const dx = s?.dx ?? 0, dy = s?.dy ?? 0
    const d = Math.hypot(dx, dy)
    return { ...p, dx, dy, dz: s?.dz, d, measured: !!s, ok: d <= tolXY, zOk: s?.dz === undefined || Math.abs(s.dz) <= tolZ }
  })
}

/** Демо-съёмка — ТОЛЬКО для показа интерфейса; помечается в схеме */
export function demoSurvey(points: GridPoint[]): SurveyRow[] {
  let seed = 7
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5)
  return points.map((p, i) => ({ id: p.id, dx: Math.round(r() * 14), dy: Math.round(r() * 14) + (i === 6 ? 11 : 0), dz: Math.round(r() * 16) }))
}

// ---------- построение схемы ----------
export interface SchemeMeta { title: string; element: string; project: string; author: string; surveyor: string; date: string; tolXY: number; tolZ: number; demo: boolean }
const fmt = (v: number) => (v > 0 ? '+' : '') + Math.round(v)
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function schemeSvg(axes: Axis[], pts: Evaluated[], meta: SchemeMeta, scaleDev = 80): string {
  const xs = axes.filter((a) => a.vertical).map((a) => a.pos), ys = axes.filter((a) => !a.vertical).map((a) => a.pos)
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
  const span = Math.max(x1 - x0, y1 - y0) || 1
  const W = 1000, plotW = 760, k = plotW / span, padL = 110, padT = 150
  const X = (x: number) => padL + (x - x0) * k, Y = (y: number) => padT + (y1 - y) * k
  const plotH = (y1 - y0) * k
  const listed = pts.filter((p) => p.measured)
  const H = padT + plotH + 110 + 26 * Math.ceil(Math.max(1, listed.length) / 3) + 170
  const o: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Arial, sans-serif"><rect width="${W}" height="${H}" fill="#fff"/>`]
  o.push(`<rect x="10" y="10" width="${W - 20}" height="${H - 20}" fill="none" stroke="#000" stroke-width="1.5"/>`)
  o.push(`<text x="${W / 2}" y="44" text-anchor="middle" font-size="20" font-weight="bold">${esc(meta.title)}</text><text x="${W / 2}" y="66" text-anchor="middle" font-size="13">${esc(meta.element)}</text>`)
  if (meta.demo) o.push(`<text x="${W / 2}" y="86" text-anchor="middle" font-size="12" fill="#b45309">ДЕМО-ДАННЫЕ СЪЁМКИ — только для показа, не для исполнительной документации</text>`)
  for (const a of axes) {
    const ext = 30
    if (a.vertical) o.push(`<line x1="${X(a.pos)}" y1="${Y(y1) - ext}" x2="${X(a.pos)}" y2="${Y(y0) + ext}" stroke="#666" stroke-dasharray="14 4 2 4"/><circle cx="${X(a.pos)}" cy="${Y(y1) - ext - 14}" r="14" fill="#fff" stroke="#000"/><text x="${X(a.pos)}" y="${Y(y1) - ext - 9}" text-anchor="middle" font-size="13">${esc(a.name)}</text>`)
    else o.push(`<line x1="${X(x0) - ext}" y1="${Y(a.pos)}" x2="${X(x1) + ext}" y2="${Y(a.pos)}" stroke="#666" stroke-dasharray="14 4 2 4"/><circle cx="${X(x0) - ext - 14}" cy="${Y(a.pos)}" r="14" fill="#fff" stroke="#000"/><text x="${X(x0) - ext - 14}" y="${Y(a.pos) + 5}" text-anchor="middle" font-size="13">${esc(a.name)}</text>`)
  }
  for (const p of pts) {
    const px = X(p.x), py = Y(p.y)
    const col = !p.measured ? '#9ca3af' : p.ok && p.zOk ? '#15803d' : '#dc2626'
    o.push(`<rect x="${px - 5}" y="${py - 5}" width="10" height="10" fill="none" stroke="#000"/>`)
    if (p.measured && p.d > 0) {
      const ex = px + (p.dx / scaleDev) * 40, ey = py - (p.dy / scaleDev) * 40
      o.push(`<line x1="${px}" y1="${py}" x2="${ex}" y2="${ey}" stroke="${col}" stroke-width="2"/><circle cx="${ex}" cy="${ey}" r="3" fill="${col}"/>`)
    }
    if (p.measured) o.push(`<text x="${px + 8}" y="${py - 8}" font-size="11" fill="${col}">${fmt(p.dx)}/${fmt(p.dy)}${p.dz !== undefined ? ` Δh${fmt(p.dz)}` : ''}</text>`)
  }
  let ty = padT + plotH + 60
  o.push(`<text x="30" y="${ty}" font-size="12">Отклонения Δx/Δy и Δh в мм. Допуск в плане ±${meta.tolXY} мм, по высоте ±${meta.tolZ} мм (по проекту / нормативу).</text><text x="30" y="${ty + 16}" font-size="12">Зелёный — в допуске, красный — превышение. Стрелки отклонений — в увеличенном масштабе.</text>`)
  ty += 16
  ty += 22
  listed.forEach((p, i) => {
    const col = i % 3, row = Math.floor(i / 3)
    const c = p.ok && p.zOk ? '#15803d' : '#dc2626'
    o.push(`<text x="${30 + col * 315}" y="${ty + row * 26}" font-size="12" fill="${c}">${esc(p.id)}: Δx ${fmt(p.dx)}, Δy ${fmt(p.dy)}${p.dz !== undefined ? `, Δh ${fmt(p.dz)}` : ''} — ${p.ok && p.zOk ? 'в допуске' : 'превышение'}</text>`)
  })
  const missing = pts.length - listed.length
  if (missing) o.push(`<text x="30" y="${ty + Math.ceil(Math.max(1, listed.length) / 3) * 26}" font-size="12" fill="#6b7280">Без замеров: ${missing} из ${pts.length} точек</text>`)
  // штамп
  const sy = H - 120, sx = W - 520
  o.push(`<g font-size="11"><rect x="${sx}" y="${sy}" width="500" height="100" fill="none" stroke="#000"/>`)
  for (const yy of [25, 50, 75]) o.push(`<line x1="${sx}" y1="${sy + yy}" x2="${sx + 500}" y2="${sy + yy}" stroke="#000"/>`)
  o.push(`<line x1="${sx + 150}" y1="${sy}" x2="${sx + 150}" y2="${sy + 100}" stroke="#000"/>`)
  ;[['Объект', meta.project], ['Исполнитель (ПТО)', meta.author], ['Съёмка выполнил', meta.surveyor || '________'], ['Дата', meta.date]].forEach(([a, b], i) => o.push(`<text x="${sx + 6}" y="${sy + 17 + i * 25}">${esc(a)}</text><text x="${sx + 156}" y="${sy + 17 + i * 25}">${esc(b)}</text>`))
  o.push('</g></svg>')
  return o.join('')
}

/** Исполнительная схема в DXF: оси, точки, подписи отклонений — для доработки в AutoCAD / nanoCAD */
export function schemeDrawing(src: Drawing, axes: Axis[], pts: Evaluated[], meta: SchemeMeta): Drawing {
  let n = 0
  const id = () => `s${++n}`
  const u = 1 / (UNIT_TO_M[src.units] * 1000) // мм → единицы чертежа
  const h = 250 * u
  const ents: Ent[] = []
  for (const a of axes) ents.push(a.vertical ? { id: id(), layer: 'ОСИ', t: 'line', x1: a.pos, y1: a.from, x2: a.pos, y2: a.to } : { id: id(), layer: 'ОСИ', t: 'line', x1: a.from, y1: a.pos, x2: a.to, y2: a.pos })
  for (const a of axes) ents.push({ id: id(), layer: 'ОСИ', t: 'text', x: a.vertical ? a.pos - h / 2 : a.from - 3 * h, y: a.vertical ? a.to + h : a.pos - h / 2, h, text: a.name, rot: 0 })
  for (const p of pts) {
    const s = 150 * u
    ents.push({ id: id(), layer: 'ИСП_ТОЧКИ', t: 'poly', closed: true, pts: [[p.x - s, p.y - s], [p.x + s, p.y - s], [p.x + s, p.y + s], [p.x - s, p.y + s]] })
    if (p.measured) {
      const color = p.ok && p.zOk ? 0x00ff00 : 0xff0000
      ents.push({ id: id(), layer: 'ИСП_ОТКЛ', color, t: 'line', x1: p.x, y1: p.y, x2: p.x + p.dx * 40 * u, y2: p.y + p.dy * 40 * u })
      ents.push({ id: id(), layer: 'ИСП_ОТКЛ', color, t: 'text', x: p.x + 2 * s, y: p.y + 2 * s, h: h * 0.8, text: `${fmt(p.dx)}/${fmt(p.dy)}${p.dz !== undefined ? ` Δh${fmt(p.dz)}` : ''}`, rot: 0 })
    }
  }
  const minY = Math.min(...axes.filter((a) => a.vertical).map((a) => a.from))
  const minX = Math.min(...axes.filter((a) => !a.vertical).map((a) => a.from))
  ents.push({ id: id(), layer: 'ШТАМП', t: 'text', x: minX, y: minY - 4 * h, h: h * 1.4, text: `${meta.title}. ${meta.element}`, rot: 0 })
  ents.push({ id: id(), layer: 'ШТАМП', t: 'text', x: minX, y: minY - 6 * h, h, text: `${meta.project}. Допуск ±${meta.tolXY} мм. Съёмка: ${meta.surveyor || '________'}. ${meta.date}${meta.demo ? '. ДЕМО-ДАННЫЕ' : ''}`, rot: 0 })
  return {
    units: src.units, unitsFromFile: true, blocks: {}, skipped: {}, ents,
    layers: [{ name: 'ОСИ', color: 0x808080 }, { name: 'ИСП_ТОЧКИ', color: 0xffffff }, { name: 'ИСП_ОТКЛ', color: 0xff0000 }, { name: 'ШТАМП', color: 0xffffff }],
  }
}
