import type { SitePhoto } from '../domain/types'

/** Демо-фотофиксация: процедурные «снимки» (реальные фото загружаются пользователем) */
export function seedPhotos(): SitePhoto[] {
  const p = (id: string, projectId: string, title: string, scene: string, takenAt: string, authorId: string, stageId?: string): SitePhoto => ({
    id, projectId, stageId, title, takenAt, src: `demo:${scene}`, authorId,
    versions: [{ version: 1, date: takenAt, authorId, ops: [], edits: ['Оригинал'] }],
  })
  const photos = [
    p('ph1', 'p1', 'Армирование плиты перекрытия, корпус 2', 'rebar', '2026-11-12', 'u_for1', 'st_p1_4'),
    p('ph2', 'p1', 'Фасад корпуса 1, монтаж окон', 'facade', '2026-11-10', 'u_for1'),
    p('ph3', 'p2', 'Кабельные трассы, 2 этаж', 'cable', '2026-11-11', 'u_for2', 'st_p2_11'),
    p('ph4', 'p3', 'Воздуховоды чистых помещений, корпус А', 'duct', '2026-11-09', 'u_for3', 'st_p3_18'),
    p('ph5', 'p4', 'Котлован и шпунтовое ограждение', 'pit', '2026-11-08', 'u_for2', 'st_p4_22'),
  ]
  // пример обработанной версии: кадр + стрелка + подпись + штамп
  photos[0].versions.push({
    version: 2, date: '2026-11-13', authorId: 'u_pto',
    ops: [
      { t: 'crop', x: 0.05, y: 0.15, w: 0.9, h: 0.8 },
      { t: 'arrow', x1: 0.22, y1: 0.25, x2: 0.42, y2: 0.52, color: '#ef4444' },
      { t: 'text', x: 0.04, y: 0.08, text: 'Шаг арматуры 200 мм, защитный слой — фиксаторы', color: '#ffffff' },
      { t: 'stamp', text: '12.11.2026 · ЖК «Северный» · Корпус 2 · плита перекрытия' },
    ],
    edits: ['Кадрирование', 'Стрелка-указатель', 'Подпись «Шаг арматуры 200 мм, защитный слой — фиксаторы»', 'Штамп: 12.11.2026 · ЖК «Северный» · Корпус 2 · плита перекрытия'],
  })
  return photos
}
