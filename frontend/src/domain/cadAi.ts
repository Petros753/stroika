import type { CadElement, CadKind, CadLayer } from './types'
import { KIND_PLURAL, buildSchedule, countByKind, findClashes, placeSockets, scheduleCsv, segLength } from './cad'
import { genId } from '../lib/format'

// Детерминированный разбор AI-команд чертежа по ключевым словам.
// Это не языковая модель: набор правил, который выдаёт предсказуемый результат на данных чертежа.

export interface CadContext {
  elements: CadElement[] // базовый план + добавленные элементы текущего объекта
  floor: number
  floors: number[]
  canEdit: boolean
}

export interface CadResult {
  ok: boolean
  intent: 'count' | 'show' | 'clashes' | 'add' | 'schedule' | 'asbuilt' | 'unknown'
  title: string
  message: string
  floor?: number
  layers?: CadLayer[]
  highlightIds: string[]
  markers: { x: number; y: number; label: string }[]
  table?: { head: string[]; rows: string[][] }
  add?: CadElement[]
  asBuilt?: boolean
  csv?: { filename: string; content: string }
  execDoc?: { kind: 'Исполнительная схема'; title: string; works: string[] }
  focusRoomNo?: number
}

export const CAD_EXAMPLES = [
  'Посчитай все розетки на первом этаже',
  'Покажи все электрические трассы',
  'Найди пересечения инженерных сетей',
  'Добавь три розетки в помещении №5',
  'Создай ведомость электрических точек',
  'Подготовь исполнительную схему',
]

const KIND_LAYER: Record<CadKind, CadLayer> = {
  wall: 'walls', door: 'walls', window: 'walls', room: 'walls', dim: 'dims', socket: 'electric', switch: 'electric',
  light: 'electric', cable: 'electric', pipe: 'plumbing', duct: 'vent', fixture: 'electric',
}

const FORMS: Partial<Record<CadKind, [string, string, string]>> = {
  socket: ['розетка', 'розетки', 'розеток'], switch: ['выключатель', 'выключателя', 'выключателей'],
  light: ['светильник', 'светильника', 'светильников'], door: ['дверь', 'двери', 'дверей'], window: ['окно', 'окна', 'окон'],
  wall: ['стена', 'стены', 'стен'], pipe: ['труба', 'трубы', 'труб'], duct: ['воздуховод', 'воздуховода', 'воздуховодов'],
  cable: ['трасса', 'трассы', 'трасс'],
}

export function plural(n: number, f: [string, string, string]): string {
  const a = Math.abs(n) % 100
  const b = a % 10
  if (a > 10 && a < 20) return f[2]
  if (b > 1 && b < 5) return f[1]
  if (b === 1) return f[0]
  return f[2]
}

const NUM_WORDS: Record<string, number> = {
  один: 1, одну: 1, одна: 1, два: 2, две: 2, три: 3, четыре: 4, пять: 5, шесть: 6, семь: 7, восемь: 8, девять: 9, десять: 10,
}

function parseCount(t: string): number | null {
  const d = t.match(/(?<![№\d])\b(\d{1,2})\b(?!\s*(?:этаж|-й|й))/)
  if (d) return Number(d[1])
  for (const [w, v] of Object.entries(NUM_WORDS)) if (new RegExp(`(^|[^а-яё])${w}([^а-яё]|$)`).test(t)) return v
  return null
}

function parseRoom(t: string): number | null {
  const m = t.match(/(?:помещени[а-я]*|комнат[а-я]*|кабинет[а-я]*|№|номер)\s*(?:№|n|номер)?\s*(\d{1,3})/)
  return m ? Number(m[1]) : null
}

function parseFloor(t: string, ctx: CadContext): number | 'all' {
  if (/вс(?:е|ех|ем)\s+этаж/.test(t)) return 'all'
  if (/перв[а-я]*\s+этаж/.test(t)) return 1
  if (/втор[а-я]*\s+этаж/.test(t)) return 2
  const m = t.match(/(\d)\s*-?\s*(?:й|го|ом)?\s*этаж/)
  if (m) return Number(m[1])
  return ctx.floor
}

function parseKind(t: string): CadKind | null {
  if (/электрическ[а-я]*\s+трасс|кабел|трасс/.test(t)) return 'cable'
  if (/розет/.test(t)) return 'socket'
  if (/выключат/.test(t)) return 'switch'
  if (/светильн|освещен|ламп/.test(t)) return 'light'
  if (/труб|канализ|водопровод|сантехн/.test(t)) return 'pipe'
  if (/воздуховод|вентиляц/.test(t)) return 'duct'
  if (/двер/.test(t)) return 'door'
  if (/(?:^|[^а-я])окн|окон/.test(t)) return 'window'
  if (/стен/.test(t)) return 'wall'
  return null
}

const floorWord = (f: number | 'all') => (f === 'all' ? 'на всех этажах' : `на ${f === 1 ? '1-м' : f === 2 ? '2-м' : f + '-м'} этаже`)

export function runCadCommand(raw: string, ctx: CadContext): CadResult {
  const t = raw.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim()
  const base = { highlightIds: [] as string[], markers: [] as CadResult['markers'] }
  const empty = (): CadResult => ({ ok: false, intent: 'unknown', title: 'Команда не распознана', message: '', ...base })
  if (!t) return { ...empty(), message: 'Введите команду.' }

  // 1. Добавление
  if (/добав|постав|установ|размест/.test(t) && /розет/.test(t)) {
    if (!ctx.canEdit) return { ...empty(), intent: 'add', title: 'Недостаточно прав', message: 'Изменять чертёж могут администратор, руководитель проекта и инженер ПТО. Переключите роль в меню профиля.' }
    const roomNo = parseRoom(t)
    if (roomNo === null) return { ...empty(), intent: 'add', title: 'Не указано помещение', message: 'Укажите помещение, например: «Добавь три розетки в помещении №5».' }
    const room = ctx.elements.find((e) => e.kind === 'room' && e.roomNo === roomNo)
    if (!room) return { ...empty(), intent: 'add', title: 'Помещение не найдено', message: `В чертеже нет помещения №${roomNo}. Номера помещений 1 этажа: 0–9, 2 этажа: 10–19.` }
    const count = parseCount(t.replace(/(?:помещени[а-я]*|комнат[а-я]*|№)\s*\d+/g, '')) ?? 1
    if (count < 1 || count > 10) return { ...empty(), intent: 'add', title: 'Неверное количество', message: 'За одну команду можно добавить от 1 до 10 розеток.' }
    const inRoom = ctx.elements.filter((e) => e.floor === room.floor && e.roomNo === roomNo && e.kind === 'socket')
    const doors = ctx.elements.filter((e) => e.floor === room.floor && e.roomNo === roomNo && e.kind === 'door')
    const pts = placeSockets(room, count, inRoom, doors)
    if (pts.length === 0) return { ...empty(), intent: 'add', title: 'Нет свободного места', message: `В помещении №${roomNo} не нашлось свободных мест для розеток с допустимыми отступами.` }
    const idx = roomNo % 10
    const added: CadElement[] = pts.map((p, i) => ({
      id: genId('cad'), layer: 'electric', kind: 'socket', floor: room.floor, roomNo, x: p.x, y: p.y,
      label: `Р${roomNo}.${inRoom.length + i + 1}`,
      props: {
        'Тип': 'Розетка 220 В, 16 А с заземлением', 'Высота установки': '300 мм', 'Группа': `Л${idx}`, 'Степень защиты': 'IP20',
        'Помещение': `№${roomNo} ${room.label ?? ''}`, 'Источник': 'Добавлено AI-командой (демо)',
      },
    }))
    const partial = pts.length < count
    return {
      ok: true, intent: 'add', title: `Добавлено розеток: ${pts.length}`,
      message: `${partial ? `Удалось разместить ${pts.length} из ${count}: дальше нет мест с допустимыми отступами от дверей и других розеток. ` : ''}В помещении №${roomNo} («${room.label}») теперь ${inRoom.length + pts.length} ${plural(inRoom.length + pts.length, FORMS.socket!)}. Изменение записано в историю чертежа, его можно отменить.`,
      floor: room.floor, layers: ['electric'], highlightIds: added.map((a) => a.id), markers: [], add: added, focusRoomNo: roomNo,
      table: { head: ['Розетка', 'Координаты X, Y (м)', 'Группа'], rows: added.map((a) => [a.label ?? '', `${(a.x * 0.1).toFixed(1)}; ${(a.y * 0.1).toFixed(1)}`, `Л${idx}`]) },
    }
  }

  // 2. Ведомость
  if (/ведомост/.test(t)) {
    const f = parseFloor(t, ctx)
    const explicit = /этаж/.test(t)
    const floors = explicit && f !== 'all' ? [f] : ctx.floors
    const rows = buildSchedule(ctx.elements, floors)
    const tot = rows.reduce((a, r) => ({ s: a.s + r.sockets, w: a.w + r.switches, l: a.l + r.lights, c: a.c + r.cableM }), { s: 0, w: 0, l: 0, c: 0 })
    const ids = ctx.elements.filter((e) => floors.includes(e.floor) && ['socket', 'switch', 'light'].includes(e.kind)).map((e) => e.id)
    return {
      ok: true, intent: 'schedule', title: 'Ведомость электрических точек сформирована',
      message: `${explicit ? floorWord(floors[0]) : 'По всем этажам'}: розеток — ${tot.s}, выключателей — ${tot.w}, светильников — ${tot.l}; кабельные линии помещений — ${tot.c.toFixed(1)} м. Данные посчитаны по элементам чертежа.`,
      floor: explicit ? floors[0] : undefined, layers: ['electric'], highlightIds: ids, markers: [],
      table: {
        head: ['Этаж', '№', 'Помещение', 'Розетки', 'Выкл.', 'Светильники', 'Кабель, м'],
        rows: [...rows.map((r) => [String(r.floor), String(r.roomNo), r.room, String(r.sockets), String(r.switches), String(r.lights), r.cableM.toFixed(1)]),
          ['', '', 'ИТОГО', String(tot.s), String(tot.w), String(tot.l), tot.c.toFixed(1)]],
      },
      csv: { filename: 'vedomost_elektricheskih_tochek.csv', content: scheduleCsv(rows) },
    }
  }

  // 3. Исполнительная схема
  if (/исполнительн/.test(t) && /схем/.test(t)) {
    const f = parseFloor(t, ctx)
    const floor = f === 'all' ? ctx.floor : f
    const els = ctx.elements.filter((e) => e.floor === floor)
    const c = countByKind(els)
    const len = (k: CadKind) => els.filter((e) => e.kind === k).reduce((a, e) => a + segLength(e), 0)
    const added = els.filter((e) => e.added).length
    const works = [
      `Электрические сети: розеток — ${c.socket ?? 0}, выключателей — ${c.switch ?? 0}, светильников — ${c.light ?? 0}, кабельных трасс — ${len('cable').toFixed(1)} м`,
      `Сантехника: трубопроводов — ${len('pipe').toFixed(1)} м`,
      `Вентиляция: воздуховодов — ${len('duct').toFixed(1)} м`,
      added > 0 ? `Изменения относительно проекта: добавлено элементов — ${added}` : 'Отклонений от проекта не зафиксировано',
    ]
    return {
      ok: true, intent: 'asbuilt', title: `Исполнительная схема, этаж ${floor}`,
      message: `На плане включены все слои и добавлена рамка с основной надписью. ${added > 0 ? `Учтены изменения, внесённые AI-командами: ${added}.` : 'Изменений относительно проектного плана нет.'} Схема является демонстрационной и не заменяет оформленную по нормативам исполнительную документацию.`,
      floor, layers: ['walls', 'dims', 'electric', 'plumbing', 'vent'], highlightIds: [], markers: [], asBuilt: true,
      table: { head: ['Раздел', 'Сведения'], rows: works.map((w) => { const i = w.indexOf(':'); return i > 0 ? [w.slice(0, i), w.slice(i + 2)] : ['', w] }) },
      execDoc: { kind: 'Исполнительная схема', title: `Исполнительная схема инженерных сетей, этаж ${floor}`, works },
    }
  }

  // 4. Пересечения
  if (/пересечен|коллизи/.test(t)) {
    const f = parseFloor(t, ctx)
    const floors = /вс(?:е|ех)\s+этаж/.test(t) ? ctx.floors : [f === 'all' ? ctx.floor : f]
    const clashes = floors.flatMap((fl) => findClashes(ctx.elements, fl).map((c) => ({ ...c, fl })))
    const sys = (e: CadElement) => e.kind === 'cable' ? `Кабель ${e.props['Цепь']}` : e.kind === 'duct' ? `Воздуховод ${String(e.props['Система']).split(' ')[0]}` : `Труба ${String(e.props['Система']).split(' ')[0]}`
    if (clashes.length === 0) return { ok: true, intent: 'clashes', title: 'Пересечений не найдено', message: 'Геометрическая проверка трасс электрики, сантехники и вентиляции не выявила пересечений.', floor: floors[0], layers: ['electric', 'plumbing', 'vent'], ...base }
    return {
      ok: true, intent: 'clashes', title: `Найдено пересечений: ${clashes.length}`,
      message: `Проверены трассы электрики, сантехники и вентиляции ${floors.length === 1 ? floorWord(floors[0]) : 'на всех этажах'}. Пересечения вычислены геометрически по координатам сегментов; места отмечены на плане. Т-образные примыкания не считаются коллизиями.`,
      floor: floors[0], layers: ['electric', 'plumbing', 'vent'],
      highlightIds: clashes.flatMap((c) => [c.a.id, c.b.id]),
      markers: clashes.filter((c) => c.fl === floors[0]).map((c, i) => ({ x: c.x, y: c.y, label: String(i + 1) })),
      table: { head: ['№', 'Системы', 'Точка X, Y (м)', 'Этаж'], rows: clashes.map((c, i) => [String(i + 1), `${sys(c.a)} × ${sys(c.b)}`, `${(c.x * 0.1).toFixed(1)}; ${(c.y * 0.1).toFixed(1)}`, String(c.fl)]) },
    }
  }

  // 5. Подсчёт / показ
  const kind = parseKind(t)
  const isCount = /посчита|подсчит|сколько|количеств|пересчита/.test(t)
  const isShow = /покаж|подсвет|выдел|найди|отобраз|включи/.test(t)
  if (kind && (isCount || isShow)) {
    const f = parseFloor(t, ctx)
    const roomNo = parseRoom(t)
    const els = ctx.elements.filter((e) => e.kind === kind && (f === 'all' || e.floor === f) && (roomNo === null || e.roomNo === roomNo))
    const forms = FORMS[kind]!
    const where = roomNo !== null ? `в помещении №${roomNo}` : floorWord(f)
    if (kind === 'cable') {
      const byCircuit = new Map<string, number>()
      for (const e of els) byCircuit.set(String(e.props['Цепь']), (byCircuit.get(String(e.props['Цепь'])) ?? 0) + segLength(e))
      const total = [...byCircuit.values()].reduce((a, b) => a + b, 0)
      return {
        ok: true, intent: isCount ? 'count' : 'show', title: 'Электрические трассы',
        message: `${where[0].toUpperCase() + where.slice(1)}: ${els.length} ${plural(els.length, ['сегмент', 'сегмента', 'сегментов'])} кабельных трасс общей длиной ${total.toFixed(1)} м. Слой «Электрика» включён, трассы подсвечены.`,
        floor: f === 'all' ? undefined : f, layers: ['electric'], highlightIds: els.map((e) => e.id), markers: [],
        table: { head: ['Цепь', 'Длина, м'], rows: [...byCircuit.entries()].map(([k, v]) => [k, v.toFixed(1)]) },
      }
    }
    const rooms = new Map<string, number>()
    for (const e of els) {
      const r = ctx.elements.find((x) => x.kind === 'room' && x.floor === e.floor && x.roomNo === e.roomNo)
      const key = r ? `№${r.roomNo} ${r.label}` : '—'
      rooms.set(key, (rooms.get(key) ?? 0) + 1)
    }
    if (els.length === 0) return { ok: true, intent: isCount ? 'count' : 'show', title: `${KIND_PLURAL[kind]}: не найдено`, message: `${where[0].toUpperCase() + where.slice(1)} элементов такого типа нет.`, layers: [KIND_LAYER[kind]], ...base }
    return {
      ok: true, intent: isCount ? 'count' : 'show', title: `${KIND_PLURAL[kind]}: ${els.length}`,
      message: `${where[0].toUpperCase() + where.slice(1)} — ${els.length} ${plural(els.length, forms)} в ${rooms.size} ${plural(rooms.size, ['помещении', 'помещениях', 'помещениях'])}. Элементы подсвечены на плане.`,
      floor: f === 'all' ? undefined : f, layers: [KIND_LAYER[kind]], highlightIds: els.map((e) => e.id), markers: [],
      table: { head: ['Помещение', 'Кол-во'], rows: [...rooms.entries()].map(([k, v]) => [k, String(v)]) },
    }
  }

  return {
    ...empty(),
    message: 'Не удалось разобрать команду. Это демонстрационный разбор по ключевым словам. Попробуйте один из примеров: ' + CAD_EXAMPLES.map((e) => `«${e}»`).join(', '),
  }
}
