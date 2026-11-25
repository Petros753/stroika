import { useMemo, useState } from 'react'
import { BookOpen, DatabaseZap, Plus, Search, Trash2 } from 'lucide-react'
import clsx from 'clsx'
import { Badge, Field, Modal, PageHeader, Table } from '../components/ui'
import { Confirm } from '../components/Confirm'
import { toast } from '../components/Toast'
import { useStore } from '../store'
import { useCan, useUserName } from '../lib/hooks'
import type { KbCategory } from '../domain/types'
import { formatDate } from '../lib/date'

const CATEGORIES: KbCategory[] = [
  'Нормативная документация', 'Проектная документация', 'Сметные нормативы', 'Шаблоны компании',
  'Договоры', 'История завершённых объектов', 'Проверенные решения специалистов',
]
const stem = (t: string) => t.slice(0, 5)
const words = (s: string) => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 2)

export default function Knowledge() {
  const docs = useStore((s) => s.kbDocs)
  const feedback = useStore((s) => s.feedback)
  const add = useStore((s) => s.addKbDoc)
  const remove = useStore((s) => s.removeKbDoc)
  const toggle = useStore((s) => s.toggleKbIndexed)
  const canManage = useCan('kb.manage')
  const name = useUserName()
  const [cat, setCat] = useState<KbCategory | 'all'>('all')
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)
  const [newCat, setNewCat] = useState<KbCategory>(CATEGORIES[0])
  const [title, setTitle] = useState('')
  const [del, setDel] = useState<string | null>(null)

  const list = useMemo(() => {
    const byCat = docs.filter((d) => cat === 'all' || d.category === cat)
    const qs = new Set(words(q).map(stem))
    if (!qs.size) return byCat.map((d) => ({ d, s: 0 }))
    return byCat.map((d) => ({ d, s: words(d.title).filter((w) => qs.has(stem(w))).length })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s)
  }, [docs, cat, q])

  return (
    <div>
      <PageHeader
        title="База знаний"
        subtitle="Источники для RAG-поиска: документы разбиваются на фрагменты и индексируются"
        actions={canManage ? <button className="btn-primary" onClick={() => { setTitle(''); setAdding(true) }}><Plus size={15} />Добавить документ</button> : undefined}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <button onClick={() => setCat('all')} className={clsx('card p-3 text-left transition hover:border-brand-400', cat === 'all' && 'border-brand-500 ring-2 ring-brand-500/20')}>
          <div className="text-xs text-slate-500">Все категории</div><div className="text-lg font-semibold">{docs.length}</div>
        </button>
        {CATEGORIES.map((c) => {
          const n = docs.filter((d) => d.category === c)
          return (
            <button key={c} onClick={() => setCat(c)} className={clsx('card p-3 text-left transition hover:border-brand-400', cat === c && 'border-brand-500 ring-2 ring-brand-500/20')}>
              <div className="truncate text-xs text-slate-500">{c}</div>
              <div className="text-lg font-semibold">{n.length}<span className="ml-2 text-xs font-normal text-slate-400">проиндексировано {n.filter((d) => d.indexed).length}</span></div>
            </button>
          )
        })}
      </div>

      <div className="relative mb-3 max-w-md">
        <Search size={15} className="absolute left-2.5 top-2.5 text-slate-400" />
        <input className="input pl-8" placeholder="Поиск по названиям документов" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <Table>
        <thead className="border-b"><tr><th className="th">Документ</th><th className="th">Категория</th><th className="th">Автор</th><th className="th">Добавлен</th><th className="th text-right">Фрагментов</th><th className="th">Индекс</th>{canManage && <th className="th" />}</tr></thead>
        <tbody className="divide-y">
          {list.length === 0 && <tr><td className="td text-slate-500" colSpan={7}>Ничего не найдено</td></tr>}
          {list.map(({ d }) => (
            <tr key={d.id}>
              <td className="td font-medium">{d.title}</td><td className="td text-slate-500">{d.category}</td><td className="td">{d.author}</td>
              <td className="td">{formatDate(d.addedAt)}</td><td className="td text-right">{d.chunks}</td>
              <td className="td"><Badge tone={d.indexed ? 'green' : 'amber'}>{d.indexed ? 'в поиске' : 'не проиндексирован'}</Badge></td>
              {canManage && (
                <td className="td whitespace-nowrap text-right">
                  <button className="btn-secondary !py-1 text-xs" onClick={() => { toggle(d.id); toast.ok(d.indexed ? 'Документ исключён из поиска' : 'Документ проиндексирован: создано фрагментов — ' + Math.max(d.chunks, 8)) }}>{d.indexed ? 'Исключить' : 'Индексировать'}</button>
                  <button className="btn-ghost !p-1.5 text-red-600" aria-label="Удалить" onClick={() => setDel(d.id)}><Trash2 size={15} /></button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </Table>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><BookOpen size={16} />Обратная связь по ответам AI ({feedback.length})</h3>
          {feedback.length === 0 && <p className="text-sm text-slate-500">Пока нет отметок. Подтверждайте или исправляйте ответы в чате ассистента.</p>}
          <ul className="divide-y">
            {feedback.map((f) => (
              <li key={f.id} className="py-2 text-sm">
                <div className="flex items-center gap-2"><Badge tone={f.verdict === 'confirmed' ? 'green' : 'violet'}>{f.verdict === 'confirmed' ? 'Подтверждено' : 'Исправлено'}</Badge><span className="text-xs text-slate-500">{name(f.authorId)} · {formatDate(f.date)}</span></div>
                <div className="mt-1 font-medium">{f.question}</div>
                {f.correction && <div className="mt-0.5 text-slate-600 dark:text-slate-300">→ {f.correction}</div>}
              </li>
            ))}
          </ul>
        </div>
        <div className="card p-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><DatabaseZap size={16} />Как это работает в рабочей версии</h3>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-300">
            <li>Файл загружается в S3-хранилище, из него извлекается текст (PDF, DOCX, XLSX).</li>
            <li>Текст режется на фрагменты, для каждого строится эмбеддинг.</li>
            <li>Векторы хранятся в PostgreSQL 17 с расширением pgvector, права доступа — по ролям и объектам.</li>
            <li>Ответ собирается из найденных фрагментов со ссылкой на источник.</li>
            <li>Исправления специалистов проходят проверку и добавляются в «Проверенные решения». Модель не дообучается автоматически.</li>
          </ol>
          <p className="mt-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">В демо индексация имитируется: файлы не обрабатываются, поиск идёт по названиям.</p>
        </div>
      </div>

      <Modal open={adding} onClose={() => setAdding(false)} title="Добавить документ" footer={<><button className="btn-secondary" onClick={() => setAdding(false)}>Отмена</button><button className="btn-primary" disabled={!title.trim()} onClick={() => { add({ category: newCat, title: title.trim() }); setAdding(false); toast.ok('Документ добавлен. Проиндексируйте его, чтобы он участвовал в поиске') }}>Добавить</button></>}>
        <Field label="Категория"><select className="input" value={newCat} onChange={(e) => setNewCat(e.target.value as KbCategory)}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Название документа" className="mt-3"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Например: СП 70.13330 Несущие конструкции" /></Field>
        <Field label="Файл (демо: содержимое не загружается)" className="mt-3"><input type="file" className="text-sm" onChange={(e) => { const f = e.target.files?.[0]; if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, '')) }} /></Field>
      </Modal>
      <Confirm open={!!del} danger title="Удалить документ?" okLabel="Удалить" text="Документ будет удалён из базы знаний и из поиска." onCancel={() => setDel(null)} onOk={() => { if (del) remove(del); setDel(null); toast.ok('Документ удалён') }} />
    </div>
  )
}
