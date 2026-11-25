import { useEffect, useState } from 'react'
import { Camera, ImagePlus } from 'lucide-react'
import { Badge, EmptyState, Field, Modal } from '../ui'
import { toast } from '../Toast'
import { useStore } from '../../store'
import { useCan, useUserName, useVisibleProjects } from '../../lib/hooks'
import { TODAY, formatDate } from '../../lib/date'
import { putBlob } from '../../lib/blobs'
import { thumbnail } from '../../lib/photoLoader'
import { downscale } from '../../domain/photo'
import { genId } from '../../lib/format'
import type { SitePhoto } from '../../domain/types'
import { PhotoEditor } from './PhotoEditor'

function Thumb({ photo }: { photo: SitePhoto }) {
  const last = photo.versions[photo.versions.length - 1]
  const [url, setUrl] = useState<string | null>(null)
  const [err, setErr] = useState(false)
  useEffect(() => {
    let alive = true
    thumbnail(photo.src, last.ops).then((u) => alive && setUrl(u)).catch(() => alive && setErr(true))
    return () => { alive = false }
  }, [photo.src, last.ops])
  if (err) return <div className="flex aspect-[3/2] items-center justify-center bg-slate-100 p-3 text-center text-xs text-slate-500 dark:bg-slate-800">Файл хранится в другом браузере</div>
  return url ? <img src={url} alt={photo.title} className="aspect-[3/2] w-full object-cover" /> : <div className="aspect-[3/2] animate-pulse bg-slate-100 dark:bg-slate-800" />
}

export function Photos({ projectId }: { projectId: string }) {
  const projects = useVisibleProjects()
  const photos = useStore((s) => s.photos)
  const canEdit = useCan('pto.create')
  const name = useUserName()
  const [openId, setOpenId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const ids = new Set(projects.filter((p) => projectId === 'all' || p.id === projectId).map((p) => p.id))
  const list = photos.filter((p) => ids.has(p.projectId)).sort((a, b) => b.takenAt.localeCompare(a.takenAt))
  const pname = (id: string) => projects.find((p) => p.id === id)?.name ?? ''

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <p className="text-sm text-slate-500">Фотофиксация хода работ. Редактор делает только технические правки: кадр, поворот, пометки, штамп, размытие номеров и лиц. Оригинал сохраняется, каждая правка записывается в журнал версии.</p>
        {canEdit && <button className="btn-primary ml-auto" onClick={() => setUploading(true)}><ImagePlus size={15} />Загрузить фото</button>}
      </div>
      {list.length === 0 ? <EmptyState title="Фото пока нет" hint="Загрузите снимки с объекта — с телефона или компьютера." /> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {list.map((p) => (
            <button key={p.id} data-photo={p.id} onClick={() => setOpenId(p.id)} className="card overflow-hidden text-left transition hover:border-brand-400 hover:shadow-md">
              <Thumb photo={p} />
              <div className="p-3">
                <div className="text-sm font-medium">{p.title}</div>
                <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                  <span>{projectId === 'all' ? pname(p.projectId) + ' · ' : ''}{formatDate(p.takenAt)} · {name(p.authorId)}</span>
                  {p.versions.length > 1 && <Badge tone="blue">v{p.versions.length}</Badge>}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
      {openId && <PhotoEditor id={openId} onClose={() => setOpenId(null)} />}
      {uploading && <UploadModal defaultProject={projectId === 'all' ? [...ids][0] : projectId} onClose={() => setUploading(false)} onDone={(id) => { setUploading(false); setOpenId(id) }} />}
    </div>
  )
}

function UploadModal({ defaultProject, onClose, onDone }: { defaultProject: string; onClose: () => void; onDone: (id: string) => void }) {
  const projects = useVisibleProjects()
  const stages = useStore((s) => s.stages)
  const add = useStore((s) => s.addPhoto)
  const [projectId, setProjectId] = useState(defaultProject)
  const [stageId, setStageId] = useState('')
  const [title, setTitle] = useState('')
  const [takenAt, setTakenAt] = useState(TODAY)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  return (
    <Modal open onClose={onClose} title="Загрузить фото с объекта"
      footer={<><button className="btn-secondary" onClick={onClose}>Отмена</button>
        <button className="btn-primary" disabled={!file || busy} onClick={async () => {
          setBusy(true)
          try {
            const key = genId('img')
            await putBlob(key, await downscale(file!))
            const id = add({ projectId, stageId: stageId || undefined, title: title.trim() || file!.name.replace(/\.[^.]+$/, ''), takenAt, src: `idb:${key}` })
            toast.ok('Фото загружено')
            onDone(id)
          } catch { toast.error('Не удалось прочитать изображение') } finally { setBusy(false) }
        }}><Camera size={15} />{busy ? 'Загрузка…' : 'Загрузить'}</button></>}>
      <div className="space-y-3">
        <input type="file" accept="image/*" aria-label="Файл фото" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <Field label="Объект"><select className="input" value={projectId} onChange={(e) => { setProjectId(e.target.value); setStageId('') }}>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <Field label="Этап (по желанию)"><select className="input" value={stageId} onChange={(e) => setStageId(e.target.value)}><option value="">—</option>{stages.filter((s) => s.projectId === projectId).map((s) => <option key={s.id} value={s.id}>{s.section} · {s.name}</option>)}</select></Field>
        <Field label="Подпись"><input className="input" value={title} placeholder="Что на снимке" onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label="Дата съёмки"><input type="date" className="input" value={takenAt} onChange={(e) => setTakenAt(e.target.value)} /></Field>
        <p className="text-xs text-slate-500">В демо файл хранится в этом браузере (IndexedDB), уменьшенный до 2000 px. В рабочей версии — в облачном хранилище S3 с исходным файлом и EXIF.</p>
      </div>
    </Modal>
  )
}
