import { UNIT_TO_M, area, explode, length, pointInPoly, type Drawing, type Ent } from './dxf'

/** Подсчёт объёмов по геометрии чертежа. Это «обмер», а НЕ конструктивный расчёт:
 *  прочность, нагрузки и т.п. считает инженер-конструктор в сертифицированном ПО. */

export interface LayerStat { layer: string; count: number; length: number; closedArea: number; closedCount: number; inserts: number }

export function layerStats(d: Drawing): LayerStat[] {
  const k = UNIT_TO_M[d.units]
  const map = new Map<string, LayerStat>()
  const get = (l: string) => map.get(l) ?? (map.set(l, { layer: l, count: 0, length: 0, closedArea: 0, closedCount: 0, inserts: 0 }), map.get(l)!)
  for (const e of d.ents) {
    const s = get(e.layer); s.count++
    if (e.t === 'insert') { s.inserts++; continue }
    s.length += length(e) * k
    const a = area(e); if (a > 0) { s.closedArea += a * k * k; s.closedCount++ }
  }
  for (const l of d.layers) get(l.name)
  return [...map.values()].sort((a, b) => b.count - a.count)
}

export function blockCounts(d: Drawing): { block: string; layer: string; count: number }[] {
  const m = new Map<string, { block: string; layer: string; count: number }>()
  for (const e of d.ents) if (e.t === 'insert') { const key = e.block + '|' + e.layer; const r = m.get(key) ?? { block: e.block, layer: e.layer, count: 0 }; r.count++; m.set(key, r) }
  return [...m.values()].sort((a, b) => b.count - a.count)
}

export interface Room { id: string; name: string; area: number; perimeter: number }
/** Помещения: замкнутые полилинии слоя; название — текст внутри контура */
export function rooms(d: Drawing, layer: string): Room[] {
  const k = UNIT_TO_M[d.units]
  const texts = explode(d).filter((e): e is Extract<Ent, { t: 'text' }> => e.t === 'text')
  return d.ents.filter((e): e is Extract<Ent, { t: 'poly' }> => e.t === 'poly' && e.closed && e.layer === layer).map((p, i) => {
    const t = texts.find((x) => pointInPoly(x.x, x.y, p.pts))
    return { id: p.id, name: t?.text ?? `Контур ${i + 1}`, area: area(p) * k * k, perimeter: length(p) * k }
  }).sort((a, b) => a.name.localeCompare(b.name, 'ru'))
}

/** Длина линий слоя в метрах (для стен, нарисованных двумя линиями, — делим на 2) */
export function layerLength(d: Drawing, layer: string): number {
  const k = UNIT_TO_M[d.units]
  return d.ents.filter((e) => e.layer === layer && e.t !== 'insert').reduce((a, e) => a + length(e) * k, 0)
}

/** Проёмы по вставкам блоков: ширина берётся из числа в имени блока (ДВЕРЬ_900 → 0,9 м) */
export function openings(d: Drawing): { doors: number; windows: number; doorArea: number; windowArea: number; doorWidth: number } {
  let doors = 0, windows = 0, doorArea = 0, windowArea = 0, doorWidth = 0
  const width = (name: string, def: number) => { const m = name.match(/(\d{3,4})/); return m ? Number(m[1]) / 1000 : def }
  for (const e of d.ents) {
    if (e.t !== 'insert') continue
    if (/двер|door|дв_/i.test(e.block)) { const w = width(e.block, 0.9); doors++; doorWidth += w; doorArea += w * 2.1 }
    else if (/окн|window|ок_/i.test(e.block)) { const w = width(e.block, 1.5); windows++; windowArea += w * 1.5 }
  }
  return { doors, windows, doorArea, windowArea, doorWidth }
}

export interface Takeoff {
  wallLength: number; wallArea: number; wallVolume: number
  floorArea: number; perimeter: number; finishArea: number; skirting: number
  rooms: Room[]
}
export function takeoff(d: Drawing, p: { wallLayer: string; doubleLines: boolean; height: number; thicknessMm: number; roomLayer: string; openingsArea: number }): Takeoff {
  const raw = layerLength(d, p.wallLayer)
  const wallLength = p.doubleLines ? raw / 2 : raw
  const wallArea = Math.max(0, wallLength * p.height - p.openingsArea)
  const rs = rooms(d, p.roomLayer)
  const floorArea = rs.reduce((a, r) => a + r.area, 0)
  const perimeter = rs.reduce((a, r) => a + r.perimeter, 0)
  const op = openings(d)
  return {
    wallLength, wallArea, wallVolume: wallArea * p.thicknessMm / 1000,
    floorArea, perimeter, finishArea: Math.max(0, perimeter * p.height - p.openingsArea * 2), skirting: Math.max(0, perimeter - op.doorWidth * 2), rooms: rs,
  }
}

export function takeoffCsv(fileName: string, t: Takeoff, blocks: { block: string; count: number }[], p: { height: number; thicknessMm: number; openingsArea: number }): string {
  const f = (v: number) => (Math.round(v * 100) / 100).toString().replace('.', ',')
  const L = [`Ведомость объёмов по чертежу;${fileName}`, 'Наименование;Ед.;Кол-во;Примечание']
  L.push(`Стены — длина по оси;м;${f(t.wallLength)};`, `Стены — площадь за вычетом проёмов;м²;${f(t.wallArea)};высота ${f(p.height)} м, проёмы ${f(p.openingsArea)} м²`, `Кладка / стены — объём;м³;${f(t.wallVolume)};толщина ${p.thicknessMm} мм`)
  L.push(`Полы — площадь помещений;м²;${f(t.floorArea)};`, `Потолки — площадь;м²;${f(t.floorArea)};`, `Отделка стен помещений;м²;${f(t.finishArea)};периметр × высота − проёмы (с двух сторон)`, `Плинтус;м;${f(t.skirting)};периметр − дверные проёмы`)
  for (const r of t.rooms) L.push(`Помещение: ${r.name};м²;${f(r.area)};периметр ${f(r.perimeter)} м`)
  for (const b of blocks) L.push(`Блок: ${b.block};шт;${b.count};`)
  return '﻿' + L.join('\r\n')
}
