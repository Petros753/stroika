import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Download, Inbox, MailPlus, Paperclip, Printer, Send, Sparkles, Undo2 } from 'lucide-react'
import clsx from 'clsx'
import { Badge, EmptyState, Field, Modal, PageHeader } from '../components/ui'
import { Confirm } from '../components/Confirm'
import { toast } from '../components/Toast'
import { useCurrentUser, useStore } from '../store'
import { useCan, useUserName, useVisibleProjects } from '../lib/hooks'
import { TODAY, formatDate } from '../lib/date'
import { download, printHtml } from '../lib/download'
import {
  CATEGORY_LABEL, CATEGORY_TONE, IN_STATUS_LABEL, OUT_STATUS_LABEL, classify, draftReply, extractRefs, letterHtml, placeholders, replyStatus,
} from '../domain/mail'
import type { Letter, LetterCategory } from '../domain/types'

type Filter = 'all' | 'new' | 'todo' | 'review' | 'done' | 'out'
const CAT_LINKS: Record<LetterCategory, { to: string; label: string }[]> = {
  schedule: [{ to: '/projects?view=list', label: 'Графики объектов' }],
  payment: [{ to: '/execution', label: 'Выполнение КС-2/КС-3' }],
  quality: [{ to: '/pto?tab=quality', label: 'Сертификаты и паспорта' }, { to: '/pto?tab=photos', label: 'Фотофиксация' }],
  change: [{ to: '/estimates', label: 'Корректировка сметы' }, { to: '/cad?mode=dxf', label: 'Чертежи DXF' }],
  claim: [{ to: '/costing', label: 'Себестоимость и риски' }],
  info: [],
}
const INCOMING: { label: string; projectId: string; from: string; subject: string; body: string; senderRef: string; attachments: string[] }[] = [
  { label: 'Технадзор: запрос АОСР', projectId: 'p1', from: 'ООО «СтройКонтроль-М» (технический надзор)', senderRef: 'исх. № 207 от 14.11.2026', subject: 'Запрос исполнительной документации на армирование плиты, корпус 2', body: 'Просим в течение 3 рабочих дней представить АОСР на армирование плиты перекрытия корпуса 2 с приложением паспортов качества на арматуру и исполнительной схемы.', attachments: [] },
  { label: 'Заказчик: допработы', projectId: 'p2', from: 'Управление капитального строительства г. Казани', senderRef: 'исх. № 01-14/3450 от 14.11.2026', subject: 'О дополнительных работах по устройству пандуса', body: 'В связи с изменением требований к доступности просим рассмотреть выполнение дополнительных работ по устройству пандуса у входа спортивного блока и направить расчёт стоимости в срок до 25.11.2026.', attachments: ['Эскиз_пандуса.pdf'] },
  { label: 'Заказчик: оплата', projectId: 'p4', from: 'АО «Атриум Девелопмент»', senderRef: 'исх. № АД-355 от 14.11.2026', subject: 'О сроках представления КС-2 за ноябрь', body: 'Просим сообщить ожидаемые сроки представления КС-2 и КС-3 за ноябрь 2026 года и сумму к оплате для планирования финансирования не позднее 19.11.2026.', attachments: [] },
]

export default function MailPage() {
  const [params, setParams] = useSearchParams()
  const projects = useVisibleProjects()
  const letters = useStore((s) => s.letters)
  const canDraft = useCan('mail.draft')
  const canSend = useCan('mail.send')
  const markRead = useStore((s) => s.markLetterRead)
  const receive = useStore((s) => s.receiveLetter)
  const [filter, setFilter] = useState<Filter>('all')
  const [projectId, setProjectId] = useState('all')
  const [simulate, setSimulate] = useState(false)
  const ids = new Set(projects.map((p) => p.id))
  const inbox = letters.filter((l) => l.direction === 'in' && ids.has(l.projectId) && (projectId === 'all' || l.projectId === projectId))
  const replyOf = (l: Letter) => letters.filter((x) => x.inReplyTo === l.id)
  const matches = (l: Letter) => {
    const out = replyOf(l)
    if (filter === 'new') return l.status === 'new'
    if (filter === 'todo') return l.status === 'new' || l.status === 'read'
    if (filter === 'review') return out.some((x) => x.status === 'review' || x.status === 'approved')
    if (filter === 'done') return l.status === 'replied' || l.status === 'noreply'
    return true
  }
  const outbox = letters.filter((l) => l.direction === 'out' && !l.inReplyTo && ids.has(l.projectId) && (projectId === 'all' || l.projectId === projectId)).sort((a, b) => b.date.localeCompare(a.date))
  const list = (filter === 'out' ? outbox : inbox.filter(matches)).sort((a, b) => {
    if (filter === 'out') return b.date.localeCompare(a.date)
    const w = (l: Letter) => ({ overdue: 0, soon: 1, ok: 2, none: 3 })[replyStatus(l, TODAY)]
    return w(a) - w(b) || b.date.localeCompare(a.date)
  })
  const selId = params.get('letter')
  const sel = letters.find((l) => l.id === selId && ids.has(l.projectId))
  const open = (id: string) => { const n = new URLSearchParams(params); n.set('letter', id); setParams(n, { replace: true }) }
  useEffect(() => { if (sel && sel.status === 'new') markRead(sel.id) }, [sel?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const counts = {
    new: inbox.filter((l) => l.status === 'new').length,
    todo: inbox.filter((l) => l.status === 'new' || l.status === 'read').length,
    review: inbox.filter((l) => replyOf(l).some((x) => x.status === 'review' || x.status === 'approved')).length,
    overdue: inbox.filter((l) => replyStatus(l, TODAY) === 'overdue').length,
  }

  return (
    <div>
      <PageHeader
        title="Переписка"
        subtitle="Входящие письма заказчиков и надзоров, сроки ответа, черновики ответов по данным системы, согласование и отправка"
        actions={<>
          <select className="input !w-auto" aria-label="Объект" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="all">Все объекты</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {canSend && <button className="btn-secondary" onClick={() => setSimulate(true)}><MailPlus size={15} />Имитировать входящее</button>}
        </>}
      />
      <div className="mb-3 flex flex-wrap gap-1">
        {([['all', 'Все'], ['new', `Новые (${counts.new})`], ['todo', `Нужен ответ (${counts.todo})`], ['review', `На согласовании (${counts.review})`], ['done', 'Закрытые'], ['out', `Исходящие (${outbox.length})`]] as [Filter, string][]).map(([k, l]) => (
          <button key={k} className={k === filter ? 'btn-primary !py-1 text-xs' : 'btn-secondary !py-1 text-xs'} onClick={() => setFilter(k)}>{l}</button>
        ))}
        {counts.overdue > 0 && <Badge tone="red" className="ml-2 self-center">просрочено ответов: {counts.overdue}</Badge>}
      </div>

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <div className="space-y-2">
          {list.length === 0 && <EmptyState title="Писем нет" />}
          {list.map((l) => {
            const rs = replyStatus(l, TODAY), out = replyOf(l), cat = classify(l)
            return (
              <button key={l.id} data-letter={l.id} onClick={() => open(l.id)}
                className={clsx('card block w-full p-3 text-left transition hover:border-brand-400', sel?.id === l.id && 'border-brand-500 ring-1 ring-brand-500')}>
                <div className="flex items-start justify-between gap-2">
                  <div className={clsx('text-sm', l.status === 'new' ? 'font-semibold' : 'font-medium')}>{l.subject}</div>
                  {l.status === 'new' && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand-600" />}
                </div>
                <div className="mt-0.5 truncate text-xs text-slate-500">{l.direction === 'out' ? `Кому: ${l.to}` : l.from}</div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1 text-xs">
                  <Badge tone={CATEGORY_TONE[cat]}>{CATEGORY_LABEL[cat]}</Badge>
                  {rs === 'overdue' && <Badge tone="red">срок истёк {formatDate(l.replyBy!)}</Badge>}
                  {rs === 'soon' && <Badge tone="amber">ответ до {formatDate(l.replyBy!)}</Badge>}
                  {rs === 'ok' && <span className="text-slate-500">ответ до {formatDate(l.replyBy!)}</span>}
                  {l.direction === 'out' && <Badge tone={l.status === 'sent' ? 'green' : 'blue'}>{OUT_STATUS_LABEL[l.status as keyof typeof OUT_STATUS_LABEL]}{l.status === 'sent' ? ` · исх. № ${l.number}` : ''}</Badge>}
                  {out.length > 0 && <Badge tone={out[out.length - 1].status === 'sent' ? 'green' : 'blue'}>{OUT_STATUS_LABEL[out[out.length - 1].status as keyof typeof OUT_STATUS_LABEL]}</Badge>}
                  {(l.status === 'replied' || l.status === 'noreply') && !out.length && <Badge tone="slate">{IN_STATUS_LABEL[l.status]}</Badge>}
                  <span className="ml-auto text-slate-400">{formatDate(l.date)}</span>
                </div>
              </button>
            )
          })}
          <div className="rounded-lg border border-dashed p-3 text-xs text-slate-500">
            <b>Рабочая версия:</b> n8n забирает почту (IMAP), регистрирует письмо, LLM определяет тему, сроки и объект, готовит черновик по данным СтройAI и базе знаний. Человек правит и согласует — только после этого n8n отправляет письмо (SMTP) и регистрирует исходящий номер.
          </div>
        </div>
        {sel && sel.direction === 'out' && !sel.inReplyTo ? <OutView key={sel.id} letter={sel} canDraft={canDraft} canSend={canSend} /> : sel && sel.direction === 'in' ? <LetterView key={sel.id} letter={sel} canDraft={canDraft} canSend={canSend} /> : <EmptyState title="Выберите письмо" hint={counts.todo ? `Ждут ответа: ${counts.todo}. Сначала — с истекающим сроком (вверху списка).` : undefined} />}
      </div>

      <Modal open={simulate} onClose={() => setSimulate(false)} title="Имитировать входящее письмо (демо)">
        <p className="mb-3 text-sm text-slate-500">Показывает, как новое письмо регистрируется, появляется в уведомлениях и в списке с извлечённым сроком ответа.</p>
        <div className="space-y-2">
          {INCOMING.filter((t) => ids.has(t.projectId)).map((t) => (
            <button key={t.label} className="btn-secondary w-full justify-start" onClick={() => {
              const id = receive({ projectId: t.projectId, from: t.from, subject: t.subject, body: t.body, senderRef: t.senderRef, attachments: t.attachments })
              setSimulate(false); setFilter('all'); open(id); toast.info(`Новое письмо: ${t.subject}`)
            }}><Inbox size={15} />{t.label}</button>
          ))}
        </div>
      </Modal>
    </div>
  )
}

function LetterView({ letter, canDraft, canSend }: { letter: Letter; canDraft: boolean; canSend: boolean }) {
  const state = useStore()
  const user = useCurrentUser()
  const name = useUserName()
  const createReply = useStore((s) => s.createReply)
  const setNoReply = useStore((s) => s.setLetterNoReply)
  const project = state.projects.find((p) => p.id === letter.projectId)
  const director = state.users.find((u) => u.role === 'director') ?? user
  const cat = classify(letter)
  const refs = extractRefs(letter.body + ' ' + letter.subject)
  const analysis = useMemo(() => draftReply(state, letter, user, director, TODAY), [state, letter, user, director])
  const replies = state.letters.filter((x) => x.inReplyTo === letter.id)
  const rs = replyStatus(letter, TODAY)

  return (
    <div className="space-y-3">
      <div className="card p-4">
        <div className="flex flex-wrap items-start gap-2">
          <h2 className="flex-1 text-base font-semibold">{letter.subject}</h2>
          <Badge tone={CATEGORY_TONE[cat]}>{CATEGORY_LABEL[cat]}</Badge>
        </div>
        <div className="mt-1 text-xs text-slate-500">
          От: <b>{letter.from}</b>{letter.senderRef && ` · ${letter.senderRef}`} · вх. № {letter.number} от {formatDate(letter.date)} · {project?.name}
        </div>
        {letter.attachments.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{letter.attachments.map((a) => <span key={a} className="flex items-center gap-1 rounded border px-2 py-0.5 text-xs"><Paperclip size={12} />{a}</span>)}</div>}
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed" data-testid="letter-body">{letter.body}</p>
      </div>

      <div className="card border-brand-200 bg-brand-50/40 p-4 dark:border-brand-500/30 dark:bg-brand-500/5">
        <div className="mb-2 flex items-center gap-2 font-semibold"><Sparkles size={16} className="text-brand-600" />Разбор письма</div>
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <div><span className="text-slate-500">Тема: </span>{CATEGORY_LABEL[cat]}</div>
          <div data-testid="reply-by"><span className="text-slate-500">Срок ответа: </span>{letter.replyBy ? <b className={rs === 'overdue' ? 'text-red-600' : rs === 'soon' ? 'text-amber-600' : ''}>{formatDate(letter.replyBy)}{rs === 'overdue' && ' — просрочен'}</b> : 'не указан'}</div>
          {refs.length > 0 && <div className="sm:col-span-2"><span className="text-slate-500">Упомянуты: </span>{refs.join(', ')}</div>}
        </div>
        {analysis.facts.length > 0 && (
          <div className="mt-2 text-sm"><span className="text-slate-500">Данные из системы для ответа:</span>
            <ul className="mt-1 list-disc pl-5 text-xs">{analysis.facts.map((f) => <li key={f}>{f}</li>)}</ul>
          </div>
        )}
        {analysis.warnings.map((w) => <p key={w} className="mt-2 flex gap-2 text-xs text-red-700 dark:text-red-300"><AlertTriangle size={14} className="shrink-0" />{w}</p>)}
        <div className="mt-3 flex flex-wrap gap-2">
          {CAT_LINKS[cat].map((l) => <a key={l.to} href={'#' + l.to} className="text-xs text-brand-600 hover:underline">{l.label} →</a>)}
          <span className="ml-auto flex gap-2">
            {canDraft && letter.status !== 'replied' && !replies.some((r) => r.status !== 'sent') && letter.status !== 'noreply' && (
              <button className="btn-primary !py-1 text-xs" onClick={() => {
                createReply(letter.id, analysis.subject, analysis.body, letter.from)
                toast.ok('Черновик ответа подготовлен по данным системы — проверьте и заполните поля в [скобках]')
              }}><Sparkles size={14} />Подготовить ответ</button>
            )}
            {canDraft && letter.status !== 'replied' && !replies.length && (
              <button className="btn-secondary !py-1 text-xs" onClick={() => setNoReply(letter.id, letter.status !== 'noreply')}>{letter.status === 'noreply' ? 'Вернуть в работу' : 'Ответ не требуется'}</button>
            )}
          </span>
        </div>
      </div>

      {replies.map((r) => <Reply key={r.id} letter={r} canDraft={canDraft} canSend={canSend} />)}

      <details className="card p-3 text-xs">
        <summary className="cursor-pointer font-medium">Журнал по письму</summary>
        <ul className="mt-2 space-y-1">
          {[...letter.log, ...replies.flatMap((r) => r.log)].sort((a, b) => a.date.localeCompare(b.date)).map((x, i) => <li key={i}><span className="text-slate-500">{formatDate(x.date)} · {name(x.userId)}:</span> {x.text}</li>)}
        </ul>
      </details>
    </div>
  )
}

function OutView({ letter, canDraft, canSend }: { letter: Letter; canDraft: boolean; canSend: boolean }) {
  const project = useStore((s) => s.projects.find((p) => p.id === letter.projectId))
  const name = useUserName()
  return (
    <div className="space-y-3">
      <div className="card p-4">
        <div className="text-xs text-slate-500">Исходящее письмо · {project?.name} · кому: <b>{letter.to}</b></div>
        <h2 className="mt-1 text-base font-semibold">{letter.subject}</h2>
      </div>
      <Reply letter={letter} canDraft={canDraft} canSend={canSend} />
      <details className="card p-3 text-xs">
        <summary className="cursor-pointer font-medium">Журнал по письму</summary>
        <ul className="mt-2 space-y-1">{letter.log.map((x, i) => <li key={i}><span className="text-slate-500">{formatDate(x.date)} · {name(x.userId)}:</span> {x.text}</li>)}</ul>
      </details>
    </div>
  )
}

function Reply({ letter, canDraft, canSend }: { letter: Letter; canDraft: boolean; canSend: boolean }) {
  const update = useStore((s) => s.updateOutLetter)
  const submit = useStore((s) => s.submitLetter)
  const approve = useStore((s) => s.approveLetter)
  const back = useStore((s) => s.returnLetter)
  const send = useStore((s) => s.sendLetter)
  const name = useUserName()
  const [subject, setSubject] = useState(letter.subject)
  const [body, setBody] = useState(letter.body)
  const [returning, setReturning] = useState(false)
  const [reason, setReason] = useState('')
  const [confirmSend, setConfirmSend] = useState(false)
  useEffect(() => { setSubject(letter.subject); setBody(letter.body) }, [letter.subject, letter.body])
  const editable = canDraft && letter.status === 'draft'
  const dirty = subject !== letter.subject || body !== letter.body
  const ph = placeholders(body)
  const save = () => { update(letter.id, { subject, body }); toast.ok('Черновик сохранён') }
  const tone = { draft: 'amber', review: 'blue', approved: 'violet', sent: 'green' } as const

  return (
    <div className="card p-4" data-reply={letter.status}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="font-semibold">{letter.inReplyTo ? 'Ответ' : 'Письмо'}</span>
        <Badge tone={tone[letter.status as keyof typeof tone]}>{OUT_STATUS_LABEL[letter.status as keyof typeof OUT_STATUS_LABEL]}</Badge>
        {letter.status === 'sent' && <span className="text-xs text-slate-500">исх. № {letter.number} от {formatDate(letter.date)}</span>}
        <span className="ml-auto text-xs text-slate-500">Кому: {letter.to} · исп. {name(letter.authorId)}{letter.approvedBy && ` · согласовал ${name(letter.approvedBy)}`}</span>
      </div>
      {editable ? (
        <>
          <Field label="Тема"><input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>
          <Field label="Текст письма" className="mt-2"><textarea className="input h-72 text-sm leading-relaxed" aria-label="Текст ответа" value={body} onChange={(e) => setBody(e.target.value)} /></Field>
        </>
      ) : (
        <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 font-sans text-sm leading-relaxed dark:bg-slate-800/50">{letter.body}</pre>
      )}
      {letter.status !== 'sent' && ph.length > 0 && (
        <div className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300" data-testid="placeholders">
          Заполните поля перед согласованием ({ph.length}): {ph.map((p) => `[${p}]`).join(', ')}
        </div>
      )}
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <button className="btn-secondary mr-auto !py-1 text-xs" onClick={() => { download(`pismo_${letter.number.replace('/', '-')}.doc`, letterHtml({ ...letter, subject, body }), 'application/msword;charset=utf-8'); toast.ok('Письмо выгружено в Word') }}><Download size={14} />Word</button>
        <button className="btn-secondary !py-1 text-xs" onClick={() => { printHtml(letterHtml({ ...letter, subject, body })); toast.info('В окне печати выберите «Сохранить как PDF»') }}><Printer size={14} />PDF</button>
        {editable && <button className="btn-secondary !py-1 text-xs" disabled={!dirty} onClick={save}>Сохранить</button>}
        {editable && (
          <button className="btn-primary !py-1 text-xs" disabled={ph.length > 0} title={ph.length ? 'Сначала заполните поля в [скобках]' : undefined}
            onClick={() => { if (dirty) update(letter.id, { subject, body }); submit(letter.id); toast.ok('Ответ отправлен на согласование') }}>На согласование</button>
        )}
        {canSend && letter.status === 'review' && (
          <>
            <button className="btn-secondary !py-1 text-xs text-red-600" onClick={() => setReturning(true)}><Undo2 size={14} />Вернуть</button>
            <button className="btn-primary !py-1 text-xs" onClick={() => { approve(letter.id); toast.ok('Ответ согласован') }}><CheckCircle2 size={14} />Согласовать</button>
          </>
        )}
        {canSend && letter.status === 'approved' && <button className="btn-primary !py-1 text-xs" onClick={() => setConfirmSend(true)}><Send size={14} />Отправить</button>}
      </div>
      <Modal open={returning} onClose={() => setReturning(false)} title="Вернуть ответ на доработку"
        footer={<><button className="btn-secondary" onClick={() => setReturning(false)}>Отмена</button><button className="btn-primary" disabled={!reason.trim()} onClick={() => { back(letter.id, reason.trim()); setReturning(false); setReason(''); toast.ok('Возвращено исполнителю') }}>Вернуть</button></>}>
        <Field label="Что исправить"><input className="input" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Например: указать конкретную дату выхода на график" /></Field>
      </Modal>
      <Confirm open={confirmSend} title="Отправить письмо?" okLabel="Отправить" onCancel={() => setConfirmSend(false)}
        text={`Письмо получит исходящий номер и уйдёт адресату: ${letter.to}. В демо письмо не отправляется наружу — только регистрируется.`}
        onOk={() => { send(letter.id); setConfirmSend(false); toast.ok('Письмо отправлено и зарегистрировано') }} />
    </div>
  )
}
