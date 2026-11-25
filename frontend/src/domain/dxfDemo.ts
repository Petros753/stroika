import type { Drawing, Ent } from './dxf'

/** Демо-чертёж: план этажа офисного блока 24×12 м (мм). Записывается в DXF и читается обратно тем же парсером. */
export function demoDrawing(): Drawing {
  let n = 0
  const id = () => `d${++n}`
  const rect = (layer: string, x0: number, y0: number, x1: number, y1: number): Ent => ({ id: id(), layer, t: 'poly', closed: true, pts: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] })
  const line = (layer: string, x1: number, y1: number, x2: number, y2: number): Ent => ({ id: id(), layer, t: 'line', x1, y1, x2, y2 })
  const text = (layer: string, x: number, y: number, h: number, t: string): Ent => ({ id: id(), layer, t: 'text', x, y, h, text: t, rot: 0 })
  const ins = (layer: string, block: string, x: number, y: number, rot = 0): Ent => ({ id: id(), layer, t: 'insert', block, x, y, sx: 1, sy: 1, rot })
  const ents: Ent[] = []
  // стены: наружный контур 380 мм, перегородки 200 мм
  ents.push(rect('А-СТЕНЫ', 0, 0, 24000, 12000), rect('А-СТЕНЫ', 380, 380, 23620, 11620))
  ents.push(rect('А-СТЕНЫ', 7900, 380, 8100, 11620), rect('А-СТЕНЫ', 15900, 380, 16100, 11620), rect('А-СТЕНЫ', 8100, 5900, 15900, 6100))
  // помещения (контуры по внутренней грани стен)
  const rooms: [string, number, number, number, number][] = [
    ['Офис 101', 380, 380, 7900, 11620], ['Коридор 102', 8100, 380, 15900, 5900], ['Переговорная 103', 8100, 6100, 15900, 11620], ['Офис 104', 16100, 380, 23620, 11620],
  ]
  for (const [nm, x0, y0, x1, y1] of rooms) { ents.push(rect('А-ПОМЕЩЕНИЯ', x0, y0, x1, y1)); ents.push(text('А-ТЕКСТ', (x0 + x1) / 2 - nm.length * 100, (y0 + y1) / 2, 350, nm)) }
  // двери и окна
  ents.push(ins('А-ДВЕРИ', 'ДВЕРЬ_900', 7900, 3000, 0), ins('А-ДВЕРИ', 'ДВЕРЬ_900', 16100, 3000, 180), ins('А-ДВЕРИ', 'ДВЕРЬ_900', 11500, 5900, 90), ins('А-ДВЕРИ', 'ДВЕРЬ_900', 10500, 0, 90))
  for (const x of [2000, 5000, 18000, 21000]) ents.push(ins('А-ОКНА', 'ОКНО_1500', x, 0))
  for (const x of [2000, 5000, 10500, 13000, 18000, 21000]) ents.push(ins('А-ОКНА', 'ОКНО_1500', x, 11620))
  // розетки
  for (const [x, y] of [[1000, 400], [4000, 400], [7500, 6000], [1000, 11200], [16500, 400], [20000, 400], [23200, 6000], [17000, 11200], [9000, 11200], [15500, 8000], [12000, 6500]]) ents.push(ins('Э-РОЗЕТКИ', 'РОЗЕТКА', x, y))
  // оси
  ;[0, 8000, 16000, 24000].forEach((x, i) => { ents.push(line('ОСИ', x, -1500, x, 13500)); ents.push({ id: id(), layer: 'ОСИ', t: 'circle', cx: x, cy: 14000, r: 450 }); ents.push(text('ОСИ', x - 120, 13850, 350, String(i + 1))) })
  ;[[0, 'А'], [6000, 'Б'], [12000, 'В']].forEach(([y, l]) => { ents.push(line('ОСИ', -1500, y as number, 25500, y as number)); ents.push({ id: id(), layer: 'ОСИ', t: 'circle', cx: -2000, cy: y as number, r: 450 }); ents.push(text('ОСИ', -2120, (y as number) - 150, 350, l as string)) })
  ents.push(text('А-ТЕКСТ', 0, -2600, 450, 'План 1 этажа. М 1:100 (демо)'))
  return {
    units: 'mm', unitsFromFile: true,
    layers: [
      { name: '0', color: 0xffffff }, { name: 'А-СТЕНЫ', color: 0xffffff }, { name: 'А-ПОМЕЩЕНИЯ', color: 0x00ffff }, { name: 'А-ТЕКСТ', color: 0xffff00 },
      { name: 'А-ДВЕРИ', color: 0x00ff00 }, { name: 'А-ОКНА', color: 0x0080ff }, { name: 'Э-РОЗЕТКИ', color: 0xff0000 }, { name: 'ОСИ', color: 0x808080 },
    ],
    blocks: {
      'ДВЕРЬ_900': { x: 0, y: 0, ents: [{ id: id(), layer: '0', t: 'line', x1: 0, y1: 0, x2: 0, y2: 900 }, { id: id(), layer: '0', t: 'arc', cx: 0, cy: 0, r: 900, a0: 0, a1: 90 }] },
      'ОКНО_1500': { x: 0, y: 0, ents: [{ id: id(), layer: '0', t: 'poly', closed: true, pts: [[0, 0], [1500, 0], [1500, 380], [0, 380]] }, { id: id(), layer: '0', t: 'line', x1: 0, y1: 190, x2: 1500, y2: 190 }] },
      'РОЗЕТКА': { x: 0, y: 0, ents: [{ id: id(), layer: '0', t: 'circle', cx: 0, cy: 0, r: 120 }, { id: id(), layer: '0', t: 'line', x1: -120, y1: 0, x2: 120, y2: 0 }] },
    },
    ents, skipped: {},
  }
}
