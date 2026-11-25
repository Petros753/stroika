import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertTriangle, Copy, Download, FilePlus2, Printer, Save, Trash2 } from 'lucide-react'
import clsx from 'clsx'
import { Badge, Field, PageHeader, ProgressBar, Table, Tabs } from '../components/ui'
import { Confirm } from '../components/Confirm'
import { toast } from '../components/Toast'
import { useStore } from '../store'
import { useCan, useUserName, useVisibleProjects } from '../lib/hooks'
import { formatMoney, formatMoneyShort } from '../lib/format'
import { TODAY, formatDate } from '../lib/date'
import { download, printHtml } from '../lib/download'
import {
  FINISH_LABEL, GROUP_LABEL, KIND_LABEL, REGIONS, STRUCTURE_LABEL, calcCost, costCsv, costHtml, currentCost, defaultCostInput, regionOf,
} from '../domain/costing'
import type { BuildingKind, CostInput, FinishLevel, Project, StructureKind } from '../domain/types'

type Tab = 'current' | 'new'
const pct = (v: number) => `${v.toFixed(1).replace('.', ',')}%`

export default function Costing() {
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get('tab') === 'new' ? 'new' : 'current'
  const setTab = (t: Tab) => { const n = new URLSearchParams(params); n.set('tab', t); setParams(n, { replace: true }) }
  const calcs = useStore((s) => s.costCalcs)
  const [analogSeed, setAnalogSeed] = useState<Project | null>(null)

  return (
    <div>
      <PageHeader title="Себестоимость объектов" subtitle="Текущие объекты: план, факт и прогноз. Новые объекты: предварительный расчёт укрупнённо или по аналогу" />
      <Tabs tabs={[{ key: 'current', label: 'Текущие объекты' }, { key: 'new', label: `Новые объекты (${calcs.length})` }]} value={tab} onChange={setTab} />
      {tab === 'current'
        ? <Current onAnalog={(p) => { setAnalogSeed(p); setTab('new') }} />
        : <NewObjects analogSeed={analogSeed} onSeedUsed={() => setAnalogSeed(null)} />}
    </div>
  )
}

// ---------------- текущие объекты ----------------
function Current({ onAnalog }: { onAnalog: (p: Project) => void }) {
  const projects = useVisibleProjects()
  const stages = useStore((s) => s.stages)
  const canCalc = useCan('costing.edit')
  const [sel, setSel] = useState(projects[0]?.id ?? '')
  const rows = useMemo(() => projects.map((p) => ({ p, c: currentCost(p, stages) })), [projects, stages])
  const t = rows.reduce((a, { p, c }) => ({ budget: a.budget + p.budget, planned: a.planned + c.planned, spent: a.spent + c.spent, forecast: a.forecast + c.forecast }), { budget: 0, planned: 0, spent: 0, forecast: 0 })
  const cur = rows.find((r) => r.p.id === sel) ?? rows[0]
  if (!rows.length) return <p className="text-sm text-slate-500">Нет доступных объектов</p>

  return (
    <>
      <Table>
        <thead className="border-b">
          <tr>
            <th className="th">Объект</th><th className="th text-right">Договор</th><th className="th text-right">Себестоимость план</th>
            <th className="th text-right">Затрачено</th><th className="th text-right">Осталось затратить</th><th className="th text-right">Прогноз себестоимости</th>
            <th className="th text-right">Отклонение</th><th className="th text-right">Рентабельность план → прогноз</th><th className="th text-right">₽/м² (прогноз)</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map(({ p, c }) => (
            <tr key={p.id} data-cost-project={p.id} onClick={() => setSel(p.id)}
              className={clsx('cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50', cur?.p.id === p.id && 'bg-brand-50/60 dark:bg-brand-500/10')}>
              <td className="td font-medium">{p.name}<div className="text-xs font-normal text-slate-500">{p.area ? `${p.area.toLocaleString('ru-RU')} м²` : 'площадь не указана'}</div></td>
              <td className="td text-right">{formatMoneyShort(p.budget)}</td>
              <td className="td text-right">{formatMoneyShort(c.planned)}</td>
              <td className="td text-right">{formatMoneyShort(c.spent)}</td>
              <td className="td text-right">{formatMoneyShort(c.toComplete)}</td>
              <td className="td text-right font-medium">{formatMoneyShort(c.forecast)}</td>
              <td className={clsx('td text-right', c.deviation > 0 ? 'text-red-600' : 'text-emerald-600')}>{c.deviation > 0 ? '+' : ''}{formatMoneyShort(c.deviation)}</td>
              <td className="td text-right">{pct(c.plannedProfitability)} → <b className={c.profitability < 0 ? 'text-red-600' : c.profitability < c.plannedProfitability - 2 ? 'text-amber-600' : ''}>{pct(c.profitability)}</b></td>
              <td className="td text-right">{c.perM2 ? formatMoney(c.perM2) : '—'}</td>
            </tr>
          ))}
          <tr className="bg-slate-50 font-semibold dark:bg-slate-800/50">
            <td className="td">Итого</td><td className="td text-right">{formatMoneyShort(t.budget)}</td><td className="td text-right">{formatMoneyShort(t.planned)}</td>
            <td className="td text-right">{formatMoneyShort(t.spent)}</td><td className="td text-right">{formatMoneyShort(t.forecast - t.spent)}</td>
            <td className="td text-right">{formatMoneyShort(t.forecast)}</td><td className="td text-right">{formatMoneyShort(t.forecast - t.planned)}</td>
            <td className="td text-right">{pct(t.budget ? ((t.budget - t.forecast) / t.budget) * 100 : 0)}</td><td className="td" />
          </tr>
        </tbody>
      </Table>

      {cur && (
        <div className="card mt-4 p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{cur.p.name}: себестоимость по группам работ</h3>
            {cur.c.profitability < 0 && <Badge tone="red">прогноз убытка</Badge>}
            {canCalc && cur.p.area && (
              <button className="btn-secondary ml-auto" onClick={() => onAnalog(cur.p)}><Copy size={15} />Рассчитать новый объект по аналогу</button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead className="border-b"><tr><th className="th">Группа</th><th className="th text-right">План</th><th className="th text-right">Затрачено</th><th className="th w-48">Освоено от прогноза</th><th className="th text-right">Прогноз</th><th className="th text-right">Отклонение</th></tr></thead>
              <tbody className="divide-y">
                {cur.c.rows.map((r) => (
                  <tr key={r.group}>
                    <td className="td">{GROUP_LABEL[r.group]}</td>
                    <td className="td text-right">{formatMoney(r.planned)}</td>
                    <td className="td text-right">{formatMoney(r.spent)}</td>
                    <td className="td"><ProgressBar value={r.forecast ? (r.spent / r.forecast) * 100 : 0} tone={r.deviation > r.planned * 0.05 ? 'red' : 'blue'} /></td>
                    <td className="td text-right">{formatMoney(r.forecast)}</td>
                    <td className={clsx('td text-right', r.deviation > 0 ? 'text-red-600' : 'text-emerald-600')}>{r.deviation > 0 ? '+' : ''}{formatMoney(r.deviation)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Прогноз = факт ÷ процент выполнения по каждому этапу (для незавершённых), для не начатых — план.
            В рабочей версии факт затрат подтягивается из 1С и закрытых КС-2 субподрядчиков.
          </p>
        </div>
      )}
    </>
  )
}

// ---------------- новые объекты ----------------
function NewObjects({ analogSeed, onSeedUsed }: { analogSeed: Project | null; onSeedUsed: () => void }) {
  const calcs = useStore((s) => s.costCalcs)
  const projects = useStore((s) => s.projects)
  const stages = useStore((s) => s.stages)
  const save = useStore((s) => s.saveCostCalc)
  const remove = useStore((s) => s.removeCostCalc)
  const canEdit = useCan('costing.edit')
  const name = useUserName()

  const fromSeed = (p: Project): CostInput => ({
    ...defaultCostInput(), name: `Новый объект (аналог: ${p.name})`, method: 'analog', analogId: p.id,
    kind: p.kind ?? 'residential', area: p.area ?? 10000, floors: p.floors ?? 9,
  })
  const [selId, setSelId] = useState<string | null>(analogSeed ? null : calcs[0]?.id ?? null)
  const [input, setInput] = useState<CostInput>(() => (analogSeed ? fromSeed(analogSeed) : calcs[0]?.input ?? defaultCostInput()))
  const [dirty, setDirty] = useState(!!analogSeed)
  const [confirm, setConfirm] = useState(false)
  useEffect(() => { if (analogSeed) onSeedUsed() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const analogs = projects.filter((p) => p.area)
  const analogProject = input.method === 'analog' ? projects.find((p) => p.id === input.analogId) : undefined
  const result = useMemo(() => calcCost(input, TODAY, analogProject ? { project: analogProject, stages } : undefined), [input, analogProject, stages])
  const set = <K extends keyof CostInput>(k: K, v: CostInput[K]) => { setInput((x) => ({ ...x, [k]: v })); setDirty(true) }
  const num = (k: 'area' | 'floors' | 'months' | 'overheadPct' | 'reservePct' | 'marginPct') => (e: ChangeEvent<HTMLInputElement>) => set(k, Math.max(0, Number(e.target.value) || 0))
  const open = (id: string) => { const c = calcs.find((x) => x.id === id); if (c) { setSelId(id); setInput(c.input); setDirty(false) } }
  const doSave = (asNew: boolean) => {
    const id = save(asNew ? { ...input, name: selId ? `${input.name} (копия)` : input.name } : input, asNew ? undefined : selId ?? undefined)
    setSelId(id); setDirty(false); toast.ok(asNew && selId ? 'Сохранена копия расчёта' : 'Расчёт сохранён')
    if (asNew && selId) setInput((x) => ({ ...x, name: `${x.name} (копия)` }))
  }
  const file = `raschet_${(selId ?? 'new')}`
  const analogMode = input.method === 'analog'

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      <div className="space-y-2">
        {canEdit && <button className="btn-primary w-full" onClick={() => { setSelId(null); setInput(defaultCostInput()); setDirty(true) }}><FilePlus2 size={15} />Новый расчёт</button>}
        {calcs.map((c) => {
          const a = c.input.method === 'analog' ? projects.find((p) => p.id === c.input.analogId) : undefined
          const r = calcCost(c.input, TODAY, a ? { project: a, stages } : undefined)
          return (
            <button key={c.id} data-calc={c.id} onClick={() => open(c.id)}
              className={clsx('card block w-full p-3 text-left transition hover:border-brand-400', selId === c.id && 'border-brand-500 ring-1 ring-brand-500')}>
              <div className="text-sm font-medium">{c.input.name}</div>
              <div className="mt-1 text-xs text-slate-500">{c.input.area.toLocaleString('ru-RU')} м² · {c.input.region} · {c.input.method === 'analog' ? 'по аналогу' : 'укрупнённо'}</div>
              <div className="mt-1 flex justify-between text-xs"><span>{formatMoneyShort(r.cost)}</span><span className="text-slate-500">{formatDate(c.createdAt)} · {name(c.authorId)}</span></div>
            </button>
          )
        })}
      </div>

      <div className="space-y-4">
        <div className="card p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input className="input flex-1 !text-base font-semibold" aria-label="Название расчёта" value={input.name} disabled={!canEdit} onChange={(e) => set('name', e.target.value)} />
            {dirty && <Badge tone="amber">не сохранено</Badge>}
          </div>
          <div className="mb-3 flex gap-1 rounded-lg bg-slate-100 p-1 text-sm dark:bg-slate-800">
            {(['norms', 'analog'] as const).map((m) => (
              <button key={m} disabled={!canEdit} onClick={() => { set('method', m); if (m === 'analog' && !input.analogId) set('analogId', analogs[0]?.id) }}
                className={clsx('flex-1 rounded-md px-3 py-1.5 font-medium', input.method === m ? 'bg-white shadow-sm dark:bg-slate-900' : 'text-slate-500')}>
                {m === 'norms' ? 'Укрупнённые нормативы' : 'По аналогу (наш объект)'}
              </button>
            ))}
          </div>
          <fieldset disabled={!canEdit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {analogMode && (
              <Field label="Объект-аналог" className="sm:col-span-2">
                <select className="input" value={input.analogId} onChange={(e) => set('analogId', e.target.value)}>
                  {analogs.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.area?.toLocaleString('ru-RU')} м²</option>)}
                </select>
              </Field>
            )}
            <Field label="Назначение">
              <select className="input" value={input.kind} onChange={(e) => set('kind', e.target.value as BuildingKind)}>
                {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="Общая площадь, м²"><input type="number" min={0} className="input" aria-label="Площадь" value={input.area} onChange={num('area')} /></Field>
            <Field label="Этажность"><input type="number" min={1} className="input" value={input.floors} onChange={num('floors')} /></Field>
            <Field label="Регион">
              <select className="input" value={input.region} onChange={(e) => set('region', e.target.value)}>
                {Object.entries(REGIONS).map(([k, v]) => <option key={k} value={k}>{k} (×{v})</option>)}
              </select>
            </Field>
            {!analogMode && (
              <>
                <Field label="Конструктив">
                  <select className="input" value={input.structure} onChange={(e) => set('structure', e.target.value as StructureKind)}>
                    {Object.entries(STRUCTURE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </Field>
                <Field label="Отделка">
                  <select className="input" value={input.finish} onChange={(e) => set('finish', e.target.value as FinishLevel)}>
                    {Object.entries(FINISH_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </Field>
                <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={input.underground} onChange={(e) => set('underground', e.target.checked)} />Подземный этаж / паркинг</label>
              </>
            )}
            <Field label={`Срок, мес. (норматив ~${result.norm})`}><input type="number" min={1} className="input" value={input.months} onChange={num('months')} /></Field>
            <Field label="Накладные, %"><input type="number" min={0} className="input" value={input.overheadPct} onChange={num('overheadPct')} /></Field>
            <Field label="Резерв, %"><input type="number" min={0} className="input" value={input.reservePct} onChange={num('reservePct')} /></Field>
            <Field label="Маржа, %"><input type="number" min={0} className="input" value={input.marginPct} onChange={num('marginPct')} /></Field>
          </fieldset>
          {analogMode && analogProject && (
            <p className="mt-3 text-xs text-slate-500">По аналогу берётся плановая себестоимость этапов объекта «{analogProject.name}» ({regionOf(analogProject.address)}) на 1 м²
              с удорожанием и пересчётом региона. Конструктив, отделка и подземная часть — как у аналога.</p>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['Себестоимость', formatMoney(result.cost), `${formatMoney(result.costPerM2)} за м²`],
            ['Цена без НДС', formatMoney(result.price), `маржа ${formatMoneyShort(result.margin)}`],
            ['Цена с НДС 20%', formatMoney(result.priceVat), `НДС ${formatMoneyShort(result.vat)}`],
            ['Материалы +10%', `+${formatMoney(result.materials10)}`, 'чувствительность к ценам'],
          ].map(([l, v, s]) => (
            <div key={l} className="card p-3" data-kpi={l}>
              <div className="text-xs text-slate-500">{l}</div>
              <div className="mt-0.5 text-lg font-semibold">{v}</div>
              <div className="text-xs text-slate-500">{s}</div>
            </div>
          ))}
        </div>

        {result.warnings.length > 0 && (
          <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
            {result.warnings.map((w) => <div key={w} className="flex gap-2"><AlertTriangle size={15} className="mt-0.5 shrink-0" />{w}</div>)}
          </div>
        )}

        <div className="card p-4">
          <p className="mb-3 text-xs text-slate-500">{result.basis}</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead className="border-b"><tr><th className="th">Группа работ</th><th className="th text-right">₽/м²</th><th className="th text-right">Материалы</th><th className="th text-right">Труд</th><th className="th text-right">Машины</th><th className="th text-right">Итого</th><th className="th w-32">Доля</th></tr></thead>
              <tbody className="divide-y">
                {result.lines.map((l) => (
                  <tr key={l.group} data-group={l.group}>
                    <td className="td">{GROUP_LABEL[l.group]}{l.note && <div className="text-xs text-slate-500">{l.note}</div>}</td>
                    <td className="td text-right">{formatMoney(l.rate)}</td>
                    <td className="td text-right">{formatMoneyShort(l.materials)}</td>
                    <td className="td text-right">{formatMoneyShort(l.labor)}</td>
                    <td className="td text-right">{formatMoneyShort(l.machines)}</td>
                    <td className="td text-right font-medium">{formatMoney(l.sum)}</td>
                    <td className="td"><ProgressBar value={result.direct ? (l.sum / result.direct) * 100 : 0} /></td>
                  </tr>
                ))}
              </tbody>
              <tbody className="border-t-2">
                {([
                  ['Прямые затраты', result.direct, true],
                  [`Накладные расходы ${input.overheadPct}%`, result.overhead, false],
                  [`Резерв на непредвиденные ${input.reservePct}%`, result.reserve, false],
                  ['Себестоимость', result.cost, true],
                  [`Маржа ${input.marginPct}%`, result.margin, false],
                  ['Цена без НДС', result.price, false],
                  ['НДС 20%', result.vat, false],
                  ['Цена с НДС', result.priceVat, true],
                ] as [string, number, boolean][]).map(([l, v, b]) => (
                  <tr key={l} className={b ? 'font-semibold' : ''}><td className="td text-right" colSpan={5}>{l}</td><td className="td text-right">{formatMoney(v)}</td><td className="td" /></tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Предварительная оценка для тендера и бюджета: демонстрационные укрупнённые показатели, не заменяют сметный расчёт.
            В рабочей версии ставки берутся из НЦС Минстроя, базы завершённых объектов компании и актуальных цен поставщиков.
          </p>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          {canEdit && selId && <button className="btn-secondary mr-auto text-red-600" onClick={() => setConfirm(true)}><Trash2 size={15} />Удалить</button>}
          <button className="btn-secondary" onClick={() => { download(`${file}.csv`, costCsv(input, result), 'text/csv;charset=utf-8'); toast.ok('Расчёт выгружен в CSV') }}><Download size={15} />CSV</button>
          <button className="btn-secondary" onClick={() => { download(`${file}.doc`, costHtml(input, result, formatDate(TODAY)), 'application/msword;charset=utf-8'); toast.ok('Расчёт выгружен в Word (.doc)') }}><Download size={15} />Word</button>
          <button className="btn-secondary" onClick={() => { printHtml(costHtml(input, result, formatDate(TODAY))); toast.info('В окне печати выберите «Сохранить как PDF»') }}><Printer size={15} />PDF</button>
          {canEdit && selId && <button className="btn-secondary" onClick={() => doSave(true)}><Copy size={15} />Сохранить копию</button>}
          {canEdit && <button className="btn-primary" disabled={!dirty || input.area <= 0 || !input.name.trim()} onClick={() => doSave(false)}><Save size={15} />Сохранить</button>}
        </div>
      </div>
      <Confirm open={confirm} danger title="Удалить расчёт?" okLabel="Удалить" text={`Расчёт «${input.name}» будет удалён.`}
        onCancel={() => setConfirm(false)}
        onOk={() => { if (selId) remove(selId); setConfirm(false); const next = calcs.find((c) => c.id !== selId); if (next) open(next.id); else { setSelId(null); setInput(defaultCostInput()) } toast.ok('Расчёт удалён') }} />
    </div>
  )
}
