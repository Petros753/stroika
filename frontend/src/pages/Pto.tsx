import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FilePlus2, Ruler } from 'lucide-react'
import { Badge, PageHeader, ProgressBar, Table, Tabs } from '../components/ui'
import { DocModal } from '../components/pto/DocModal'
import { CreateDocModal } from '../components/pto/CreateDocModal'
import { useStore } from '../store'
import { useCan, useUserName, useVisibleProjects } from '../lib/hooks'
import { EXEC_STATUS_LABEL, EXEC_STATUS_TONE } from '../domain/labels'
import { EXEC_KINDS, EXEC_KIND_GROUPS, DEMO_DISCLAIMER } from '../domain/execdocs'
import { QualityDocs } from '../components/pto/QualityDocs'
import { Photos } from '../components/pto/Photos'
import { AsBuiltModal } from '../components/pto/AsBuiltModal'
import { coverage, criticalGaps } from '../domain/quality'
import { TODAY } from '../lib/date'
import { missingExecDocs } from '../domain/calc'
import { formatDate } from '../lib/date'

type Tab = 'docs' | 'missing' | 'register' | 'quality' | 'photos'
const TABS: Tab[] = ['docs', 'missing', 'register', 'quality', 'photos']

export default function Pto() {
  const [params, setParams] = useSearchParams()
  const projects = useVisibleProjects()
  const state = useStore()
  const name = useUserName()
  const canCreate = useCan('pto.create')
  const ids = new Set(projects.map((p) => p.id))
  const pp = params.get('project')
  const projectId = pp && ids.has(pp) ? pp : 'all'
  const pt = params.get('tab') as Tab | null
  const [tab, setTab] = useState<Tab>(params.get('new') ? 'missing' : pt && TABS.includes(pt) ? pt : 'docs')
  useEffect(() => { if (pt && TABS.includes(pt)) setTab(pt) }, [pt])
  const [openId, setOpenId] = useState<string | null>(params.get('doc'))
  const [creating, setCreating] = useState(!!params.get('new') && canCreate)
  const [asBuilt, setAsBuilt] = useState(!!params.get('asbuilt') && canCreate)
  const [reqId, setReqId] = useState<string | null>(params.get('new'))
  const [kind, setKind] = useState('all')

  const clear = (...keys: string[]) => { const n = new URLSearchParams(params); keys.forEach((k) => n.delete(k)); setParams(n, { replace: true }) }
  const inScope = (pid: string) => ids.has(pid) && (projectId === 'all' || pid === projectId)
  const docs = state.execDocs.filter((d) => inScope(d.projectId) && (kind === 'all' || d.kind === kind))
  const missing = missingExecDocs(state).filter((r) => inScope(r.projectId))
  const reqs = state.requirements.filter((r) => inScope(r.projectId))
  const ready = reqs.length - missing.length
  const pname = (id: string) => projects.find((p) => p.id === id)?.name ?? ''
  const gaps = projects.filter((p) => inScope(p.id)).reduce((a, p) => a + criticalGaps(coverage(state, p.id, TODAY)).length, 0)
  const photoCount = state.photos.filter((p) => inScope(p.projectId)).length

  const openCreate = (rid: string | null) => { setReqId(rid); setCreating(true) }

  return (
    <div>
      <PageHeader
        title="Исполнительная документация"
        subtitle="Акты по видам работ, исполнительные схемы, реестры, документы о качестве материалов и фотофиксация"
        actions={
          <>
            <select className="input !w-auto" value={projectId} onChange={(e) => { const n = new URLSearchParams(params); n.set('project', e.target.value); n.delete('doc'); setParams(n, { replace: true }) }} aria-label="Объект">
              <option value="all">Все объекты</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {canCreate && <button className="btn-secondary" onClick={() => setAsBuilt(true)}><Ruler size={15} />Исполнительная схема</button>}
            {canCreate && <button className="btn-primary" onClick={() => openCreate(null)}><FilePlus2 size={15} />Создать документ</button>}
          </>
        }
      />
      <p className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">{DEMO_DISCLAIMER}</p>

      <div className="card mb-4 p-4">
        <div className="mb-2 flex items-center justify-between text-sm"><span className="font-semibold">Комплектность ИД</span><span>{ready} из {reqs.length}</span></div>
        <ProgressBar value={reqs.length ? (ready / reqs.length) * 100 : 0} tone={missing.length ? 'amber' : 'green'} />
      </div>

      <Tabs<Tab> value={tab} onChange={setTab} tabs={[{ key: 'docs', label: 'Документы' }, { key: 'missing', label: 'Требуется оформить', badge: missing.length }, { key: 'register', label: 'Реестр' }, { key: 'quality', label: 'Сертификаты и паспорта', badge: gaps }, { key: 'photos', label: `Фотофиксация (${photoCount})` }]} />

      {tab === 'docs' && (
        <>
          <div className="mb-3"><select className="input !w-auto" value={kind} onChange={(e) => setKind(e.target.value)}><option value="all">Все виды</option>{EXEC_KIND_GROUPS.map((g) => <optgroup key={g.group} label={g.group}>{g.kinds.map((k) => <option key={k} value={k}>{k}</option>)}</optgroup>)}</select></div>
          <Table>
            <thead className="border-b"><tr><th className="th">Документ</th><th className="th">Объект</th><th className="th">Вид</th><th className="th">Версий</th><th className="th">Автор</th><th className="th">Дата</th><th className="th">Статус</th></tr></thead>
            <tbody className="divide-y">
              {docs.length === 0 && <tr><td className="td text-slate-500" colSpan={7}>Документов нет</td></tr>}
              {docs.map((d) => (
                <tr key={d.id} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50" onClick={() => setOpenId(d.id)}>
                  <td className="td font-medium">{d.title}</td><td className="td text-slate-500">{pname(d.projectId)}</td><td className="td">{d.kind}</td>
                  <td className="td">{d.versions.length}</td><td className="td">{name(d.authorId)}</td><td className="td">{formatDate(d.createdAt)}</td>
                  <td className="td"><Badge tone={EXEC_STATUS_TONE[d.status]}>{EXEC_STATUS_LABEL[d.status]}</Badge></td>
                </tr>
              ))}
            </tbody>
          </Table>
        </>
      )}

      {tab === 'missing' && (
        <Table>
          <thead className="border-b"><tr><th className="th">Требование</th><th className="th">Объект</th><th className="th">Вид</th><th className="th" /></tr></thead>
          <tbody className="divide-y">
            {missing.length === 0 && <tr><td className="td text-emerald-600" colSpan={4}>Все требуемые документы подготовлены</td></tr>}
            {missing.map((r) => (
              <tr key={r.id}>
                <td className="td font-medium">{r.title}</td><td className="td text-slate-500">{pname(r.projectId)}</td><td className="td">{r.kind}</td>
                <td className="td text-right">{canCreate ? <button className="btn-primary !py-1" onClick={() => openCreate(r.id)}>Подготовить</button> : <span className="text-xs text-slate-500">Готовит ПТО или прораб</span>}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      {tab === 'register' && (
        <Table>
          <thead className="border-b"><tr><th className="th">Вид документа</th><th className="th text-right">Всего</th><th className="th text-right">Черновик</th><th className="th text-right">На согласовании</th><th className="th text-right">Согласовано</th><th className="th text-right">Возвращено</th></tr></thead>
          <tbody className="divide-y">
            {EXEC_KINDS.map((k) => {
              const list = state.execDocs.filter((d) => inScope(d.projectId) && d.kind === k)
              if (!list.length) return null
              const c = (s: string) => list.filter((d) => d.status === s).length
              return <tr key={k}><td className="td font-medium">{k}</td><td className="td text-right">{list.length}</td><td className="td text-right">{c('draft')}</td><td className="td text-right">{c('review')}</td><td className="td text-right">{c('approved')}</td><td className="td text-right">{c('rejected')}</td></tr>
            })}
          </tbody>
        </Table>
      )}

      {tab === 'quality' && <QualityDocs projectId={projectId} />}
      {tab === 'photos' && <Photos projectId={projectId} />}

      {asBuilt && <AsBuiltModal projectId={params.get('project') ?? undefined} fileId={params.get('file') ?? undefined} onClose={() => { setAsBuilt(false); clear('asbuilt') }} onSaved={(id) => { setAsBuilt(false); clear('asbuilt'); setTab('docs'); setOpenId(id) }} />}
      <DocModal id={openId} onClose={() => { setOpenId(null); clear('doc') }} />
      <CreateDocModal
        open={creating} requirementId={reqId} defaultProject={projectId === 'all' ? projects[0]?.id ?? '' : projectId}
        onClose={() => { setCreating(false); setReqId(null); clear('new') }}
        onCreated={(id) => { setCreating(false); setReqId(null); clear('new'); setTab('docs'); setOpenId(id) }}
      />
    </div>
  )
}
