import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, Loader2, Mail, Plus, Search } from 'lucide-react'
import { Badge, Modal } from '../ui'
import { toast } from '../Toast'
import { useCurrentUser, useStore } from '../../store'
import { useCan } from '../../lib/hooks'
import { TODAY, formatDate } from '../../lib/date'
import { SOURCE_LABEL, searchQualityDocs, supplierRequestLetter, type SearchResult } from '../../domain/certSearch'

const STEPS = ['Архив документов компании (другие объекты)', 'Реестр сертификатов и деклараций Росаккредитации', 'Сайты производителей']

/** Поиск недостающих документов о качестве по материалам объекта */
export function CertSearchModal({ projectId, materialIds, onClose }: { projectId: string; materialIds: string[]; onClose: () => void }) {
  const state = useStore()
  const user = useCurrentUser()
  const add = useStore((s) => s.addQualityDoc)
  const createOutgoing = useStore((s) => s.createOutgoing)
  const canMail = useCan('mail.draft')
  const nav = useNavigate()
  const [step, setStep] = useState(0)
  const [added, setAdded] = useState<Set<string>>(new Set())
  const [letters, setLetters] = useState<string[]>([])
  const results = useMemo<SearchResult[]>(() => materialIds.map((m) => searchQualityDocs(state, projectId, m, TODAY)), [materialIds, projectId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (step < STEPS.length) { const t = setTimeout(() => setStep((x) => x + 1), 450); return () => clearTimeout(t) } }, [step])
  const done = step >= STEPS.length
  const mat = (id: string) => state.materials.find((m) => m.id === id)
  const project = state.projects.find((p) => p.id === projectId)
  const toRequest = results.filter((r) => r.passportNeeded || (r.conformityNeeded && !r.candidates.length))
  const found = results.reduce((a, r) => a + r.candidates.length, 0)

  const request = () => {
    const director = state.users.find((u) => u.role === 'director') ?? user
    const bySupplier = new Map<string, SearchResult[]>()
    toRequest.forEach((r) => { const k = r.supplier?.name ?? '[поставщик — указать]'; bySupplier.set(k, [...(bySupplier.get(k) ?? []), r]) })
    const ids: string[] = []
    for (const [supplier, rs] of bySupplier) {
      const l = supplierRequestLetter({
        projectName: project?.name ?? '', supplier, director: director.name, author: user.name, today: TODAY,
        items: rs.map((r) => ({
          material: mat(r.materialId)?.name ?? r.materialId, unit: mat(r.materialId)?.unit ?? '', orders: r.orders,
          need: [r.conformityNeeded && !r.candidates.length ? 'сертификат или декларация о соответствии' : '', r.passportNeeded ? 'паспорт качества на каждую партию' : ''].filter(Boolean).join(', '),
        })),
      })
      ids.push(createOutgoing({ projectId, to: supplier, subject: l.subject, body: l.body }, 'Подготовлено автоматически по результатам поиска документов о качестве'))
    }
    setLetters(ids)
    toast.ok(`Подготовлено писем поставщикам: ${ids.length} — проверьте и отправьте на согласование`)
  }

  return (
    <Modal open xl onClose={onClose} title={`Поиск документов о качестве · ${project?.name ?? ''}`}
      footer={<>
        <span className="mr-auto self-center text-xs text-slate-500">{done ? `Найдено документов: ${found}. Добавленные попадают в реестр со статусом «ожидает входного контроля».` : 'Идёт поиск…'}</span>
        {letters.length > 0 && <button className="btn-secondary" onClick={() => { onClose(); nav(`/mail?letter=${letters[0]}`) }}><Mail size={15} />Открыть письмо</button>}
        <button className="btn-primary" onClick={onClose}>Готово</button>
      </>}>
      <div className="mb-3 space-y-1 text-sm">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            {i < step ? <CheckCircle2 size={15} className="text-emerald-600" /> : i === step ? <Loader2 size={15} className="animate-spin text-brand-600" /> : <Search size={15} className="text-slate-300" />}
            <span className={i <= step ? '' : 'text-slate-400'}>{s}</span>
          </div>
        ))}
      </div>
      {done && (
        <div className="space-y-3">
          {results.map((r) => (
            <div key={r.materialId} className="rounded-lg border p-3" data-search={r.materialId}>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <b>{mat(r.materialId)?.name}</b>
                {r.conformityNeeded && <Badge tone="amber">нужен сертификат / декларация</Badge>}
                {r.passportNeeded && <Badge tone="amber">нужен паспорт на партию</Badge>}
              </div>
              {r.candidates.length === 0 && r.conformityNeeded && <p className="text-xs text-slate-500">В открытых источниках не найдено — запросим у поставщика.</p>}
              <div className="space-y-1.5">
                {r.candidates.map((c) => (
                  <div key={c.key} className="flex flex-wrap items-start gap-2 rounded bg-slate-50 p-2 text-xs dark:bg-slate-800/50" data-cand={c.source}>
                    <Badge tone={c.source === 'archive' ? 'green' : 'blue'}>{SOURCE_LABEL[c.source]}</Badge>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{c.kind} № {c.number}</div>
                      <div className="text-slate-500">{c.issuer} · от {formatDate(c.issuedAt)}{c.validUntil ? ` · действует до ${formatDate(c.validUntil)}` : ''}</div>
                      <div className="text-slate-500">{c.note}</div>
                    </div>
                    {added.has(c.key) ? <span className="flex items-center gap-1 text-emerald-600"><CheckCircle2 size={13} />добавлен</span> : (
                      <button className="btn-secondary !px-2 !py-1 text-xs" onClick={() => {
                        add({ projectId, materialId: r.materialId, kind: c.kind, number: c.number, issuer: c.issuer, issuedAt: c.issuedAt, validUntil: c.validUntil, fileName: `${c.kind.split(' ')[0]}_${c.number.replace(/[^\dA-Za-zА-Яа-я]+/g, '_')}.pdf` })
                        setAdded((x) => new Set(x).add(c.key)); toast.ok('Добавлен в реестр — проверьте на входном контроле')
                      }}><Plus size={13} />В реестр</button>
                    )}
                  </div>
                ))}
              </div>
              {r.passportNeeded && <p className="mt-2 text-xs text-slate-500">Паспорт качества выдаётся на конкретную партию и публично не размещается — запрашивается у поставщика{r.supplier ? ` (${r.supplier.name})` : ''}{r.orders.length ? ` по поставкам ${r.orders.map((o) => o.number).join(', ')}` : ''}.</p>}
            </div>
          ))}
          {toRequest.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed p-3 text-sm">
              <span className="flex-1">Запросить у поставщиков недостающее ({toRequest.length} поз.): письмо сформируется в «Переписке» и пройдёт согласование.</span>
              {letters.length ? <Badge tone="green">письма подготовлены: {letters.length}</Badge> : canMail
                ? <button className="btn-primary !py-1.5 text-xs" onClick={request}><Mail size={14} />Подготовить письмо поставщику</button>
                : <span className="text-xs text-slate-500">Нет права готовить письма</span>}
            </div>
          )}
          <p className="text-xs text-slate-500">Архив компании — реальный поиск по вашим объектам. Реестр и сайты производителей в прототипе показывают демо-результаты; в рабочей версии поиск выполняет n8n на сервере (открытый реестр Росаккредитации и сайты производителей), скан документа скачивается автоматически.</p>
        </div>
      )}
    </Modal>
  )
}
