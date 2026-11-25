import type { Estimate, ExecutionReport } from '../domain/types'

/** Демо-справки о выполнении: по основной смете (последняя версия ГРАНД-Сметы) каждого объекта.
 *  Два подписанных периода и один черновик — чтобы КС-2/КС-3 были с «ранее выполнено». */
export function seedExecutionReports(estimates: Estimate[]): ExecutionReport[] {
  const out: ExecutionReport[] = []
  const projects = [...new Set(estimates.map((e) => e.projectId))]
  for (const pid of projects) {
    const base = estimates.filter((e) => e.projectId === pid && e.source === 'ГРАНД-Смета').sort((a, b) => b.version - a.version)[0]
    if (!base) continue
    const mk = (number: number, from: string, to: string, status: 'draft' | 'signed', pick: (i: number) => number): ExecutionReport => ({
      id: `x_${pid}_${number}`, projectId: pid, estimateId: base.id, number, dateFrom: from, dateTo: to, status,
      qty: Object.fromEntries(base.items.map((it, i) => [it.id, pick(i) > 0 ? Math.round(it.qty * pick(i) * 100) / 100 : 0]).filter(([, q]) => (q as number) > 0)),
      createdAt: to, signedBy: status === 'signed' ? 'u_pm1' : undefined,
    })
    out.push(mk(1, '2026-09-01', '2026-09-30', 'signed', (i) => (i % 2 === 0 ? 0.12 : 0)))
    out.push(mk(2, '2026-10-01', '2026-10-31', 'signed', (i) => (i % 3 !== 2 ? 0.1 : 0)))
    out.push(mk(3, '2026-11-01', '2026-11-30', 'draft', (i) => (i % 4 === 1 ? 0.06 : 0)))
  }
  return out
}
