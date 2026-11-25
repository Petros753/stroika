import { Link } from 'react-router-dom'
import { Construction } from 'lucide-react'
import { ROLE_LABEL } from '../domain/labels'
import type { Role } from '../domain/types'
import { PageHeader } from '../components/ui'
import { useCurrentMe } from './auth'
import { SECTION_LABEL, SECTION_PATH, visibleSections } from './sections'

export default function HomePage() {
  const me = useCurrentMe()
  const sections = visibleSections(me.sections)
  return (
    <div>
      <PageHeader title={`Здравствуйте, ${me.user.full_name}`} subtitle={ROLE_LABEL[me.user.role as Role] ?? me.user.role} />
      {sections.length > 0 && (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sections.map((s) => (
            <Link key={s} to={SECTION_PATH[s]} className="card p-4 font-medium transition hover:border-brand-400 hover:shadow-md">
              {SECTION_LABEL[s]}
            </Link>
          ))}
        </div>
      )}
      <div className="card flex items-start gap-3 p-4 text-sm text-slate-600 dark:text-slate-300">
        <Construction size={20} className="mt-0.5 shrink-0 text-amber-500" />
        <div>
          Система запускается поэтапно. Разделы проектов, снабжения, склада, смет, исполнительной документации и чертежей
          появятся здесь по мере подключения — в соответствии с вашей ролью.
        </div>
      </div>
    </div>
  )
}
