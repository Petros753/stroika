import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError, type Me } from './api'

export const ME_KEY = ['me'] as const

/** Смена пользователя: убираем из кэша чужие данные, но не сам запрос ['me'] — на нём держится Gate. */
function resetUserData(qc: QueryClient, me: Me | null) {
  qc.removeQueries({ predicate: (q) => q.queryKey[0] !== ME_KEY[0] })
  qc.setQueryData(ME_KEY, me)
}

/** Текущий пользователь; null — не вошёл. */
export function useMe() {
  return useQuery({
    queryKey: ME_KEY,
    queryFn: async () => (await api<{ me: Me | null }>('/auth/session')).me,
    staleTime: 60_000,
    retry: (n, e) => !(e instanceof ApiError && e.status < 500) && n < 2,
  })
}

/** Пользователь гарантированно вошёл (внутри защищённой части приложения). */
export function useCurrentMe(): Me {
  const { data } = useMe()
  if (!data) throw new Error('useCurrentMe вне защищённой зоны')
  return data
}

export function useCan(perm: string): boolean {
  return useCurrentMe().permissions.includes(perm)
}

export function useLogin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { login: string; password: string }) => api<Me>('/auth/login', { method: 'POST', body: v }),
    onSuccess: (me) => resetUserData(qc, me),
  })
}

export function useLogout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api<void>('/auth/logout', { method: 'POST' }),
    onSettled: () => resetUserData(qc, null),
  })
}

export function useChangePassword() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { current_password: string; new_password: string }) =>
      api<Me>('/auth/change-password', { method: 'POST', body: v }),
    onSuccess: (me) => qc.setQueryData(ME_KEY, me),
  })
}
