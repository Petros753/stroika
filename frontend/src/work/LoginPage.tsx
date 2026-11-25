import { useState, type FormEvent } from 'react'
import { Building2, LogIn } from 'lucide-react'
import { useLogin } from './auth'

export default function LoginPage() {
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const m = useLogin()

  const submit = (e: FormEvent) => {
    e.preventDefault()
    m.mutate({ login: login.trim(), password })
  }

  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4 p-6" aria-label="Вход">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white"><Building2 size={20} /></div>
          <div>
            <div className="font-bold leading-5">СтройAI</div>
            <div className="text-xs text-slate-500">Вход в систему</div>
          </div>
        </div>
        <div>
          <label className="label" htmlFor="login">Логин</label>
          <input id="login" className="input" autoComplete="username" autoFocus value={login} onChange={(e) => setLogin(e.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor="password">Пароль</label>
          <input id="password" type="password" className="input" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        {m.isError && <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{m.error.message}</div>}
        <button type="submit" className="btn-primary w-full" disabled={m.isPending || !login || !password}>
          <LogIn size={16} /> {m.isPending ? 'Вход…' : 'Войти'}
        </button>
        <p className="text-xs text-slate-400">Учётную запись выдаёт директор. Забыли пароль — обратитесь к нему для сброса.</p>
      </form>
    </div>
  )
}
