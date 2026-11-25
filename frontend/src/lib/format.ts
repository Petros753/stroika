const rub = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 })
const num = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 })

export function formatMoney(v: number): string {
  return rub.format(Math.round(v)) + ' ₽'
}

/** Компактно: 1 240 млн ₽ / 3,3 млрд ₽ */
export function formatMoneyShort(v: number): string {
  const abs = Math.abs(v)
  if (abs >= 1e9) return (v / 1e9).toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' млрд ₽'
  if (abs >= 1e6) return (v / 1e6).toLocaleString('ru-RU', { maximumFractionDigits: 1 }) + ' млн ₽'
  if (abs >= 1e3) return (v / 1e3).toLocaleString('ru-RU', { maximumFractionDigits: 0 }) + ' тыс ₽'
  return rub.format(v) + ' ₽'
}

export function formatNumber(v: number): string {
  return num.format(v)
}

export function formatPercent(v: number, digits = 0): string {
  return v.toLocaleString('ru-RU', { maximumFractionDigits: digits }) + '%'
}

let counter = 0
export function genId(prefix: string): string {
  counter += 1
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 5)}`
}

/** Короткое имя объекта для подписей на графиках */
export function shortName(name: string): string {
  const q = name.match(/«(.+?)»/)
  if (q) return q[1]
  if (/школ/i.test(name)) return 'Школа'
  const w = name.split(' ').slice(0, 2).join(' ')
  return w.length > 20 ? w.slice(0, 19) + '…' : w
}
