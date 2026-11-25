import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Pencil, Sparkles } from 'lucide-react'
import { Badge, Tabs } from '../components/ui'
import { ProjectForm } from '../components/project/ProjectForm'
import { OverviewTab } from '../components/project/OverviewTab'
import { StagesTab } from '../components/project/StagesTab'
import { AiTab, CadTab, DocsTab, EstimatesTab, ExecTab, ProcurementTab } from '../components/project/MiscTabs'
import WarehousePage from './Warehouse'
import { useStore } from '../store'
import { useCan, useVisibleProjects } from '../lib/hooks'
import { PROJECT_STATUS_LABEL, PROJECT_STATUS_TONE } from '../domain/labels'
import { missingExecDocs } from '../domain/calc'
import { TODAY } from '../lib/date'

type TabKey = 'overview' | 'stages' | 'estimates' | 'cad' | 'procurement' | 'warehouse' | 'exec' | 'docs' | 'ai'

export default function ProjectDetail() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const projects = useVisibleProjects()
  const state = useStore()
  const canEdit = useCan('project.edit')
  const [editing, setEditing] = useState(false)
  const project = projects.find((p) => p.id === id)
  const tab = (params.get('tab') as TabKey) || 'overview'

  if (!project) {
    return (
      <div className="mx-auto mt-16 max-w-md text-center">
        <h2 className="text-lg font-semibold">Объект не найден или недоступен</h2>
        <p className="mt-1 text-sm text-slate-500">Возможно, вы не назначены на этот объект.</p>
        <Link to="/projects" className="btn-primary mt-4">К списку объектов</Link>
      </div>
    )
  }
  const overdue = state.tasks.filter((t) => t.projectId === project.id && t.status !== 'done' && t.dueDate < TODAY).length
  const lowStock = state.stock.filter((x) => state.warehouses.find((w) => w.id === x.warehouseId)?.projectId === project.id && x.qty < x.minQty).length
  const missing = missingExecDocs(state, project.id).length

  return (
    <div>
      <button className="mb-2 flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200" onClick={() => navigate('/projects')}><ArrowLeft size={14} /> Все объекты</button>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">{project.name}</h1>
            <Badge tone={PROJECT_STATUS_TONE[project.status]}>{PROJECT_STATUS_LABEL[project.status]}</Badge>
          </div>
          <p className="text-sm text-slate-500">{project.address}</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => navigate(`/assistant?project=${project.id}`)}><Sparkles size={15} /> AI-ассистент</button>
          {canEdit && <button className="btn-primary" onClick={() => setEditing(true)}><Pencil size={15} /> Редактировать</button>}
        </div>
      </div>
      <Tabs<TabKey>
        value={tab}
        onChange={(k) => setParams(k === 'overview' ? {} : { tab: k })}
        tabs={[
          { key: 'overview', label: 'Обзор' },
          { key: 'stages', label: 'Этапы и задачи', badge: overdue },
          { key: 'estimates', label: 'Сметы' },
          { key: 'cad', label: 'Чертежи / AutoCAD' },
          { key: 'procurement', label: 'Снабжение' },
          { key: 'warehouse', label: 'Склад', badge: lowStock },
          { key: 'exec', label: 'Исполнительная документация', badge: missing },
          { key: 'docs', label: 'Документы' },
          { key: 'ai', label: 'AI-аналитика' },
        ]}
      />
      {tab === 'overview' && <OverviewTab project={project} />}
      {tab === 'stages' && <StagesTab project={project} />}
      {tab === 'estimates' && <EstimatesTab project={project} />}
      {tab === 'cad' && <CadTab project={project} />}
      {tab === 'procurement' && <ProcurementTab project={project} />}
      {tab === 'warehouse' && <WarehousePage forProjectId={project.id} />}
      {tab === 'exec' && <ExecTab project={project} />}
      {tab === 'docs' && <DocsTab project={project} />}
      {tab === 'ai' && <AiTab project={project} />}
      <ProjectForm key={String(editing)} open={editing} onClose={() => setEditing(false)} project={project} />
    </div>
  )
}
