import type { DataState } from '../data/seed'
import type { ChatMessage, User } from './types'
import { computeAlerts, missingExecDocs, overdueTasks, procurementNeeds, projectMetrics, stockRows, visibleProjects } from './calc'
import { analyzeProject } from './analysis'
import { reconcile } from './estimates'
import { buildKs2, executionProgress } from './execution'
import { currentCost } from './costing'
import { coverage } from './quality'
import { classify, CATEGORY_LABEL, replyStatus } from './mail'
import { TODAY } from '../lib/date'
import { formatMoneyShort } from '../lib/format'

/**
 * Детерминированный «ассистент»: разбирает вопрос по ключевым словам и собирает ответ из текущих данных системы.
 * Это НЕ языковая модель. После любого действия пользователя (заявка, смета, документ…) ответы меняются,
 * потому что считаются заново по состоянию хранилища.
 */
export type AssistantReply = Pick<ChatMessage, 'text' | 'table' | 'link'>

export const QUICK_QUESTIONS = [
  'Какие предупреждения сейчас?',
  'Какие объекты отстают от графика?',
  'Где перерасход бюджета?',
  'Какие задачи просрочены?',
  'Чего не хватает на складах?',
  'Какие заявки ждут согласования?',
  'Каких документов ИД не хватает?',
  'Что показала сверка смет?',
  'Сколько выполнено по КС-2?',
  'Какая себестоимость объектов?',
  'На какие материалы нет сертификатов?',
  'На какие письма нужно ответить?',
  'Какой запас арматуры закладывать?',
]

const has = (q: string, ...stems: string[]) => stems.some((s) => q.includes(s))
const stem = (t: string) => t.slice(0, 5)
const words = (s: string) => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 3)

export function answerQuestion(state: DataState, user: User, question: string, projectId?: string): AssistantReply {
  const q = question.toLowerCase().replace(/ё/g, 'е')
  const visible = visibleProjects(state, user)
  const scope = projectId ? visible.filter((p) => p.id === projectId) : visible
  const ids = new Set(scope.map((p) => p.id))
  const pname = (id: string) => state.projects.find((p) => p.id === id)?.name ?? id
  const ctx = projectId && scope[0] ? ` по объекту «${scope[0].name}»` : ''
  if (!scope.length) return { text: 'Нет доступных объектов для вашей роли — спросить не о чем.' }

  // --- база знаний ---
  if (has(q, 'баз знани', 'норм', 'запас', 'регламент', 'решени', 'шаблон', 'договор', 'как правильно')) return answerKb(state, q)

  // --- анализ объекта ---
  if (has(q, 'анализ', 'разбор', 'сводк', 'как дела', 'состояни', 'обзор')) {
    if (projectId) {
      const a = analyzeProject(state, projectId)
      if (a) {
        return {
          text: [`Анализ объекта «${pname(projectId)}» (по правилам):`, '', ...a.summary, '', 'Риски:', ...a.risks.map((r) => '• ' + r), '', 'Рекомендации:', ...a.recommendations.map((r) => '• ' + r)].join('\n'),
          link: [{ to: `/projects/${projectId}?tab=ai`, label: 'Открыть AI-аналитику объекта' }],
        }
      }
    }
    return {
      text: 'Сводка по доступным объектам:',
      table: {
        head: ['Объект', 'Готовность', 'План', 'Перерасход', 'Прогноз прибыли'],
        rows: scope.map((p) => { const m = projectMetrics(p, state.stages); return [p.name, `${m.progress.toFixed(0)}%`, `${m.plannedProgress.toFixed(0)}%`, formatMoneyShort(m.overrun), formatMoneyShort(m.forecastProfit)] }),
      },
      link: [{ to: '/projects', label: 'Перейти к проектам' }],
    }
  }

  if (has(q, 'предупрежд', 'риск', 'срочн', 'проблем', 'критич', 'внимани')) {
    const alerts = computeAlerts(state).filter((a) => !a.projectId || ids.has(a.projectId))
    if (!alerts.length) return { text: `Предупреждений${ctx} нет: правила не выявили отклонений.` }
    const sev = { high: 'Высокая', medium: 'Средняя', low: 'Низкая' }
    return {
      text: `Предупреждений${ctx}: ${alerts.length}. Список пересчитывается по текущим данным.`,
      table: { head: ['Важность', 'Предупреждение'], rows: alerts.map((a) => [sev[a.severity], a.text]) },
      link: alerts.slice(0, 3).map((a) => ({ to: a.link, label: 'Открыть: ' + (a.projectId ? pname(a.projectId) : 'Снабжение') })),
    }
  }

  if (has(q, 'отстаю', 'отстает', 'отстав', 'график', 'задерж', 'срок')) {
    const rows = scope.map((p) => ({ p, m: projectMetrics(p, state.stages) })).filter((x) => x.m.behind).sort((a, b) => b.m.delayPp - a.m.delayPp)
    if (!rows.length) return { text: `Отстающих от графика объектов${ctx} нет.` }
    return {
      text: `От графика отстают объекты: ${rows.length} (порог — 5 п.п.).`,
      table: { head: ['Объект', 'План', 'Факт', 'Отставание'], rows: rows.map(({ p, m }) => [p.name, `${m.plannedProgress.toFixed(0)}%`, `${m.progress.toFixed(0)}%`, `${m.delayPp.toFixed(0)} п.п.`]) },
      link: rows.map(({ p }) => ({ to: `/projects/${p.id}?tab=stages`, label: `Этапы: ${p.name}` })),
    }
  }

  if (has(q, 'себестоим', 'рентабел')) {
    const rows = scope.map((p) => ({ p, c: currentCost(p, state.stages) }))
    const loss = rows.filter((x) => x.c.profitability < 0)
    return {
      text: `Себестоимость${ctx}: план → прогноз по фактическим затратам и выполнению этапов.` + (loss.length ? ` Прогноз убытка: ${loss.map((x) => x.p.name).join(', ')}.` : ''),
      table: {
        head: ['Объект', 'План', 'Прогноз', 'Рентабельность', '₽/м²'],
        rows: rows.map(({ p, c }) => [p.name, formatMoneyShort(c.planned), formatMoneyShort(c.forecast), `${c.plannedProfitability.toFixed(1)}% → ${c.profitability.toFixed(1)}%`, c.perM2 ? formatMoneyShort(c.perM2) : '—']),
      },
      link: [{ to: '/costing', label: 'Открыть «Себестоимость»' }, { to: '/costing?tab=new', label: 'Расчёт нового объекта' }],
    }
  }

  if (has(q, 'перерасход', 'бюджет', 'прибыл', 'убыт', 'маржа', 'затрат')) {
    const rows = scope.map((p) => ({ p, m: projectMetrics(p, state.stages) })).sort((a, b) => b.m.overrunPct - a.m.overrunPct)
    const bad = rows.filter((x) => x.m.overrunPct >= 5)
    return {
      text: bad.length ? `Перерасход выше 5% — на объектах: ${bad.length}. Перерасход = фактические затраты минус освоенный объём по плану.` : `Существенного перерасхода${ctx} нет.`,
      table: { head: ['Объект', 'Перерасход', '% от освоенного', 'Прогноз прибыли'], rows: rows.map(({ p, m }) => [p.name, formatMoneyShort(m.overrun), `${m.overrunPct.toFixed(1)}%`, formatMoneyShort(m.forecastProfit)]) },
      link: bad.map(({ p }) => ({ to: `/projects/${p.id}?tab=overview`, label: `Обзор: ${p.name}` })),
    }
  }

  if (has(q, 'просроч', 'задач')) {
    const list = overdueTasks(state.tasks.filter((t) => ids.has(t.projectId)))
    if (!list.length) return { text: `Просроченных задач${ctx} нет.` }
    return {
      text: `Просрочено задач: ${list.length}.`,
      table: { head: ['Задача', 'Объект', 'Срок'], rows: list.slice(0, 12).map((t) => [t.title, pname(t.projectId), t.dueDate]) },
      link: [{ to: '/projects?view=tasks&filter=overdue', label: 'Все просроченные задачи' }],
    }
  }

  if (has(q, 'письм', 'переписк', 'ответить', 'почт')) {
    const list = state.letters.filter((l) => ids.has(l.projectId) && l.direction === 'in' && (l.status === 'new' || l.status === 'read'))
      .sort((a, b) => (a.replyBy ?? '9').localeCompare(b.replyBy ?? '9'))
    const st = { overdue: 'просрочен', soon: 'истекает', ok: 'в срок', none: '—' }
    return {
      text: list.length ? `Писем, ожидающих ответа${ctx}: ${list.length}. Просрочено: ${list.filter((l) => replyStatus(l, TODAY) === 'overdue').length}.` : `Писем без ответа${ctx} нет.`,
      table: list.length ? { head: ['Объект', 'От кого', 'Тема', 'Вид', 'Ответ до'], rows: list.map((l) => [pname(l.projectId), l.from, l.subject, CATEGORY_LABEL[classify(l)], l.replyBy ? `${l.replyBy.split('-').reverse().join('.')} (${st[replyStatus(l, TODAY)]})` : '—']) } : undefined,
      link: [{ to: '/mail?', label: 'Открыть переписку' }],
    }
  }

  if (has(q, 'сертификат', 'паспорт', 'декларац', 'входн')) {
    const rows = scope.flatMap((p) => coverage(state, p.id, TODAY).filter((r) => r.problems.length).map((r) => [p.name, state.materials.find((m) => m.id === r.materialId)?.name ?? r.materialId, r.problems.join('; ')]))
    return {
      text: rows.length ? `Замечания по документам о качестве материалов${ctx}: ${rows.length}.` : `По документам о качестве${ctx} замечаний нет.`,
      table: rows.length ? { head: ['Объект', 'Материал', 'Замечание'], rows } : undefined,
      link: [{ to: '/pto?tab=quality', label: 'Сертификаты и паспорта' }],
    }
  }

  if (has(q, 'склад', 'дефицит', 'остат', 'не хватает', 'материал')) {
    const rows = stockRows(state).filter((r) => {
      const wh = state.warehouses.find((w) => w.id === r.warehouseId)
      return r.low && wh?.projectId && ids.has(wh.projectId)
    })
    if (!rows.length) return { text: `Дефицита материалов${ctx} нет: остатки выше минимальных.` }
    const needs = procurementNeeds(state)
    return {
      text: `Позиций ниже минимального остатка: ${rows.length}.`,
      table: {
        head: ['Склад', 'Материал', 'Остаток', 'Минимум', 'К закупке'],
        rows: rows.map((r) => {
          const wh = state.warehouses.find((w) => w.id === r.warehouseId)!
          const m = state.materials.find((x) => x.id === r.materialId)!
          const need = needs.find((n) => n.projectId === wh.projectId && n.materialId === r.materialId)
          return [wh.name, m.name, `${r.qty} ${m.unit}`, `${r.minQty} ${m.unit}`, need ? (need.toBuy > 0 ? `${need.toBuy} ${m.unit}` : 'уже в заявках') : '—']
        }),
      },
      link: [{ to: '/warehouse', label: 'Открыть склад' }, { to: '/procurement', label: 'Создать заявку' }],
    }
  }

  if (has(q, 'заявк', 'закуп', 'согласов', 'снабж', 'поставщик', 'заказ')) {
    const list = state.requests.filter((r) => ids.has(r.projectId) && ['pending', 'approved', 'ordered'].includes(r.status))
    const label = { pending: 'На согласовании', approved: 'Согласована', ordered: 'Заказана' } as Record<string, string>
    if (!list.length) return { text: `Активных заявок${ctx} нет.` }
    return {
      text: `Активных заявок: ${list.length}, из них на согласовании: ${list.filter((r) => r.status === 'pending').length}.`,
      table: { head: ['Заявка', 'Объект', 'Статус', 'Нужно к'], rows: list.map((r) => [r.number, pname(r.projectId), label[r.status], r.neededBy]) },
      link: [{ to: '/procurement', label: 'Открыть снабжение' }],
    }
  }

  if (has(q, 'исполнит', 'аоср', ' ид', 'пто', 'подпис', 'документ')) {
    const miss = missingExecDocs(state).filter((r) => ids.has(r.projectId))
    const unsigned = state.documents.filter((d) => ids.has(d.projectId) && d.status === 'unsigned')
    const parts = [`Не подготовлено документов ИД: ${miss.length}.`, `Неподписанных документов по объектам: ${unsigned.length}.`]
    return {
      text: parts.join(' '),
      table: miss.length ? { head: ['Требуемый документ', 'Объект', 'Вид'], rows: miss.map((r) => [r.title, pname(r.projectId), r.kind]) } : undefined,
      link: [{ to: '/pto', label: 'Исполнительная документация' }, { to: '/projects?view=docs', label: 'Неподписанные документы' }],
    }
  }

  if (has(q, 'кс-2', 'кс2', 'кс-3', 'кс3', 'выполнен', 'акт выполн', 'процентовк')) {
    const rows = scope.map((p) => {
      const reps = state.executionReports.filter((r) => r.projectId === p.id)
      const est = state.estimates.find((e) => e.id === reps[0]?.estimateId)
      if (!est) return [p.name, '—', '—', '—']
      const pr = executionProgress(est, state.executionReports)
      const drafts = reps.filter((r) => r.status === 'draft')
      const draftSum = drafts.reduce((a, r) => a + buildKs2(r, est, state.executionReports).total, 0)
      return [p.name, `${formatMoneyShort(pr.done)} (${pr.percent.toFixed(1).replace('.', ',')}%)`, formatMoneyShort(pr.total - pr.done), drafts.length ? `${drafts.length} шт. · ${formatMoneyShort(draftSum)}` : 'нет']
    })
    return {
      text: `Выполнение по подписанным КС-2${ctx} (суммы без НДС):`,
      table: { head: ['Объект', 'Выполнено', 'Остаток по смете', 'Черновики КС-2'], rows },
      link: [{ to: '/execution', label: 'Открыть «Выполнение»' }],
    }
  }

  if (has(q, 'смет', 'сверк', 'расхожд', 'гранд')) {
    const rows = scope.map((p) => {
      const es = state.estimates.filter((e) => e.projectId === p.id)
      const a = [...es.filter((e) => e.source === 'ГРАНД-Смета')].sort((x, y) => y.version - x.version)[0]
      const b = [...es.filter((e) => e.source !== 'ГРАНД-Смета')].sort((x, y) => y.date.localeCompare(x.date))[0]
      if (!a || !b) return [p.name, '—', '—', '—']
      const r = reconcile(a, b)
      return [p.name, `${r.diff >= 0 ? '+' : '−'}${formatMoneyShort(Math.abs(r.diff))} (${r.diffPct.toFixed(1).replace('.', ',')}%)`, String(r.rows.length - r.counts.match), `${r.counts.only_a} поз. · ${formatMoneyShort(r.onlyACost)}`]
    })
    return {
      text: 'Сверка последней сметы подрядчика с ГРАНД-Сметой по объектам:',
      table: { head: ['Объект', 'Разница B − A', 'Расхождений', 'Не учтено подрядчиком'], rows },
      link: [{ to: '/estimates', label: 'Открыть сверку смет' }],
    }
  }

  return {
    text: 'Я отвечаю по данным системы по заранее заданным правилам и не умею свободный диалог. Попробуйте спросить: о предупреждениях, отставании от графика, перерасходе, просроченных задачах, дефиците на складах, заявках, документах ИД, сверке смет, выполнении по КС-2 или о нормативах из базы знаний. Если выбран объект — скажите «сделай анализ».',
  }
}

function answerKb(state: DataState, q: string): AssistantReply {
  const qs = new Set(words(q).map(stem))
  const score = (text: string) => words(text).filter((w) => qs.has(stem(w))).length
  const fb = state.feedback.filter((f) => f.verdict === 'corrected' && f.correction).map((f) => ({ f, s: score(f.question + ' ' + f.correction) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s)
  const docs = state.kbDocs.map((d) => ({ d, s: score(d.title + ' ' + d.category) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s)
  const indexed = docs.filter((x) => x.d.indexed)
  const notIndexed = docs.filter((x) => !x.d.indexed)
  const lines: string[] = []
  if (fb.length) lines.push(`Проверенное решение специалиста: ${fb[0].f.correction}`)
  if (indexed.length) lines.push(`Найдено документов в базе знаний: ${indexed.length}.`)
  if (notIndexed.length) lines.push(`Ещё не проиндексировано (в поиске не участвует): ${notIndexed.map((x) => '«' + x.d.title + '»').join(', ')}.`)
  if (!lines.length) lines.push('В базе знаний ничего подходящего не найдено. Добавьте документ в раздел «База знаний» или оставьте исправление к ответу.')
  return {
    text: lines.join('\n'),
    table: indexed.length ? { head: ['Категория', 'Документ'], rows: indexed.slice(0, 5).map((x) => [x.d.category, x.d.title]) } : undefined,
    link: [{ to: '/knowledge', label: 'Открыть базу знаний' }],
  }
}
