import { Badge, EmptyState } from '../ui'
import { useStore } from '../../store'
import { PRIORITY_LABEL, PRIORITY_TONE, REQUEST_STATUS_LABEL, REQUEST_STATUS_TONE } from '../../domain/labels'
import type { PurchaseRequest } from '../../domain/types'
import { formatDate } from '../../lib/date'
import { useUserName } from '../../lib/hooks'
import { shortName } from '../../lib/format'

export function RequestsTable({ requests, onOpen, showProject = true }: { requests: PurchaseRequest[]; onOpen: (id: string) => void; showProject?: boolean }) {
  const projects = useStore((s) => s.projects)
  const materials = useStore((s) => s.materials)
  const name = useUserName()
  if (requests.length === 0) return <EmptyState title="Заявок нет" hint="Создайте первую заявку на материалы." />
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[760px]">
        <thead className="border-b"><tr>
          <th className="th">№</th>{showProject && <th className="th">Объект</th>}<th className="th">Материалы</th><th className="th">Приоритет</th>
          <th className="th">Нужно к</th><th className="th">Автор</th><th className="th">Статус</th>
        </tr></thead>
        <tbody className="divide-y">
          {requests.map((r) => (
            <tr key={r.id} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50" onClick={() => onOpen(r.id)}>
              <td className="td font-medium text-brand-700 dark:text-brand-300">{r.number}</td>
              {showProject && <td className="td">{shortName(projects.find((p) => p.id === r.projectId)?.name ?? '')}</td>}
              <td className="td text-slate-600 dark:text-slate-300">
                {r.items.slice(0, 2).map((i) => materials.find((m) => m.id === i.materialId)?.name).join(', ')}
                {r.items.length > 2 && ` +${r.items.length - 2}`}
              </td>
              <td className="td"><Badge tone={PRIORITY_TONE[r.priority]}>{PRIORITY_LABEL[r.priority]}</Badge></td>
              <td className="td">{formatDate(r.neededBy)}</td>
              <td className="td">{name(r.authorId)}</td>
              <td className="td"><Badge tone={REQUEST_STATUS_TONE[r.status]}>{REQUEST_STATUS_LABEL[r.status]}</Badge></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
