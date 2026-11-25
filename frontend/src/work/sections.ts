import { SECTION_LABEL, SECTION_PATH } from '../domain/permissions'
import type { SectionKey } from '../domain/types'

/** Не входят в первый релиз — скрыты в рабочей сборке всегда (код прототипа сохранён). */
const ALWAYS_HIDDEN: SectionKey[] = ['mail', 'assistant', 'knowledge']

/** Разделы, уже переведённые на API. Расширяется по этапам через VITE_ENABLED_SECTIONS. */
const ENABLED = (import.meta.env.VITE_ENABLED_SECTIONS ?? 'employees')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean) as SectionKey[]

export function visibleSections(serverSections: string[]): SectionKey[] {
  return (serverSections as SectionKey[]).filter((s) => ENABLED.includes(s) && !ALWAYS_HIDDEN.includes(s) && s in SECTION_PATH)
}

export { SECTION_LABEL, SECTION_PATH }
