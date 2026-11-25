import type { CadElement } from '../domain/types'
import { placeSockets, segLength } from '../domain/cad'

// Демонстрационный план типового этажа административного здания 40 × 20 м.
// Единица = 10 см. Два этажа с одинаковой планировкой, разной расстановкой розеток.

const U = 10
const u = (m: number) => Math.round(m * U)

interface RoomDef {
  idx: number
  name: string
  x: number
  y: number
  w: number
  h: number
  purpose: string
  sockets: [number, number]
  lights: number
  doorX?: number
}

const ROOMS: RoomDef[] = [
  { idx: 0, name: 'Коридор', x: 0, y: 8, w: 40, h: 4, purpose: 'Коридор', sockets: [2, 2], lights: 5 },
  { idx: 1, name: 'Приёмная', x: 0, y: 0, w: 8, h: 8, purpose: 'Офисное', sockets: [4, 3], lights: 2, doorX: 2 },
  { idx: 2, name: 'Кабинет директора', x: 8, y: 0, w: 8, h: 8, purpose: 'Офисное', sockets: [4, 4], lights: 2, doorX: 10 },
  { idx: 3, name: 'Кабинет ПТО', x: 16, y: 0, w: 8, h: 8, purpose: 'Офисное', sockets: [4, 4], lights: 2, doorX: 18 },
  { idx: 4, name: 'Переговорная', x: 24, y: 0, w: 8, h: 8, purpose: 'Офисное', sockets: [4, 6], lights: 2, doorX: 26 },
  { idx: 5, name: 'Серверная', x: 32, y: 0, w: 8, h: 8, purpose: 'Технологическое', sockets: [6, 4], lights: 2, doorX: 34 },
  { idx: 6, name: 'Open-space', x: 0, y: 12, w: 16, h: 8, purpose: 'Офисное', sockets: [8, 8], lights: 4, doorX: 3 },
  { idx: 7, name: 'Бухгалтерия', x: 16, y: 12, w: 8, h: 8, purpose: 'Офисное', sockets: [4, 4], lights: 2, doorX: 18 },
  { idx: 8, name: 'Санузел', x: 24, y: 12, w: 8, h: 8, purpose: 'Санитарное', sockets: [1, 1], lights: 2, doorX: 26 },
  { idx: 9, name: 'Техпомещение (ЩР, стояки)', x: 32, y: 12, w: 8, h: 8, purpose: 'Техническое', sockets: [2, 2], lights: 1, doorX: 34 },
]

export const CAD_FLOORS = [1, 2]

export const roomNoFor = (floor: number, idx: number) => (floor - 1) * 10 + idx

function build(floor: number): CadElement[] {
  const els: CadElement[] = []
  let n = 0
  const id = (k: string) => `f${floor}_${k}_${++n}`
  const add = (e: Omit<CadElement, 'id' | 'floor'>) => { els.push({ id: id(e.kind), floor, ...e }) }
  const roomEls: Record<number, CadElement> = {}

  // Помещения
  for (const r of ROOMS) {
    const no = roomNoFor(floor, r.idx)
    const area = r.w * r.h
    add({
      layer: 'walls', kind: 'room', roomNo: no, x: u(r.x), y: u(r.y), w: u(r.w), h: u(r.h), label: r.name,
      props: { 'Номер': no, 'Название': r.name, 'Площадь, м²': area, 'Назначение': r.purpose, 'Этаж': floor },
    })
    roomEls[r.idx] = els[els.length - 1]
  }

  // Стены
  const wall = (x1: number, y1: number, x2: number, y2: number, ext: boolean) =>
    add({ layer: 'walls', kind: 'wall', x: u(x1), y: u(y1), x2: u(x2), y2: u(y2), props: { 'Тип': ext ? 'Наружная, кирпич 380 мм' : 'Перегородка, ГКЛ 100 мм', 'Толщина': ext ? 4 : 1.5, 'Длина, м': Math.hypot(x2 - x1, y2 - y1) }, })
  wall(0, 0, 40, 0, true); wall(40, 0, 40, 20, true); wall(40, 20, 0, 20, true); wall(0, 20, 0, 0, true)
  wall(0, 8, 40, 8, false); wall(0, 12, 40, 12, false)
  for (const x of [8, 16, 24, 32]) wall(x, 0, x, 8, false)
  for (const x of [16, 24, 32]) wall(x, 12, x, 20, false)

  // Двери и окна
  for (const r of ROOMS.filter((q) => q.idx > 0)) {
    const top = r.y === 0
    add({
      layer: 'walls', kind: 'door', roomNo: roomNoFor(floor, r.idx), x: u(r.doorX ?? r.x + r.w / 2), y: u(top ? 8 : 12), w: 10,
      props: { 'Размер': '1000×2100 мм', 'Тип': 'Дверь межкомнатная', 'Открывание': top ? 'в помещение (вверх)' : 'в помещение (вниз)', 'Направление': top ? -1 : 1 },
    })
    const wx = r.x + r.w / 2
    add({
      layer: 'walls', kind: 'window', roomNo: roomNoFor(floor, r.idx), x: u(wx), y: u(top ? 0 : 20), w: u(r.idx === 6 ? 3 : 2.4),
      props: { 'Размер': r.idx === 6 ? '3000×1500 мм' : '2400×1500 мм', 'Тип': 'ПВХ, двухкамерный стеклопакет' },
    })
    if (r.idx === 6) add({ layer: 'walls', kind: 'window', roomNo: roomNoFor(floor, 6), x: u(13), y: u(20), w: u(2.4), props: { 'Размер': '2400×1500 мм', 'Тип': 'ПВХ, двухкамерный стеклопакет' } })
  }
  add({ layer: 'walls', kind: 'door', roomNo: roomNoFor(floor, 0), x: 0, y: u(10), w: 12, props: { 'Размер': '1200×2100 мм', 'Тип': 'Входная группа', 'Направление': 0 } })

  // Размеры
  const dim = (x1: number, y1: number, x2: number, y2: number, label: string) =>
    add({ layer: 'dims', kind: 'dim', x: u(x1), y: u(y1), x2: u(x2), y2: u(y2), label, props: { 'Значение': label, 'Единицы': 'мм' } })
  dim(0, 23, 40, 23, '40 000'); dim(43, 0, 43, 20, '20 000')
  for (const x of [0, 8, 16, 24]) dim(x, -3, x + 8, -3, '8 000')
  dim(32, -3, 40, -3, '8 000')

  // Двери по комнатам (для размещения розеток)
  const doorsOf = (no: number) => els.filter((e) => e.kind === 'door' && e.roomNo === no).map((e) => ({ x: e.x, y: e.y }))

  // Электрика: розетки
  for (const r of ROOMS) {
    const no = roomNoFor(floor, r.idx)
    const pts = placeSockets(roomEls[r.idx], r.sockets[floor - 1], [], doorsOf(no))
    pts.forEach((p, i) => {
      add({
        layer: 'electric', kind: 'socket', roomNo: no, x: p.x, y: p.y, label: `Р${no}.${i + 1}`,
        props: {
          'Тип': r.idx === 8 ? 'Розетка влагозащищённая 220 В, 16 А' : 'Розетка 220 В, 16 А с заземлением', 'Высота установки': '300 мм',
          'Группа': `Л${r.idx}`, 'Степень защиты': r.idx === 8 ? 'IP44' : 'IP20', 'Помещение': `№${no} ${r.name}`,
        },
      })
    })
    // Выключатели
    const dx = (doorsOf(no)[0]?.x ?? u(r.x + 2)) + 12
    const top = r.y === 0
    add({
      layer: 'electric', kind: 'switch', roomNo: no, x: r.idx === 0 ? u(2) : dx, y: r.idx === 0 ? u(8.4) : top ? u(7.4) : u(12.6), label: `В${no}`,
      props: { 'Тип': 'Выключатель одноклавишный', 'Группа': `Л${r.idx}`, 'Помещение': `№${no} ${r.name}` },
    })
    // Светильники: равномерная сетка по центру помещения
    const cols = r.idx === 0 ? 5 : r.lights >= 4 ? 2 : r.lights
    const rowsN = r.idx === 0 ? 1 : Math.ceil(r.lights / cols)
    let k = 0
    for (let ry = 0; ry < rowsN && k < r.lights; ry++) {
      for (let cx = 0; cx < cols && k < r.lights; cx++) {
        const lx = u(r.x) + ((cx + 0.5) * u(r.w)) / cols
        const ly = u(r.y) + ((ry + 0.5) * u(r.h)) / rowsN
        k++
        add({
          layer: 'electric', kind: 'light', roomNo: no, x: Math.round(lx), y: Math.round(ly), label: `С${no}.${k}`,
          props: { 'Тип': 'Светильник LED 36 Вт, 4000 К', 'Группа': `Л${r.idx}`, 'Помещение': `№${no} ${r.name}` },
        })
      }
    }
  }

  // Щит и кабельные трассы
  add({ layer: 'electric', kind: 'fixture', roomNo: roomNoFor(floor, 9), x: u(38), y: u(16), w: 14, h: 8, label: 'ЩР-' + floor, props: { 'Наименование': `Щит распределительный ЩР-${floor}`, 'Ввод': '3×380/220 В', 'Мощность, кВт': 42 } })
  const cable = (x1: number, y1: number, x2: number, y2: number, circuit: string, section: string, no?: number) => {
    const e: Omit<CadElement, 'id' | 'floor'> = {
      layer: 'electric', kind: 'cable', roomNo: no, x: u(x1), y: u(y1), x2: u(x2), y2: u(y2), label: circuit,
      props: { 'Цепь': circuit, 'Марка': `ВВГнг(А)-LS ${section}`, 'Прокладка': 'в кабельном лотке', 'Длина, м': 0 },
    }
    e.props['Длина, м'] = Math.round(Math.hypot((e.x2 ?? 0) - e.x, (e.y2 ?? 0) - e.y) * 0.1 * 10) / 10
    add(e)
  }
  cable(38, 16, 38, 10.6, 'Стояк С1', '5×16'); cable(38, 10.6, 38, 9.4, 'Стояк С1', '5×16')
  cable(38, 9.4, 4, 9.4, 'Магистраль М1', '5×10'); cable(38, 10.6, 4, 10.6, 'Магистраль М2', '5×10')
  for (const r of ROOMS.filter((q) => q.idx > 0 && q.idx !== 9)) {
    const cx = r.x + r.w / 2
    const top = r.y === 0
    const cxx = r.idx === 6 ? 8 : cx
    const ty = top ? 9.4 : 10.6
    const ey = top ? 4 : 16
    cable(cxx, ty, cxx, ey, `Л${r.idx}`, '3×2,5', roomNoFor(floor, r.idx))
    add({ layer: 'electric', kind: 'fixture', roomNo: roomNoFor(floor, r.idx), x: u(cxx), y: u(ey), w: 3, h: 3, label: 'КР', props: { 'Наименование': 'Распределительная коробка', 'Группа': `Л${r.idx}` } })
  }

  // Сантехника
  const pipe = (x1: number, y1: number, x2: number, y2: number, system: string, mat: string, no?: number) => {
    const len = Math.round(Math.hypot(x2 - x1, y2 - y1) * 10) / 10
    add({ layer: 'plumbing', kind: 'pipe', roomNo: no, x: u(x1), y: u(y1), x2: u(x2), y2: u(y2), label: system.split(' ')[0], props: { 'Система': system, 'Материал': mat, 'Длина, м': len } })
  }
  const wno = roomNoFor(floor, 8)
  pipe(38, 18.5, 26, 18.5, 'В1 Хозяйственно-питьевой водопровод', 'PP-R Ø25', wno)
  pipe(30, 18.5, 30, 13.5, 'В1 Хозяйственно-питьевой водопровод', 'PP-R Ø20', wno)
  pipe(26, 18, 26, 10.2, 'К1 Бытовая канализация', 'ПП Ø110', wno)
  pipe(26, 10.2, 2, 10.2, 'К1 Бытовая канализация', 'ПП Ø110', roomNoFor(floor, 0))
  for (const [fx, fy, nm] of [[26, 18, 'Унитаз'], [30, 18, 'Унитаз'], [26, 13.5, 'Умывальник'], [30, 13.5, 'Умывальник']] as [number, number, string][]) {
    add({ layer: 'plumbing', kind: 'fixture', roomNo: wno, x: u(fx), y: u(fy), w: 6, h: 6, label: nm === 'Унитаз' ? 'У' : 'Ум', props: { 'Наименование': nm, 'Подключение': nm === 'Унитаз' ? 'В1, К1' : 'В1, К1 (через сифон)' } })
  }

  // Вентиляция
  const duct = (x1: number, y1: number, x2: number, y2: number, size: string, no?: number) => {
    const len = Math.round(Math.hypot(x2 - x1, y2 - y1) * 10) / 10
    add({ layer: 'vent', kind: 'duct', roomNo: no, x: u(x1), y: u(y1), x2: u(x2), y2: u(y2), label: 'П1', props: { 'Система': 'П1 Приточная вентиляция', 'Сечение': size, 'Длина, м': len, 'Материал': 'Оцинкованная сталь' } })
  }
  duct(36, 10, 4, 10, '400×200 мм', roomNoFor(floor, 0))
  const branches: [number, number, number, number, number][] = [[6, 10, 6, 6, 1], [18, 10, 18, 6, 3], [34, 10, 34, 6, 5], [10, 10, 10, 14, 6], [30, 10, 30, 14, 8]]
  for (const [x1, y1, x2, y2, idx] of branches) {
    duct(x1, y1, x2, y2, '200×200 мм', roomNoFor(floor, idx))
    add({ layer: 'vent', kind: 'fixture', roomNo: roomNoFor(floor, idx), x: u(x2), y: u(y2), w: 5, h: 5, label: 'Д', props: { 'Наименование': 'Диффузор приточный 200×200', 'Система': 'П1' } })
  }
  return els
}

let cache: CadElement[] | null = null
export function basePlan(): CadElement[] {
  if (!cache) cache = CAD_FLOORS.flatMap(build)
  return cache
}

export function totalCableLength(els: CadElement[]): number {
  return els.filter((e) => e.kind === 'cable').reduce((a, e) => a + segLength(e), 0)
}
