/** Фиксированная «сегодняшняя» дата демо-данных: просрочки и отставания считаются от неё,
 *  чтобы демо вело себя одинаково в любой день. В рабочей версии заменить на new Date(). */
export const TODAY = '2026-11-14'

const DAY = 86_400_000

export function toTime(iso: string): number {
  return new Date(iso + 'T00:00:00Z').getTime()
}

export function daysBetween(a: string, b: string): number {
  return Math.round((toTime(b) - toTime(a)) / DAY)
}

export function addDays(iso: string, days: number): string {
  return new Date(toTime(iso) + days * DAY).toISOString().slice(0, 10)
}

export function formatDate(iso: string): string {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}.${m}.${y}`
}

export function isOverdue(due: string, today = TODAY): boolean {
  return due < today
}

export function nowIso(): string {
  return new Date().toISOString()
}
