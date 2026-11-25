import { useState, type FormEvent } from 'react'
import { KeyRound, LogOut } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from '../components/Toast'
import { PageHeader } from '../components/ui'
import { useChangePassword, useLogout, useMe } from './auth'

function localCheck(pw: string, repeat: string): string | null {
  if (pw.length < 8) return 'Пароль должен быть не короче 8 символов'
  if (!/\d/.test(pw) || !/\p{L}/u.test(pw)) return 'Пароль должен содержать буквы и цифры'
  if (pw !== repeat) return 'Пароли не совпадают'
  return null
}

/** forced — первый вход с временным паролем: без смены пароля дальше не пускаем. */
export default function ChangePasswordPage({ forced = false }: { forced?: boolean }) {
  const { data: me } = useMe()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [repeat, setRepeat] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const m = useChangePassword()
  const logout = useLogout()
  const navigate = useNavigate()

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const local = localCheck(next, repeat)
    if (local) return setErr(local)
    setErr(null)
    m.mutate(
      { current_password: current, new_password: next },
      {
        onSuccess: () => {
          toast.ok('Пароль изменён')
          navigate('/', { replace: true })
        },
        onError: (e) => setErr(e.message),
      },
    )
  }

  const form = (
    <form onSubmit={submit} className="card w-full max-w-sm space-y-4 p-6" aria-label="Смена пароля">
      {forced && (
        <div>
          <div className="flex items-center gap-2 font-semibold"><KeyRound size={18} className="text-brand-600" />Смена временного пароля</div>
          <p className="mt-1 text-sm text-slate-500">{me?.user.full_name}, вы вошли с временным паролем. Задайте свой пароль, чтобы продолжить.</p>
        </div>
      )}
      <div>
        <label className="label" htmlFor="cur">{forced ? 'Временный пароль' : 'Текущий пароль'}</label>
        <input id="cur" type="password" className="input" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
      </div>
      <div>
        <label className="label" htmlFor="new">Новый пароль</label>
        <input id="new" type="password" className="input" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required />
        <p className="mt-1 text-xs text-slate-400">Не короче 8 символов, буквы и цифры.</p>
      </div>
      <div>
        <label className="label" htmlFor="rep">Повторите новый пароль</label>
        <input id="rep" type="password" className="input" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} required />
      </div>
      {err && <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{err}</div>}
      <button type="submit" className="btn-primary w-full" disabled={m.isPending}>{m.isPending ? 'Сохранение…' : 'Сменить пароль'}</button>
      {forced && (
        <button type="button" className="btn-ghost w-full" onClick={() => logout.mutate()}><LogOut size={16} />Выйти</button>
      )}
    </form>
  )

  if (forced) return <div className="flex min-h-full items-center justify-center p-4">{form}</div>
  return (
    <div>
      <PageHeader title="Смена пароля" subtitle="После смены пароля другие ваши сеансы будут завершены." />
      {form}
    </div>
  )
}
