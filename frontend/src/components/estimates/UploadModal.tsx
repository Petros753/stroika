import { useMemo, useRef, useState } from 'react'
import { FileSpreadsheet, FileText, FileCode2, Upload } from 'lucide-react'
import { Badge, Field, Modal } from '../ui'
import { toast } from '../Toast'
import { useStore } from '../../store'
import { useVisibleProjects } from '../../lib/hooks'
import { parseCsvText, parseTable, parseXmlText, simulateRecognition, type ParsedEstimate } from '../../domain/estimates'
import { formatMoney } from '../../lib/format'
import { TODAY } from '../../lib/date'
import { download } from '../../lib/download'
import type { Estimate } from '../../domain/types'

const TEMPLATE = '﻿Раздел;Шифр;Наименование;Ед.;Объём;Цена\r\nЗемляные работы;ФЕР01-01-013-01;Разработка грунта экскаватором;м³;1200;380\r\nФундаменты;ФЕР06-01-001-05;Монолитная плита B25;м³;260;7900\r\n'

export function UploadModal({ open, onClose, defaultProject, onCreated }: { open: boolean; onClose: () => void; defaultProject: string; onCreated: (id: string) => void }) {
  const projects = useVisibleProjects()
  const estimates = useStore((s) => s.estimates)
  const add = useStore((s) => s.addEstimate)
  const [projectId, setProjectId] = useState(defaultProject)
  const [name, setName] = useState('Смета подрядчика')
  const [file, setFile] = useState<File | null>(null)
  const [parsed, setParsed] = useState<ParsedEstimate | null>(null)
  const [source, setSource] = useState<Estimate['source']>('Excel')
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const version = useMemo(() => Math.max(0, ...estimates.filter((e) => e.projectId === projectId && e.name === name).map((e) => e.version)) + 1, [estimates, projectId, name])
  const reference = estimates.find((e) => e.projectId === projectId && e.source === 'ГРАНД-Смета')
  const total = parsed ? parsed.items.reduce((a, i) => a + i.qty * i.price, 0) : 0

  const reset = () => { setFile(null); setParsed(null); if (input.current) input.current.value = '' }
  const close = () => { reset(); onClose() }

  async function pick(f: File) {
    setFile(f)
    setBusy(true)
    const ext = f.name.split('.').pop()?.toLowerCase()
    try {
      if (ext === 'xlsx') {
        const { readSheet } = await import('read-excel-file/browser')
        setSource('Excel')
        setParsed(parseTable((await readSheet(f)) as unknown[][]))
      } else if (ext === 'csv') {
        setSource('Excel')
        setParsed(parseCsvText(await f.text()))
      } else if (ext === 'xml') {
        setSource('XML')
        setParsed(parseXmlText(await f.text()))
      } else if (ext === 'pdf') {
        setSource('PDF')
        setParsed(simulateRecognition(reference))
      } else {
        setParsed({ items: [], warnings: ['Поддерживаются файлы .xlsx, .csv, .xml и .pdf'], simulated: false })
      }
    } catch {
      setParsed({ items: [], warnings: ['Не удалось прочитать файл. Проверьте формат (для Excel нужен .xlsx)'], simulated: false })
    }
    setBusy(false)
  }

  function useSample() {
    setFile(null)
    setSource('Excel')
    setParsed({ ...simulateRecognition(reference), warnings: ['Демо-данные: сформированы по ближайшей смете объекта с небольшими отклонениями.'] })
  }

  function save() {
    if (!parsed || !parsed.items.length) return
    const id = add({
      projectId, name: name.trim() || 'Смета', version, source, date: TODAY,
      items: parsed.items.map((it, i) => ({ ...it, id: `n${Date.now().toString(36)}_${i}` })),
    })
    toast.ok(`Смета загружена: ${parsed.items.length} поз.`)
    reset()
    onCreated(id)
  }

  return (
    <Modal
      open={open} onClose={close} title="Загрузка сметы" wide
      footer={<><button className="btn-secondary" onClick={close}>Отмена</button><button className="btn-primary" disabled={!parsed?.items.length} onClick={save}>Сохранить как v{version}</button></>}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Объект">
          <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Название сметы (одинаковое название = новая версия)">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
      </div>

      <div className="mt-4 rounded-xl border border-dashed p-4 text-center">
        <div className="mb-2 flex justify-center gap-3 text-slate-400"><FileSpreadsheet /><FileCode2 /><FileText /></div>
        <p className="text-sm">Excel (.xlsx), CSV, XML (экспорт ГРАНД-Сметы) или PDF</p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          <button className="btn-primary" onClick={() => input.current?.click()}><Upload size={15} />Выбрать файл</button>
          <button className="btn-secondary" onClick={useSample}>Подставить демо-данные</button>
          <button className="btn-ghost" onClick={() => download('shablon_smety.csv', TEMPLATE, 'text/csv;charset=utf-8')}>Скачать шаблон</button>
        </div>
        <input ref={input} type="file" hidden accept=".xlsx,.csv,.xml,.pdf" onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])} />
        {file && <p className="mt-2 text-xs text-slate-500">Файл: {file.name}</p>}
      </div>

      {busy && <p className="mt-3 text-sm text-slate-500">Разбираем файл…</p>}
      {parsed && !busy && (
        <div className="mt-4 rounded-xl border p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={parsed.items.length ? 'green' : 'red'}>{parsed.items.length ? `Распознано позиций: ${parsed.items.length}` : 'Позиции не распознаны'}</Badge>
            {parsed.simulated && <Badge tone="amber">демо-распознавание</Badge>}
            {parsed.items.length > 0 && <span className="ml-auto font-semibold">Итого: {formatMoney(total)}</span>}
          </div>
          {parsed.warnings.map((w) => <p key={w} className="mt-2 text-xs text-amber-700 dark:text-amber-300">{w}</p>)}
          {parsed.items.length > 0 && (
            <ul className="mt-2 max-h-40 divide-y overflow-y-auto text-xs">
              {parsed.items.slice(0, 8).map((i, k) => <li key={k} className="flex justify-between gap-3 py-1"><span className="truncate">{i.code} · {i.name}</span><span className="whitespace-nowrap text-slate-500">{i.qty} {i.unit} × {formatMoney(i.price)}</span></li>)}
              {parsed.items.length > 8 && <li className="py-1 text-slate-500">…и ещё {parsed.items.length - 8}</li>}
            </ul>
          )}
        </div>
      )}
    </Modal>
  )
}
