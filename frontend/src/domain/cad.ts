import type { CadElement, CadKind, CadLayer } from './types'

// Геометрия и расчёты чертежа. Единица чертежа = 10 см (40 м плана = 400 ед.).

export const UNIT_M = 0.1

export const LAYER_LABEL: Record<CadLayer, string> = {
  walls: 'Стены',
  dims: 'Размеры',
  electric: 'Электрика',
  plumbing: 'Сантехника',
  vent: 'Вентиляция',
}

export const LAYER_COLOR: Record<CadLayer, string> = {
  walls: '#334155',
  dims: '#64748b',
  electric: '#d97706',
  plumbing: '#0284c7',
  vent: '#059669',
}

export const KIND_LABEL: Record<CadKind, string> = {
  wall: 'Стена',
  door: 'Дверь',
  window: 'Окно',
  room: 'Помещение',
  socket: 'Розетка',
  switch: 'Выключатель',
  light: 'Светильник',
  cable: 'Кабельная трасса',
  pipe: 'Труба',
  fixture: 'Оборудование',
  duct: 'Воздуховод',
  dim: 'Размер',
}

export const KIND_PLURAL: Record<CadKind, string> = {
  wall: 'Стены',
  door: 'Двери',
  window: 'Окна',
  room: 'Помещения',
  socket: 'Розетки',
  switch: 'Выключатели',
  light: 'Светильники',
  cable: 'Кабельные трассы',
  pipe: 'Трубы',
  fixture: 'Оборудование',
  duct: 'Воздуховоды',
  dim: 'Размеры',
}

export function segLength(e: CadElement): number {
  if (e.x2 === undefined || e.y2 === undefined) return 0
  return Math.hypot(e.x2 - e.x, e.y2 - e.y) * UNIT_M
}

export const fmtM = (units: number) => (units * UNIT_M).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

// ---------- Пересечения ----------

export interface Clash {
  a: CadElement
  b: CadElement
  x: number
  y: number
}

function segIntersection(a: CadElement, b: CadElement): { x: number; y: number } | null {
  if (a.x2 === undefined || a.y2 === undefined || b.x2 === undefined || b.y2 === undefined) return null
  const d1x = a.x2 - a.x, d1y = a.y2 - a.y
  const d2x = b.x2 - b.x, d2y = b.y2 - b.y
  const den = d1x * d2y - d1y * d2x
  if (Math.abs(den) < 1e-9) return null // параллельны
  const t = ((b.x - a.x) * d2y - (b.y - a.y) * d2x) / den
  const u = ((b.x - a.x) * d1y - (b.y - a.y) * d1x) / den
  const eps = 1e-6
  // только настоящие пересечения; примыкания (Т-образные узлы) не считаются
  if (t <= eps || t >= 1 - eps || u <= eps || u >= 1 - eps) return null
  return { x: a.x + t * d1x, y: a.y + t * d1y }
}

const NET_KINDS: CadKind[] = ['cable', 'pipe', 'duct']

/** Пересечения сетей разных систем на одном этаже */
export function findClashes(elements: CadElement[], floor: number): Clash[] {
  const nets = elements.filter((e) => e.floor === floor && NET_KINDS.includes(e.kind))
  const out: Clash[] = []
  for (let i = 0; i < nets.length; i++) {
    for (let j = i + 1; j < nets.length; j++) {
      if (nets[i].layer === nets[j].layer) continue
      const p = segIntersection(nets[i], nets[j])
      if (p) out.push({ a: nets[i], b: nets[j], ...p })
    }
  }
  return out.sort((p, q) => p.x - q.x || p.y - q.y)
}

// ---------- Размещение розеток ----------

const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by)

/** Детерминированное размещение n розеток вдоль стен помещения: метод наиболее удалённой точки,
 *  с отступом от дверей, углов и уже существующих розеток. */
export function placeSockets(
  room: CadElement, n: number, existing: { x: number; y: number }[], doors: { x: number; y: number }[],
): { x: number; y: number }[] {
  const inset = 3
  const step = 5
  const x0 = room.x + inset, y0 = room.y + inset
  const x1 = room.x + (room.w ?? 0) - inset, y1 = room.y + (room.h ?? 0) - inset
  const cand: { x: number; y: number }[] = []
  for (let x = x0 + 4; x <= x1 - 4; x += step) { cand.push({ x, y: y0 }); cand.push({ x, y: y1 }) }
  for (let y = y0 + 4; y <= y1 - 4; y += step) { cand.push({ x: x0, y }); cand.push({ x: x1, y }) }
  const free = cand.filter((c) => doors.every((d) => dist(c.x, c.y, d.x, d.y) >= 9))
  const placed: { x: number; y: number }[] = []
  const all = [...existing]
  for (let k = 0; k < n; k++) {
    let best = -1
    let bestScore = -1
    free.forEach((c, i) => {
      if (placed.some((p) => p.x === c.x && p.y === c.y)) return
      const refs = [...all, ...placed]
      const sc = refs.length === 0 ? (doors.length ? Math.min(...doors.map((d) => dist(c.x, c.y, d.x, d.y))) : 1) : Math.min(...refs.map((r) => dist(c.x, c.y, r.x, r.y)))
      if (sc > bestScore + 1e-9) { bestScore = sc; best = i }
    })
    if (best < 0 || bestScore < 4) break // нет свободного места
    placed.push(free[best])
  }
  return placed
}

// ---------- Подсчёты и ведомость ----------

export function countByKind(els: CadElement[]): Partial<Record<CadKind, number>> {
  const out: Partial<Record<CadKind, number>> = {}
  for (const e of els) out[e.kind] = (out[e.kind] ?? 0) + 1
  return out
}

export interface ScheduleRow {
  floor: number
  roomNo: number
  room: string
  sockets: number
  switches: number
  lights: number
  cableM: number
}

export function buildSchedule(els: CadElement[], floors: number[]): ScheduleRow[] {
  const rows: ScheduleRow[] = []
  for (const f of floors) {
    const rooms = els.filter((e) => e.floor === f && e.kind === 'room').sort((a, b) => (a.roomNo ?? 0) - (b.roomNo ?? 0))
    for (const r of rooms) {
      const inRoom = els.filter((e) => e.floor === f && e.roomNo === r.roomNo)
      rows.push({
        floor: f, roomNo: r.roomNo ?? 0, room: r.label ?? '',
        sockets: inRoom.filter((e) => e.kind === 'socket').length,
        switches: inRoom.filter((e) => e.kind === 'switch').length,
        lights: inRoom.filter((e) => e.kind === 'light').length,
        cableM: Math.round(inRoom.filter((e) => e.kind === 'cable').reduce((a, e) => a + segLength(e), 0) * 10) / 10,
      })
    }
  }
  return rows
}

export function scheduleCsv(rows: ScheduleRow[]): string {
  const head = ['Этаж', 'Помещение №', 'Название', 'Розетки', 'Выключатели', 'Светильники', 'Кабель, м']
  const lines = rows.map((r) => [r.floor, r.roomNo, r.room, r.sockets, r.switches, r.lights, r.cableM].join(';'))
  const tot = rows.reduce((a, r) => ({ s: a.s + r.sockets, w: a.w + r.switches, l: a.l + r.lights, c: a.c + r.cableM }), { s: 0, w: 0, l: 0, c: 0 })
  lines.push(['', '', 'ИТОГО', tot.s, tot.w, tot.l, Math.round(tot.c * 10) / 10].join(';'))
  return '﻿' + [head.join(';'), ...lines].join('\r\n')
}
