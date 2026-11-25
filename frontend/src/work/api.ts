/** Клиент к /api: cookie-сессия (httpOnly), только JSON. */

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

type Detail = string | { msg?: string; loc?: (string | number)[] }[] | undefined

function detailText(detail: Detail, status: number): string {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail) && detail.length) {
    return detail.map((d) => (d.msg ?? '').replace(/^Value error, /, '')).filter(Boolean).join('; ') || 'Проверьте заполнение полей'
  }
  if (status >= 500) return 'Ошибка сервера. Попробуйте позже.'
  return `Ошибка запроса (${status})`
}

export async function api<T>(path: string, opts: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown } = {}): Promise<T> {
  const method = opts.method ?? 'GET'
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: method === 'GET' ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: method === 'GET' ? undefined : JSON.stringify(opts.body ?? {}),
    })
  } catch {
    throw new ApiError(0, 'Нет связи с сервером')
  }
  if (res.status === 204) return undefined as T
  const data = (await res.json().catch(() => null)) as { detail?: Detail } | null
  if (!res.ok) throw new ApiError(res.status, detailText(data?.detail, res.status))
  return data as T
}

export const PASSWORD_CHANGE_REQUIRED = 'password_change_required'

// ---- Типы ответов API ----

export interface ApiUser {
  id: string
  login: string
  full_name: string
  position: string
  role: string
  must_change_password: boolean
  is_active: boolean
  last_login_at: string | null
  created_at: string
  project_ids: string[]
}

export interface Me {
  user: ApiUser
  sections: string[]
  permissions: string[]
  all_projects: boolean
}

export interface ApiProject {
  id: string
  name: string
  address: string
  created_at: string
}

export interface AuditRow {
  id: number
  at: string
  user_id: string | null
  user_name: string | null
  action: string
  action_label: string
  target_type: string | null
  target_id: string | null
  details: Record<string, unknown>
  ip: string | null
}

export interface PermissionsMatrix {
  roles: Record<string, string>
  sections: Record<string, string[]>
  permissions: Record<string, string[]>
  allProjectsRoles: string[]
  sectionLabel: Record<string, string>
  permissionLabel: Record<string, string>
}
