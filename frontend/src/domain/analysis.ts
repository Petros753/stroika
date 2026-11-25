import type { DataState } from '../data/seed'
import { missingExecDocs, overdueTasks, procurementNeeds, projectMetrics, stagePlannedProgress, stockRows } from './calc'
import { formatMoneyShort } from '../lib/format'

export interface StageOverrun {
  stageId: string
  name: string
  section: string
  overrun: number
}

export interface ProjectAnalysis {
  projectId: string
  summary: string[]
  risks: string[]
  recommendations: string[]
  stageOverruns: StageOverrun[]
  laggingStages: { stageId: string; name: string; section: string; delayPp: number }[]
}

/** Детерминированный анализ объекта по правилам. Не использует LLM. */
export function analyzeProject(state: DataState, projectId: string): ProjectAnalysis | null {
  const p = state.projects.find((x) => x.id === projectId)
  if (!p) return null
  const m = projectMetrics(p, state.stages)
  const stages = state.stages.filter((s) => s.projectId === projectId)
  const stageOverruns = stages
    .map((s) => ({ stageId: s.id, name: s.name, section: s.section, overrun: s.actualCost - (s.plannedCost * s.progress) / 100 }))
    .filter((x) => x.overrun > 0)
    .sort((a, b) => b.overrun - a.overrun)
  const laggingStages = stages
    .map((s) => ({ stageId: s.id, name: s.name, section: s.section, delayPp: stagePlannedProgress(s) - s.progress }))
    .filter((x) => x.delayPp >= 10)
    .sort((a, b) => b.delayPp - a.delayPp)

  const tasks = state.tasks.filter((t) => t.projectId === projectId)
  const overdue = overdueTasks(tasks)
  const miss = missingExecDocs(state, projectId)
  const wh = state.warehouses.find((w) => w.projectId === projectId)
  const lows = stockRows(state).filter((r) => r.low && r.warehouseId === wh?.id)
  const needs = procurementNeeds(state).filter((n) => n.projectId === projectId && n.toBuy > 0)
  const pending = state.requests.filter((r) => r.projectId === projectId && r.status === 'pending')
  const unsigned = state.documents.filter((d) => d.projectId === projectId && d.status === 'unsigned')

  const summary = [
    `Готовность ${m.progress.toFixed(0)}% при плановой ${m.plannedProgress.toFixed(0)}% на текущую дату.`,
    `Расходы ${formatMoneyShort(m.spent)} из плановой себестоимости ${formatMoneyShort(m.plannedCost)}; бюджет по договору ${formatMoneyShort(p.budget)}.`,
    `Планируемая прибыль ${formatMoneyShort(m.plannedProfit)}, прогноз с учётом перерасхода ${formatMoneyShort(m.forecastProfit)}.`,
  ]
  const risks: string[] = []
  const recommendations: string[] = []
  if (m.behind) {
    risks.push(`Отставание от графика на ${m.delayPp.toFixed(0)} п.п.`)
    if (laggingStages[0]) recommendations.push(`Усилить этап «${laggingStages[0].name}» (${laggingStages[0].section}): отставание ${laggingStages[0].delayPp.toFixed(0)} п.п.`)
  }
  if (m.overrunPct >= 5) {
    risks.push(`Перерасход ${formatMoneyShort(m.overrun)} (${m.overrunPct.toFixed(1)}% от освоенного объёма)`)
    if (stageOverruns[0]) recommendations.push(`Разобрать причины перерасхода по этапу «${stageOverruns[0].name}» (${formatMoneyShort(stageOverruns[0].overrun)}) и скорректировать смету.`)
  }
  if (m.forecastProfit < 0) risks.push(`Прогноз по объекту убыточный: ${formatMoneyShort(m.forecastProfit)}. Требуется пересмотр бюджета с заказчиком.`)
  if (overdue.length) {
    risks.push(`Просрочено задач: ${overdue.length}`)
    recommendations.push(`Перепланировать просроченные задачи: ${overdue.slice(0, 2).map((t) => '«' + t.title + '»').join('; ')}${overdue.length > 2 ? '…' : ''}`)
  }
  if (lows.length) risks.push(`Дефицит материалов на складе объекта: ${lows.length} поз.`)
  if (needs.length) recommendations.push(`Оформить заявки на материалы: ${needs.slice(0, 3).map((n) => state.materials.find((x) => x.id === n.materialId)?.name).join(', ')}${needs.length > 3 ? '…' : ''}`)
  if (pending.length) recommendations.push(`Согласовать заявки: ${pending.map((r) => r.number).join(', ')}`)
  if (miss.length) {
    risks.push(`Не подготовлено документов ИД: ${miss.length}`)
    recommendations.push(`Подготовить ИД: ${miss.slice(0, 2).map((r) => r.title).join('; ')}${miss.length > 2 ? '…' : ''}`)
  }
  if (unsigned.length) recommendations.push(`Получить подписи по документам: ${unsigned.length} шт. (акты КС, допсоглашения)`)
  if (risks.length === 0) risks.push('Существенных рисков по правилам не выявлено.')
  if (recommendations.length === 0) recommendations.push('Действий не требуется.')
  return { projectId, summary, risks, recommendations, stageOverruns, laggingStages }
}
