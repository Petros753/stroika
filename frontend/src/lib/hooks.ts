import { useMemo } from 'react'
import { useCurrentUser, useStore } from '../store'
import { ALL_PROJECTS_ROLES } from '../domain/permissions'
import { can } from '../domain/permissions'
import type { Permission } from '../domain/types'

export function useVisibleProjects() {
  const user = useCurrentUser()
  const projects = useStore((s) => s.projects)
  return useMemo(
    () => (ALL_PROJECTS_ROLES.includes(user.role) ? projects : projects.filter((p) => user.projectIds.includes(p.id))),
    [projects, user],
  )
}

export function useCan(perm: Permission): boolean {
  return can(useCurrentUser().role, perm)
}

export function useUserName() {
  const users = useStore((s) => s.users)
  return (id?: string) => users.find((u) => u.id === id)?.name.split(' ').slice(0, 2).join(' ') ?? '—'
}
