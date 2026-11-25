import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Download, FileDown, History, Layers, Send, Sparkles, Undo2, X } from 'lucide-react'
import clsx from 'clsx'
import { Badge, Modal, PageHeader, Tabs } from '../components/ui'
import { CadViewer, FIT, FIT_FRAME, type AsBuilt } from '../components/cad/CadViewer'
import { toast } from '../components/Toast'
import { useCurrentUser, useStore } from '../store'
import { useCan, useUserName, useVisibleProjects } from '../lib/hooks'
import { basePlan, CAD_FLOORS } from '../data/cad'
import { KIND_LABEL, KIND_PLURAL, LAYER_COLOR, LAYER_LABEL, countByKind, segLength } from '../domain/cad'
import { CAD_EXAMPLES, runCadCommand, type CadResult } from '../domain/cadAi'
import type { CadLayer } from '../domain/types'
import { shortName } from '../lib/format'
import { TODAY, formatDate } from '../lib/date'

const ALL_LAYERS = Object.keys(LAYER_LABEL) as CadLayer[]
type RightTab = 'ai' | 'props' | 'history'
type ExportKind = 'dwg' | 'dxf' | 'pdf'

interface FeedItem { id: number; command: string; result: CadResult }

function download(filename: string, content: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }))
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function CadPage() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const user = useCurrentUser()
  const name = useUserName()
  const projects = useVisibleProjects()
  const cadAdded = useStore((s) => s.cadAdded)
  const cadHistory = useStore((s) => s.cadHistory)
  const addCad = useStore((s) => s.addCadElements)
  const undoCad = useStore((s) => s.undoCad)
  const createExecDoc = useStore((s) => s.createExecDoc)
  const canEdit = useCan('cad.edit')
  const canPto = useCan('pto.create')

  const projectId = projects.find((p) => p.id === params.get('project'))?.id ?? projects[0]?.id ?? ''
  const project = projects.find((p) => p.id === projectId)
  const [floor, setFloor] = useState(1)
  const [layers, setLayers] = useState<Record<CadLayer, boolean>>({ walls: true, dims: true, electric: true, plumbing: true, vent: true })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [highlight, setHighlight] = useState<Set<string>>(new Set())
  const [markers, setMarkers] = useState<{ x: number; y: number; label: string }[]>([])
  const [asBuilt, setAsBuilt] = useState<AsBuilt | null>(null)
  const [focusRoom, setFocusRoom] = useState<number | null>(null)
  const [tab, setTab] = useState<RightTab>('ai')
  const [input, setInput] = useState('')
  const [feed, setFeed] = useState<FeedItem[]>([])
  const [exportKind, setExportKind] = useState<ExportKind | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const seq = useRef(0)
  const feedEnd = useRef<HTMLDivElement>(null)
  useEffect(() => { feedEnd.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }) }, [feed.length])

  const all = useMemo(() => [...basePlan(), ...cadAdded.filter((e) => e.projectId === projectId)], [cadAdded, projectId])
  const floorEls = useMemo(() => all.filter((e) => e.floor === floor), [all, floor])
  const selected = all.find((e) => e.id === selectedId) ?? null
  const counts = countByKind(floorEls)
  const history = cadHistory.filter((h) => h.projectId === projectId)

  function clearOverlay() { setHighlight(new Set()); setMarkers([]); setAsBuilt(null); setFocusRoom(null) }

  function highlightGroup(ids: string[], label: string) {
    setHighlight(new Set(ids)); setMarkers([]); setAsBuilt(null); setFocusRoom(null)
    toast.info(`Подсвечено: ${label} — ${ids.length}`)
  }

  function run(text: string) {
    const cmd = text.trim()
    if (!cmd) return
    const res = runCadCommand(cmd, { elements: all, floor, floors: CAD_FLOORS, canEdit })
    if (res.floor !== undefined) setFloor(res.floor)
    if (res.layers) setLayers((l) => ({ ...l, ...Object.fromEntries(res.layers!.map((k) => [k, true])) }))
    setHighlight(new Set(res.highlightIds)); setMarkers(res.markers)
    setFocusRoom(res.focusRoomNo ?? null)
    setAsBuilt(res.asBuilt ? { project: project?.name ?? '', sheet: `Лист 1 · этаж ${res.floor ?? floor}`, date: formatDate(TODAY) } : null)
    if (res.add && project) addCad(res.add, { projectId: project.id, command: cmd, summary: res.title })
    setFeed((f) => [...f, { id: ++seq.current, command: cmd, result: res }])
    setInput(''); setTab('ai')
    if (!res.ok) toast.error(res.title)
  }

  function exportSvg() {
    const svg = svgRef.current
    if (!svg) return
    const clone = svg.cloneNode(true) as SVGSVGElement
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    const box = asBuilt ? FIT_FRAME : FIT
    clone.setAttribute('viewBox', `${box.x} ${box.y} ${box.w} ${box.h}`)
    clone.setAttribute('width', String(box.w * 4)); clone.setAttribute('height', String(box.h * 4))
    clone.removeAttribute('class'); clone.removeAttribute('style')
    clone.querySelectorAll('[data-id]').forEach((n) => n.removeAttribute('data-id'))
    clone.querySelectorAll('.cad-pulse').forEach((n) => n.removeAttribute('class'))
    const title = document.createElementNS('http://www.w3.org/2000/svg', 'title')
    title.textContent = `${project?.name ?? ''} — этаж ${floor} (СтройAI, демо)`
    clone.insertBefore(title, clone.firstChild)
    const file = `stroyai_plan_${projectId}_etazh${floor}.svg`
    download(file, '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone), 'image/svg+xml')
    toast.ok(`SVG сохранён: ${file}`)
  }

  const visibleCount = floorEls.filter((e) => layers[e.layer]).length

  if (!project) return <PageHeader title="AI CAD" subtitle="Нет доступных объектов" />

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="AI CAD"
        subtitle="Интерактивный просмотр чертежа с AI-командами. Демо-чертёж: типовой административный этаж 40 × 20 м"
        actions={
          <>
            <select className="input !w-64" value={projectId} onChange={(e) => { setParams({ project: e.target.value }); setSelectedId(null); clearOverlay() }}>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <button className="btn-secondary" onClick={exportSvg}><Download size={15} /> SVG</button>
            {(['dwg', 'dxf', 'pdf'] as ExportKind[]).map((k) => (
              <button key={k} className="btn-secondary" onClick={() => setExportKind(k)}><FileDown size={15} /> {k.toUpperCase()}</button>
            ))}
          </>
        }
      />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[230px_minmax(0,1fr)_340px]">
        {/* Левая панель: этаж, слои, спецификация */}
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto lg:max-h-[calc(100vh-180px)]">
          <div className="card p-3">
            <div className="label">Этаж</div>
            <div className="flex gap-1">
              {CAD_FLOORS.map((f) => (
                <button key={f} className={clsx('flex-1', floor === f ? 'btn-primary' : 'btn-secondary')} onClick={() => { setFloor(f); setSelectedId(null); clearOverlay() }}>{f}</button>
              ))}
            </div>
          </div>
          <div className="card p-3">
            <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><Layers size={14} /> Слои</div>
            <div className="space-y-1">
              {ALL_LAYERS.map((l) => (
                <label key={l} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
                  <input type="checkbox" checked={layers[l]} onChange={(e) => setLayers({ ...layers, [l]: e.target.checked })} />
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: LAYER_COLOR[l] }} />
                  <span className="flex-1">{LAYER_LABEL[l]}</span>
                  <span className="text-xs text-slate-400">{floorEls.filter((e) => e.layer === l).length}</span>
                </label>
              ))}
            </div>
            <div className="mt-2 flex gap-1">
              <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setLayers({ walls: true, dims: true, electric: true, plumbing: true, vent: true })}>Все</button>
              <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setLayers({ walls: true, dims: false, electric: false, plumbing: false, vent: false })}>Только стены</button>
            </div>
          </div>
          <div className="card p-3">
            <div className="mb-2 text-sm font-semibold">Спецификация этажа {floor}</div>
            <p className="mb-2 text-xs text-slate-500">Клик по строке подсвечивает группу на плане.</p>
            <div className="space-y-0.5">
              {(Object.keys(counts) as (keyof typeof counts)[]).filter((k) => k !== 'room').map((k) => (
                <button
                  key={k}
                  className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                  onClick={() => { const ids = floorEls.filter((e) => e.kind === k).map((e) => e.id); setLayers((l) => ({ ...l, [floorEls.find((e) => e.kind === k)!.layer]: true })); highlightGroup(ids, KIND_PLURAL[k!]) }}
                >
                  <span>{KIND_PLURAL[k!]}</span><span className="font-medium">{counts[k]}</span>
                </button>
              ))}
            </div>
            <div className="mt-2 border-t pt-2 text-xs text-slate-500">Всего на плане: {visibleCount} элементов</div>
          </div>
        </div>

        {/* Холст */}
        <div className="flex min-h-[420px] flex-col gap-2 lg:max-h-[calc(100vh-180px)]">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge tone="blue">Этаж {floor}</Badge>
            {highlight.size > 0 && <Badge tone="violet">Подсвечено: {highlight.size}</Badge>}
            {markers.length > 0 && <Badge tone="red">Пересечений: {markers.length}</Badge>}
            {asBuilt && <Badge tone="green">Режим исполнительной схемы</Badge>}
            {(highlight.size > 0 || markers.length > 0 || asBuilt) && (
              <button className="btn-ghost !px-2 !py-0.5 text-xs" onClick={clearOverlay}><X size={13} /> Сбросить</button>
            )}
            <div className="flex-1" />
            <span className="text-xs text-slate-400">{project.name}</span>
          </div>
          <div className="min-h-0 flex-1">
            <CadViewer
              elements={floorEls} layers={layers} selectedId={selectedId} highlight={highlight} markers={markers}
              asBuilt={asBuilt} focusRoomNo={focusRoom}
              onSelect={(id) => { setSelectedId(id); if (id) setTab('props') }} svgRef={svgRef}
            />
          </div>
        </div>

        {/* Правая панель */}
        <div className="card flex min-h-[420px] flex-col lg:max-h-[calc(100vh-180px)]">
          <div className="px-3 pt-2">
            <Tabs<RightTab> value={tab} onChange={setTab} tabs={[{ key: 'ai', label: 'AI-команды' }, { key: 'props', label: 'Свойства' }, { key: 'history', label: 'История', badge: undefined }]} />
          </div>

          {tab === 'ai' && (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 pb-3">
                <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800/50 dark:text-slate-300">
                  Команды разбираются по ключевым словам (демонстрационный алгоритм, не языковая модель). Результат считается по элементам чертежа.
                </div>
                {feed.length === 0 && (
                  <div>
                    <div className="mb-1.5 text-xs font-medium text-slate-500">Примеры команд</div>
                    <div className="flex flex-col gap-1.5">
                      {CAD_EXAMPLES.map((c) => (
                        <button key={c} className="rounded-lg border px-3 py-1.5 text-left text-sm hover:border-brand-400 hover:bg-brand-50 dark:hover:bg-brand-500/10" onClick={() => run(c)}>{c}</button>
                      ))}
                    </div>
                  </div>
                )}
                {feed.map((f) => (
                  <div key={f.id} className="space-y-1.5">
                    <div className="ml-6 rounded-lg bg-brand-600 px-3 py-1.5 text-sm text-white">{f.command}</div>
                    <div className={clsx('rounded-lg border px-3 py-2 text-sm', f.result.ok ? '' : 'border-red-200 bg-red-50 dark:border-red-500/30 dark:bg-red-500/10')}>
                      <div className="mb-0.5 flex items-center gap-1.5 font-semibold"><Sparkles size={13} className="text-brand-600" />{f.result.title}</div>
                      <p className="text-slate-600 dark:text-slate-300">{f.result.message}</p>
                      {f.result.table && (
                        <div className="mt-2 max-h-48 overflow-auto rounded border">
                          <table className="w-full text-xs">
                            <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800"><tr>{f.result.table.head.map((h) => <th key={h} className="px-2 py-1 text-left font-semibold">{h}</th>)}</tr></thead>
                            <tbody className="divide-y">{f.result.table.rows.map((r, i) => <tr key={i} className={r[2] === 'ИТОГО' ? 'font-semibold' : ''}>{r.map((c, j) => <td key={j} className="px-2 py-1">{c}</td>)}</tr>)}</tbody>
                          </table>
                        </div>
                      )}
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {f.result.csv && <button className="btn-secondary !py-1 text-xs" onClick={() => { download(f.result.csv!.filename, f.result.csv!.content, 'text/csv;charset=utf-8'); toast.ok('CSV сохранён') }}><Download size={13} /> Скачать CSV</button>}
                        {f.result.execDoc && (
                          canPto
                            ? <button className="btn-primary !py-1 text-xs" onClick={() => { createExecDoc({ projectId: project.id, kind: f.result.execDoc!.kind, title: f.result.execDoc!.title, works: f.result.execDoc!.works }); toast.ok('Документ создан в разделе ПТО как черновик'); navigate(`/pto?project=${project.id}`) }}>Создать документ в ПТО</button>
                            : <span className="text-xs text-slate-500">Создавать документы ПТО может инженер ПТО или прораб.</span>
                        )}
                        {f.result.add && <button className="btn-secondary !py-1 text-xs" onClick={() => setTab('history')}><History size={13} /> К истории</button>}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={feedEnd} />
              </div>
              <form className="flex gap-2 border-t p-3" onSubmit={(e) => { e.preventDefault(); run(input) }}>
                <input className="input" placeholder="Например: посчитай все розетки на 1 этаже" value={input} onChange={(e) => setInput(e.target.value)} />
                <button className="btn-primary !px-3" type="submit" aria-label="Выполнить"><Send size={15} /></button>
              </form>
              {feed.length > 0 && (
                <div className="flex flex-wrap gap-1 border-t px-3 py-2">
                  {CAD_EXAMPLES.map((c) => <button key={c} className="rounded-full border px-2 py-0.5 text-[11px] text-slate-500 hover:border-brand-400 hover:text-brand-600" onClick={() => run(c)}>{c}</button>)}
                </div>
              )}
            </div>
          )}

          {tab === 'props' && (
            <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
              {!selected ? (
                <p className="py-6 text-center text-sm text-slate-500">Кликните по элементу на чертеже, чтобы увидеть его характеристики.</p>
              ) : (
                <div className="space-y-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full" style={{ background: LAYER_COLOR[selected.layer] }} />
                      <h3 className="text-base font-semibold">{KIND_LABEL[selected.kind]}{selected.label && selected.kind !== 'room' ? ` ${selected.label}` : ''}</h3>
                      {selected.added && <Badge tone="green">добавлено</Badge>}
                    </div>
                    <p className="text-xs text-slate-500">Слой «{LAYER_LABEL[selected.layer]}» · этаж {selected.floor}{selected.roomNo !== undefined ? ` · помещение №${selected.roomNo}` : ''}</p>
                  </div>
                  <table className="w-full text-sm"><tbody className="divide-y">
                    {Object.entries(selected.props).filter(([k]) => k !== 'Направление' && k !== 'Толщина').map(([k, v]) => (
                      <tr key={k}><td className="py-1.5 pr-2 text-slate-500">{k}</td><td className="py-1.5 text-right font-medium">{String(v)}</td></tr>
                    ))}
                    <tr><td className="py-1.5 pr-2 text-slate-500">Координаты, м</td><td className="py-1.5 text-right font-medium">{(selected.x * 0.1).toFixed(1)}; {(selected.y * 0.1).toFixed(1)}</td></tr>
                    {segLength(selected) > 0 && <tr><td className="py-1.5 pr-2 text-slate-500">Длина по чертежу, м</td><td className="py-1.5 text-right font-medium">{segLength(selected).toFixed(1)}</td></tr>}
                  </tbody></table>
                  <div className="flex flex-col gap-1.5">
                    <button className="btn-secondary" onClick={() => highlightGroup(floorEls.filter((e) => e.kind === selected.kind).map((e) => e.id), KIND_PLURAL[selected.kind])}>Подсветить все: {KIND_PLURAL[selected.kind].toLowerCase()} этажа</button>
                    {selected.roomNo !== undefined && (
                      <button className="btn-secondary" onClick={() => highlightGroup(floorEls.filter((e) => e.roomNo === selected.roomNo && e.kind !== 'room').map((e) => e.id), `элементы помещения №${selected.roomNo}`)}>Подсветить всё в помещении №{selected.roomNo}</button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'history' && (
            <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
              <p className="mb-2 text-xs text-slate-500">История изменений чертежа объекта. Изменения вносятся AI-командами; каждое можно отменить.</p>
              {history.length === 0 && <p className="py-6 text-center text-sm text-slate-500">Изменений пока нет. Попробуйте команду «Добавь три розетки в помещении №5».</p>}
              <div className="space-y-2">
                {history.map((h) => (
                  <div key={h.id} className="rounded-lg border p-2.5 text-sm">
                    <div className="font-medium">{h.summary}</div>
                    <div className="mt-0.5 text-xs text-slate-500">«{h.command}»</div>
                    <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
                      <span>{name(h.userId)} · {new Date(h.date).toLocaleString('ru-RU')}</span>
                      {canEdit && <button className="flex items-center gap-1 text-red-600 hover:underline" onClick={() => { undoCad(h.id); setHighlight(new Set()); setSelectedId(null); toast.ok('Изменение отменено') }}><Undo2 size={12} /> Отменить</button>}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 text-xs text-slate-400">Роль: {user.name.split(' ').slice(0, 2).join(' ')}. {canEdit ? 'Можно изменять чертёж.' : 'Права на изменение чертежа отсутствуют.'}</div>
            </div>
          )}
        </div>
      </div>

      <Modal
        open={!!exportKind} onClose={() => setExportKind(null)} title={`Экспорт в ${exportKind?.toUpperCase()} — демонстрация`}
        footer={<><button className="btn-secondary" onClick={() => setExportKind(null)}>Закрыть</button><button className="btn-primary" onClick={() => { exportSvg(); setExportKind(null) }}>Скачать SVG</button></>}
      >
        <div className="space-y-3 text-sm">
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
            В демонстрационной версии CAD-движка нет, поэтому файл {exportKind?.toUpperCase()} не создаётся. Реальный экспорт доступен только в формате SVG.
          </div>
          <p>В рабочей версии экспорт выполнит отдельный CAD-сервис (интеграция через Autodesk Platform Services или серверный конвертер). Планируемый состав экспорта:</p>
          <table className="w-full text-sm"><tbody className="divide-y">
            <tr><td className="py-1.5 text-slate-500">Объект</td><td className="py-1.5 text-right">{project.name}</td></tr>
            <tr><td className="py-1.5 text-slate-500">Этаж</td><td className="py-1.5 text-right">{floor}</td></tr>
            <tr><td className="py-1.5 text-slate-500">Слои</td><td className="py-1.5 text-right">{ALL_LAYERS.filter((l) => layers[l]).map((l) => LAYER_LABEL[l]).join(', ') || '—'}</td></tr>
            <tr><td className="py-1.5 text-slate-500">Элементов к экспорту</td><td className="py-1.5 text-right">{visibleCount}</td></tr>
            <tr><td className="py-1.5 text-slate-500">Добавлено AI-командами</td><td className="py-1.5 text-right">{floorEls.filter((e) => e.added).length}</td></tr>
          </tbody></table>
        </div>
      </Modal>
    </div>
  )
}
