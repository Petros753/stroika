import type { DataState } from '../data/seed'
import type { Letter, LetterCategory, Project, User } from './types'
import { projectMetrics, stagePlannedProgress } from './calc'
import { buildKs2 } from './execution'
import { coverage } from './quality'
import { addDays, formatDate } from '../lib/date'
import { formatMoney } from '../lib/format'

/** Переписка: разбор входящих писем и подготовка черновиков ответа по данным системы.
 *  В демо — детерминированные правила. В рабочей версии: n8n (IMAP → классификация LLM → черновик с RAG по базе
 *  знаний и данным объекта). Отправка ВСЕГДА только после согласования человеком. */

export const CATEGORY_LABEL: Record<LetterCategory, string> = {
  schedule: 'Сроки и график', payment: 'Акты и оплата', quality: 'Качество и документы', change: 'Изменения проекта', claim: 'Претензия', info: 'Информационное',
}
export const CATEGORY_TONE: Record<LetterCategory, 'blue' | 'green' | 'amber' | 'violet' | 'red' | 'slate'> = {
  schedule: 'amber', payment: 'green', quality: 'blue', change: 'violet', claim: 'red', info: 'slate',
}
export const IN_STATUS_LABEL = { new: 'новое', read: 'нужен ответ', replied: 'отвечено', noreply: 'без ответа' } as const
export const OUT_STATUS_LABEL = { draft: 'черновик', review: 'на согласовании', approved: 'согласовано', sent: 'отправлено' } as const

const low = (s: string) => s.toLowerCase().replace(/ё/g, 'е')
/** Категория по ключевым словам (порядок важен: претензия важнее всего) */
export function classify(l: Pick<Letter, 'subject' | 'body'>): LetterCategory {
  const t = low(l.subject + ' ' + l.body)
  if (/претензи|штраф|неустойк|нарушени[ея] (срок|услови|договор)|требуем возместить/.test(t)) return 'claim'
  if (/изменени|корректировк|дополнительн(ые|ых) работ|новая планировк|ревизи[яи] проекта|замен[аы] материал/.test(t)) return 'change'
  if (/кс-2|кс-3|кс2|акт(ы|ов)? (выполнен|приемк)|оплат|сч[её]т|аванс|процентовк/.test(t)) return 'payment'
  if (/сертификат|паспорт|декларац|предписани|качеств|защитн(ый|ого) сло|входн(ой|ого) контрол/.test(t)) return 'quality'
  if (/график|срок|отставани|задержк|перенос|ввод в эксплуатац/.test(t)) return 'schedule'
  return 'info'
}

/** Срок ответа: «до 18.11.2026» или «в течение N (рабочих) дней» от даты письма */
export function extractDeadline(l: Pick<Letter, 'body' | 'date'>): string | undefined {
  const b = low(l.body)
  const iso = (m: RegExpMatchArray) => `${m[3]}-${m[2]}-${m[1]}`
  const d1 = b.match(/(?:в срок до|не позднее)\s+(\d{2})\.(\d{2})\.(\d{4})/)
  if (d1) return iso(d1)
  const n = b.match(/в течение\s+(\d+)\s*(рабочих|календарных)?\s*дн/)
  if (n) { const days = Number(n[1]); return addDays(l.date, n[2] === 'рабочих' ? Math.ceil(days * 7 / 5) : days) }
  // «до даты» — только если это просьба к нам, а не цитата из договора
  const d2 = b.match(/(?:просим|сообщить|представить|направить|ответить)[^.]*?\sдо\s+(\d{2})\.(\d{2})\.(\d{4})/)
  if (d2) return iso(d2)
  return undefined
}

/** Ссылки на документы в тексте: КС-2/КС-3, письма, допсоглашения, предписания */
export function extractRefs(text: string): string[] {
  const out = new Set<string>()
  const re = /(КС-[23]\s*№\s*\d+|письм[оау]\s*№\s*[\p{L}\d/-]+|доп(?:олнительн\p{L}+)?\s*соглашени\p{L}*\s*№\s*\d+|предписани\p{L}*\s*№\s*\d+|договор\p{L}*(?:\s+подряда)?\s*№\s*[\d/-]+)/giu
  for (const m of text.matchAll(re)) out.add(m[1].replace(/\s+/g, ' '))
  return [...out]
}

export type ReplyStatus = 'overdue' | 'soon' | 'ok' | 'none'
export function replyStatus(l: Letter, today: string): ReplyStatus {
  if (l.direction !== 'in' || l.status === 'replied' || l.status === 'noreply' || !l.replyBy) return 'none'
  if (l.replyBy < today) return 'overdue'
  return (Date.parse(l.replyBy) - Date.parse(today)) / 86400000 <= 2 ? 'soon' : 'ok'
}

export function nextOutNumber(letters: Letter[], today: string): string {
  const yy = today.slice(2, 4)
  const nums = letters.filter((l) => l.direction === 'out' && l.number.endsWith('/' + yy)).map((l) => parseInt(l.number, 10)).filter(Number.isFinite)
  return `${String((nums.length ? Math.max(...nums) : 100) + 1).padStart(3, '0')}/${yy}`
}

// ---------- черновик ответа ----------
export interface Draft { subject: string; body: string; facts: string[]; warnings: string[] }

/** Черновик собирается из данных объекта. Поля в [квадратных скобках] нужно заполнить вручную — без этого отправка заблокирована. */
export function draftReply(state: DataState, letter: Letter, author: User, director: User, today: string): Draft {
  const project = state.projects.find((p) => p.id === letter.projectId) as Project
  const cat = classify(letter)
  const facts: string[] = []
  const warnings: string[] = []
  const ref = letter.senderRef ? `на Ваше письмо ${letter.senderRef}` : `на Ваше письмо от ${formatDate(letter.date)} (вх. № ${letter.number})`
  const p: string[] = [`Уважаемые коллеги!`, '', `В ответ ${ref} «${letter.subject}» по объекту «${project.name}» сообщаем следующее.`, '']

  if (cat === 'schedule' || cat === 'claim') {
    const m = projectMetrics(project, state.stages)
    const own = state.stages.filter((s) => s.projectId === project.id && s.progress < 100)
    p.push(`Общая готовность объекта на ${formatDate(today)} — ${m.progress.toFixed(0)}% (по графику ${m.plannedProgress.toFixed(0)}%).`)
    facts.push(`Готовность ${m.progress.toFixed(1)}%, план ${m.plannedProgress.toFixed(1)}%`)
    if (own.length) {
      p.push('', 'Состояние работ по незавершённым этапам:')
      own.forEach((s) => {
        const plan = stagePlannedProgress(s, today)
        p.push(`— ${s.name} (${s.section}): выполнено ${s.progress}%, по графику ${plan.toFixed(0)}%, окончание по графику ${formatDate(s.endDate)}.`)
        if (plan - s.progress >= 5) facts.push(`Отставание: ${s.name} — ${(plan - s.progress).toFixed(0)} п.п.`)
      })
    }
    if (m.behind) p.push('', 'Для сокращения отставания приняты меры: [указать меры: дополнительная бригада, вторая смена, ускорение поставок]. Ожидаемый срок выхода на график — [дата].')
  }
  if (cat === 'payment') {
    const reps = state.executionReports.filter((r) => r.projectId === project.id).sort((a, b) => a.number - b.number)
    p.push('По выполнению работ и документам КС-2/КС-3:')
    for (const r of reps) {
      const est = state.estimates.find((e) => e.id === r.estimateId)
      if (!est) continue
      const k = buildKs2(r, est, state.executionReports)
      p.push(`— КС-2/КС-3 № ${r.number} за ${formatDate(r.dateFrom)}–${formatDate(r.dateTo)}: ${formatMoney(k.grand)} с НДС, ${r.status === 'signed' ? 'подписаны с нашей стороны' : 'в работе, будут направлены до [дата]'}.`)
      facts.push(`КС-2 № ${r.number}: ${formatMoney(k.grand)} (${r.status === 'signed' ? 'подписан' : 'черновик'})`)
    }
    if (!reps.length) p.push('— [указать сведения о выполнении и документах].')
    p.push('', 'Замечания к актам, изложенные в письме, [рассмотрены / будут устранены до даты]. Исправленные документы направим дополнительно.')
  }
  if (cat === 'quality') {
    const cov = coverage(state, project.id, today)
    const bad = cov.filter((r) => r.problems.length)
    p.push('Документы о качестве применённых материалов:')
    cov.filter((r) => !r.problems.length).slice(0, 8).forEach((r) => p.push(`— ${state.materials.find((m) => m.id === r.materialId)?.name}: ${r.conformity ? `${r.conformity.kind.toLowerCase()} № ${r.conformity.number}` : ''}${r.passport ? `${r.conformity ? ', ' : ''}паспорт № ${r.passport.number}` : ''}.`))
    if (bad.length) {
      p.push('', 'По следующим позициям документы будут представлены дополнительно до [дата]:')
      bad.forEach((r) => p.push(`— ${state.materials.find((m) => m.id === r.materialId)?.name} (${r.problems.join('; ')}).`))
      facts.push(`Материалов с замечаниями по документам: ${bad.length}`)
    }
    p.push('', 'Копии документов прилагаем. По замечаниям стройконтроля [указать выполненные мероприятия и дату устранения].')
  }
  if (cat === 'change') {
    p.push('Предложенные изменения приняты к рассмотрению. Для их выполнения:',
      '— подготовим корректировку сметы (включаемые и исключаемые работы) и расчёт стоимости изменений;',
      '— оценим влияние на сроки строительства;',
      '— направим проект дополнительного соглашения к договору.',
      '', 'Просим подтвердить изменения в установленном порядке (изменённая рабочая документация со штампом «В производство работ»). До получения подтверждения работы ведутся по действующей документации.',
      '', 'Ориентировочный срок представления расчёта — [дата].')
    facts.push('Нужна корректировка сметы и допсоглашение')
  }
  if (cat === 'claim') {
    p.push('', 'Изложенные в письме требования рассматриваются. Предлагаем провести рабочее совещание [дата, время] для согласования графика и порядка урегулирования. Позиция по существу требований будет направлена дополнительно.')
    warnings.push('Претензия: перед отправкой ответ должен проверить юрист. Черновик не признаёт требования и не содержит обязательств.')
  }
  if (cat === 'info') p.push('Информация принята к сведению. [При необходимости — указать ответственных и сроки].')

  p.push('', 'Ответственный за взаимодействие по объекту: [ФИО, телефон].', '', 'С уважением,', `Генеральный директор ${director.name}`, '', `Исп.: ${author.name}`)
  return { subject: `Ответ на ${letter.senderRef ?? `вх. № ${letter.number}`}: ${letter.subject}`, body: p.join('\n'), facts, warnings }
}

/** Незаполненные поля [в квадратных скобках] */
export const placeholders = (text: string) => [...text.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1])

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
export function letterHtml(l: Letter, companyName = 'ООО «СтройAI» (демо)'): string {
  return `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><title>${esc(l.subject)}</title><style>
body{font-family:'Times New Roman',serif;font-size:13pt;line-height:1.4;margin:2cm}.head{border-bottom:2px solid #1e3a8a;padding-bottom:6px;margin-bottom:16px;font-weight:bold;color:#1e3a8a}
.meta{display:flex;justify-content:space-between}pre{font-family:inherit;white-space:pre-wrap}</style></head><body>
<div class="head">${esc(companyName)}</div>
<div class="meta"><div>Исх. № ${esc(l.number)} от ${formatDate(l.date)}</div><div style="text-align:right">${esc(l.to)}</div></div>
<p><b>О ${esc(l.subject.replace(/^Ответ на [^:]+:\s*/, '').toLowerCase())}</b></p><pre>${esc(l.body)}</pre></body></html>`
}
