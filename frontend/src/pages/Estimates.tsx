import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Upload } from 'lucide-react'
import { Badge, PageHeader, Table, Tabs } from '../components/ui'
import { EstimateView } from '../components/estimates/EstimateView'
import { UploadModal } from '../components/estimates/UploadModal'
import { ReconcileView } from '../components/estimates/ReconcileView'
import { useStore } from '../store'
import { useCan, useVisibleProjects } from '../lib/hooks'
import { estimateTotal, reconcile } from '../domain/estimates'
import { formatMoney } from '../lib/format'
import { formatDate } from '../lib/date'

type Tab = 'list' | 'recon' | 'versions' | 'reports'

export default function Estimates() {
  const [params, setParams] = useSearchParams()
  const projects = useVisibleProjects()
  const all = useStore((s) => s.estimates)
  const canUpload = useCan('estimate.upload')
  const [tab, setTab] = useState<Tab>('list')
  const [uploading, setUploading] = useState(false)
  const [openId, setOpenId] = useState<string | null>(params.get('open'))

  const ids = new Set(projects.map((p) => p.id))
  const paramProject = params.get('project')
  const projectId = paramProject && ids.has(paramProject) ? paramProject : projects[0]?.id ?? ''
  const project = projects.find((p) => p.id === projectId)
  const mine = useMemo(() => all.filter((e) => ids.has(e.projectId)), [all, projects]) // eslint-disable-line react-hooks/exhaustive-deps
  const ofProject = mine.filter((e) => e.projectId === projectId)
  const listed = paramProject === 'all' ? mine : ofProject

  const setProject = (v: string) => { const n = new URLSearchParams(params); n.set('project', v); n.delete('open'); setParams(n, { replace: true }) }

  // версии: группы по названию внутри выбранного объекта
  const [versionName, setVersionName] = useState('')
  const names = [...new Set(ofProject.map((e) => e.name))]
  const vName = names.includes(versionName) ? versionName : names[0] ?? ''
  const versionOptions = ofProject.filter((e) => e.name === vName)

  const grand = ofProject.filter((e) => e.source === 'ГРАНД-Смета')
  const others = ofProject.filter((e) => e.source !== 'ГРАНД-Смета')

  const reports = useMemo(() => projects.map((p) => {
    const es = all.filter((e) => e.projectId === p.id)
    const a = [...es.filter((e) => e.source === 'ГРАНД-Смета')].sort((x, y) => y.version - x.version)[0]
    const b = [...es.filter((e) => e.source !== 'ГРАНД-Смета')].sort((x, y) => y.date.localeCompare(x.date))[0]
    return { p, a, b, rec: a && b ? reconcile(a, b) : null }
  }), [projects, all])

  if (!projects.length) return <PageHeader title="Сметы" subtitle="Нет доступных объектов" />

  return (
    <div>
      <PageHeader
        title="Сметы"
        subtitle="Загрузка, просмотр, сверка с ГРАНД-Сметой и сравнение версий"
        actions={
          <>
            <select className="input !w-auto" value={paramProject === 'all' && tab === 'list' ? 'all' : projectId} onChange={(e) => setProject(e.target.value)} aria-label="Объект">
              {tab === 'list' && projects.length > 1 && <option value="all">Все объекты</option>}
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {canUpload && <button className="btn-primary" onClick={() => setUploading(true)}><Upload size={15} />Загрузить смету</button>}
          </>
        }
      />
      <Tabs<Tab>
        value={tab} onChange={setTab}
        tabs={[{ key: 'list', label: 'Сметы' }, { key: 'recon', label: 'Сверка с ГРАНД-Сметой' }, { key: 'versions', label: 'Версии' }, { key: 'reports', label: 'Отчёты' }]}
      />

      {tab === 'list' && (
        <Table>
          <thead className="border-b"><tr><th className="th">Смета</th><th className="th">Объект</th><th className="th">Версия</th><th className="th">Источник</th><th className="th">Дата</th><th className="th text-right">Позиций</th><th className="th text-right">Итого</th></tr></thead>
          <tbody className="divide-y">
            {listed.length === 0 && <tr><td className="td text-slate-500" colSpan={7}>Смет пока нет{canUpload ? ' — загрузите первую' : ''}</td></tr>}
            {listed.map((e) => (
              <tr key={e.id} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50" onClick={() => setOpenId(e.id)}>
                <td className="td font-medium">{e.name}</td>
                <td className="td text-slate-500">{projects.find((p) => p.id === e.projectId)?.name}</td>
                <td className="td">v{e.version}</td>
                <td className="td"><Badge tone={e.source === 'ГРАНД-Смета' ? 'blue' : 'slate'}>{e.source}</Badge></td>
                <td className="td">{formatDate(e.date)}</td>
                <td className="td text-right">{e.items.length}</td>
                <td className="td text-right">{formatMoney(estimateTotal(e))}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      {tab === 'recon' && (
        <>
          <p className="mb-3 text-sm text-slate-500">A — эталон (ГРАНД-Смета), B — смета подрядчика или другая загруженная смета. Сопоставление по шифру, затем по наименованию.</p>
          <ReconcileView optionsA={grand} optionsB={others.length ? others : ofProject} titleA="Смета A (ГРАНД-Смета)" titleB="Смета B (для сверки)" budget={project?.budget} />
        </>
      )}

      {tab === 'versions' && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-slate-500">Смета:</span>
            <select className="input !w-auto" value={vName} onChange={(e) => setVersionName(e.target.value)}>{names.map((n) => <option key={n}>{n}</option>)}</select>
            <span className="text-slate-500">· версий: {versionOptions.length}</span>
          </div>
          <ReconcileView optionsA={versionOptions} optionsB={versionOptions} titleA="Версия A (старая)" titleB="Версия B (новая)" budget={project?.budget} />
        </>
      )}

      {tab === 'reports' && (
        <Table>
          <thead className="border-b"><tr><th className="th">Объект</th><th className="th">A (ГРАНД-Смета)</th><th className="th">B</th><th className="th text-right">Разница</th><th className="th text-right">Расхождений</th><th className="th" /></tr></thead>
          <tbody className="divide-y">
            {reports.map(({ p, a, b, rec }) => (
              <tr key={p.id}>
                <td className="td font-medium">{p.name}</td>
                <td className="td">{a ? `v${a.version}` : '—'}</td>
                <td className="td">{b ? `${b.name} v${b.version}` : '—'}</td>
                <td className={`td text-right font-medium ${rec && rec.diff > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{rec ? `${rec.diff >= 0 ? '+' : '−'}${formatMoney(Math.abs(rec.diff))} (${rec.diffPct.toFixed(1).replace('.', ',')} %)` : '—'}</td>
                <td className="td text-right">{rec ? rec.rows.length - rec.counts.match : '—'}</td>
                <td className="td text-right"><button className="btn-secondary" disabled={!rec} onClick={() => { setProject(p.id); setTab('recon') }}>Открыть сверку</button></td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <EstimateView id={openId} onOpen={setOpenId} onClose={() => { setOpenId(null); if (params.get('open')) { const n = new URLSearchParams(params); n.delete('open'); setParams(n, { replace: true }) } }} />
      <UploadModal open={uploading} onClose={() => setUploading(false)} defaultProject={projectId} onCreated={(id) => { setUploading(false); setTab('list'); setOpenId(id) }} />
    </div>
  )
}
