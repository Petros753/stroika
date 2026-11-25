import type { CostCalc } from '../domain/types'

/** Демо-расчёты себестоимости новых объектов (предварительные, для тендеров) */
export function seedCostCalcs(): CostCalc[] {
  return [
    {
      id: 'cc_1', createdAt: '2026-11-06', authorId: 'u_est',
      input: {
        name: 'Детский сад на 220 мест (тендер)', kind: 'school', area: 4200, floors: 2, underground: false, structure: 'brick',
        finish: 'turnkey', region: 'Астрахань', months: 14, method: 'norms', overheadPct: 12, reservePct: 3, marginPct: 10,
      },
    },
    {
      id: 'cc_2', createdAt: '2026-11-11', authorId: 'u_dir',
      input: {
        name: 'ЖК «Волжский», корпус 1 (по аналогу «Северного»)', kind: 'residential', area: 21000, floors: 16, underground: true,
        structure: 'monolith', finish: 'whitebox', region: 'Астрахань', months: 24, method: 'analog', analogId: 'p1',
        overheadPct: 10, reservePct: 4, marginPct: 12,
      },
    },
    {
      id: 'cc_3', createdAt: '2026-11-13', authorId: 'u_est',
      input: {
        name: 'Склад ответственного хранения 6 000 м²', kind: 'warehouse', area: 6000, floors: 1, underground: false, structure: 'steel',
        finish: 'rough', region: 'Оренбург', months: 8, method: 'norms', overheadPct: 10, reservePct: 3, marginPct: 12,
      },
    },
  ]
}
