import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Bot, Check, Pencil, Send, Trash2, User as UserIcon } from 'lucide-react'
import clsx from 'clsx'
import { Badge, PageHeader } from '../components/ui'
import { toast } from '../components/Toast'
import { useCurrentUser, useStore } from '../store'
import { useCan, useVisibleProjects } from '../lib/hooks'
import { QUICK_QUESTIONS, answerQuestion } from '../domain/assistant'
import { computeAlerts } from '../domain/calc'
import type { ChatMessage } from '../domain/types'

export default function Assistant() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const user = useCurrentUser()
  const projects = useVisibleProjects()
  const chat = useStore((s) => s.chat)
  const feedback = useStore((s) => s.feedback)
  const alertsCount = useStore((s) => computeAlerts(s).length)
  const canKb = useCan('kb.manage')
  const [text, setText] = useState('')
  const [typing, setTyping] = useState(false)
  const [correcting, setCorrecting] = useState<string | null>(null)
  const [correction, setCorrection] = useState('')
  const pp = params.get('project')
  const projectId = pp && projects.some((p) => p.id === pp) ? pp : ''
  const bottom = useRef<HTMLDivElement>(null)
  const asked = useRef(false)

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [chat.length, typing])

  function ask(question: string) {
    const q = question.trim()
    if (!q) return
    const st = useStore.getState()
    st.pushChat({ role: 'user', text: q, projectId: projectId || undefined })
    setText('')
    setTyping(true)
    window.setTimeout(() => {
      const fresh = useStore.getState() // состояние на момент ответа — после любых действий пользователя
      const r = answerQuestion(fresh, user, q, projectId || undefined)
      fresh.pushChat({ role: 'assistant', ...r, projectId: projectId || undefined })
      setTyping(false)
    }, 350)
  }

  // переходы из панели и карточки объекта: ?ask=alerts | ?ask=analyze
  useEffect(() => {
    const a = params.get('ask')
    if (!a || asked.current) return
    asked.current = true
    ask(a === 'alerts' ? 'Какие предупреждения сейчас?' : 'Сделай анализ объекта')
    const n = new URLSearchParams(params); n.delete('ask'); setParams(n, { replace: true })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const questionFor = (m: ChatMessage) => {
    const i = chat.findIndex((x) => x.id === m.id)
    for (let k = i - 1; k >= 0; k--) if (chat[k].role === 'user') return chat[k].text
    return ''
  }
  const answerText = (m: ChatMessage) => m.text + (m.table ? '\n[таблица: ' + m.table.rows.length + ' строк]' : '')
  const fbOf = (m: ChatMessage) => feedback.find((f) => f.id === m.feedbackId)

  function confirm(m: ChatMessage) {
    const st = useStore.getState()
    const id = st.addFeedback({ question: questionFor(m), answer: answerText(m), verdict: 'confirmed' })
    st.setChatFeedback(m.id, id)
    toast.ok('Ответ отмечен как верный')
  }
  function saveCorrection(m: ChatMessage) {
    const st = useStore.getState()
    const id = st.addFeedback({ question: questionFor(m), answer: answerText(m), verdict: 'corrected', correction: correction.trim() })
    st.setChatFeedback(m.id, id)
    setCorrecting(null); setCorrection('')
    toast.ok(canKb ? 'Исправление добавлено в «Проверенные решения специалистов». Модель не переобучается — знание подключается к поиску.' : 'Исправление отправлено на проверку специалисту')
  }

  return (
    <div className="flex h-[calc(100vh-7.5rem)] flex-col">
      <PageHeader
        title="AI-ассистент"
        subtitle="Отвечает по данным системы по заданным правилам — демонстрационный алгоритм, не языковая модель"
        actions={
          <>
            <select className="input !w-auto" value={projectId} onChange={(e) => { const n = new URLSearchParams(params); e.target.value ? n.set('project', e.target.value) : n.delete('project'); setParams(n, { replace: true }) }} aria-label="Контекст">
              <option value="">Все доступные объекты</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <button className="btn-secondary" onClick={() => { useStore.getState().clearChat(); toast.info('Чат очищен') }}><Trash2 size={15} />Очистить</button>
          </>
        }
      />
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[1fr_280px]">
        <div className="card flex min-h-0 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {chat.map((m, idx) => {
              const f = fbOf(m)
              return (
                <div key={m.id} className={clsx('flex gap-3', m.role === 'user' && 'flex-row-reverse')}>
                  <div className={clsx('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full', m.role === 'user' ? 'bg-slate-200 dark:bg-slate-700' : 'bg-brand-600 text-white')}>{m.role === 'user' ? <UserIcon size={16} /> : <Bot size={16} />}</div>
                  <div className={clsx('max-w-[85%] rounded-2xl px-4 py-3 text-sm', m.role === 'user' ? 'bg-brand-600 text-white' : 'border bg-slate-50 dark:bg-slate-800/50')}>
                    <p className="whitespace-pre-wrap">{m.text}</p>
                    {m.table && (
                      <div className="mt-3 overflow-x-auto rounded-lg border bg-white dark:bg-slate-900">
                        <table className="w-full border-collapse text-xs">
                          <thead className="border-b"><tr>{m.table.head.map((h) => <th key={h} className="px-2 py-1.5 text-left font-semibold">{h}</th>)}</tr></thead>
                          <tbody className="divide-y">{m.table.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="px-2 py-1.5">{c}</td>)}</tr>)}</tbody>
                        </table>
                      </div>
                    )}
                    {m.link && m.link.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">{m.link.map((l) => <button key={l.to + l.label} className="btn-secondary !py-1 text-xs" onClick={() => navigate(l.to)}>{l.label}</button>)}</div>
                    )}
                    {m.role === 'assistant' && idx > 0 && (
                      <div className="mt-3 border-t pt-2">
                        {f ? (
                          <Badge tone={f.verdict === 'confirmed' ? 'green' : 'violet'}>{f.verdict === 'confirmed' ? 'Подтверждено специалистом' : 'Исправлено специалистом'}</Badge>
                        ) : correcting === m.id ? (
                          <div className="space-y-2">
                            <textarea className="input h-20 text-xs" value={correction} onChange={(e) => setCorrection(e.target.value)} placeholder="Как правильно? Например: для плит перекрытия закладываем 3% на отходы" />
                            <div className="flex gap-2">
                              <button className="btn-primary !py-1 text-xs" disabled={!correction.trim()} onClick={() => saveCorrection(m)}>Сохранить исправление</button>
                              <button className="btn-secondary !py-1 text-xs" onClick={() => setCorrecting(null)}>Отмена</button>
                            </div>
                            <p className="text-[11px] text-slate-500">{canKb ? 'Исправление попадёт в базу знаний как проверенное решение. Автоматического переобучения нет.' : 'Исправление уйдёт на проверку: в базу знаний его добавит сотрудник с правом управления базой.'}</p>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-slate-500">Ответ верный?</span>
                            <button className="btn-secondary !py-0.5 text-xs" onClick={() => confirm(m)}><Check size={13} />Верно</button>
                            <button className="btn-secondary !py-0.5 text-xs" onClick={() => { setCorrecting(m.id); setCorrection('') }}><Pencil size={13} />Исправить</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
            {typing && <div className="flex items-center gap-2 pl-11 text-xs text-slate-500">Считаю по данным системы…</div>}
            <div ref={bottom} />
          </div>
          <form className="flex gap-2 border-t p-3" onSubmit={(e) => { e.preventDefault(); ask(text) }}>
            <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Например: Какие объекты отстают от графика?" aria-label="Вопрос" />
            <button className="btn-primary" type="submit" disabled={!text.trim() || typing}><Send size={15} />Спросить</button>
          </form>
        </div>

        <div className="space-y-4 overflow-y-auto">
          <div className="card p-4">
            <div className="text-xs font-medium text-slate-500">Предупреждений сейчас</div>
            <div className="mt-1 text-2xl font-semibold">{alertsCount}</div>
            <button className="mt-2 text-xs text-brand-600 hover:underline" onClick={() => ask('Какие предупреждения сейчас?')}>Показать в чате</button>
          </div>
          <div className="card p-4">
            <h3 className="mb-2 text-sm font-semibold">Быстрые вопросы</h3>
            <div className="flex flex-col gap-1.5">
              {QUICK_QUESTIONS.map((q) => <button key={q} disabled={typing} className="rounded-lg border px-3 py-1.5 text-left text-xs transition hover:border-brand-400 hover:bg-brand-50 disabled:opacity-50 dark:hover:bg-brand-500/10" onClick={() => ask(q)}>{q}</button>)}
              {projectId && <button disabled={typing} className="rounded-lg border px-3 py-1.5 text-left text-xs transition hover:border-brand-400 hover:bg-brand-50 dark:hover:bg-brand-500/10" onClick={() => ask('Сделай анализ объекта')}>Сделай анализ объекта</button>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
