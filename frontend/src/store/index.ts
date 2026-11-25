import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { createSeed, type DataState } from '../data/seed'
import type {
  AiFeedback, CadElement, CadHistoryItem, ChatMessage, Estimate, EstimateItem, ExecutionReport, CostInput, IncomingCheck, PhotoOp, CadFile, CadFileVersion, Letter, QualityDoc, SitePhoto, ExecDoc, ExecDocKind, ExecDocStatus, KbCategory,
  KbDoc, Notification, Priority, Project, ProjectDoc, PurchaseOrder, PurchaseRequest, RequestItem, Stage, Task, User,
} from '../domain/types'
import { can } from '../domain/permissions'
import { projectMetrics } from '../domain/calc'
import { qualityLine, renderExecDocBody } from '../domain/execdocs'
import { extractDeadline, nextOutNumber } from '../domain/mail'
import { genId } from '../lib/format'
import { TODAY, addDays } from '../lib/date'

export type Theme = 'light' | 'dark'

interface UiState {
  currentUserId: string
  theme: Theme
}

interface Actions {
  setCurrentUser: (id: string) => void
  setTheme: (t: Theme) => void
  resetDemo: () => void

  setUserProjects: (userId: string, projectIds: string[]) => void
  setUserRole: (userId: string, role: User['role']) => void
  addProject: (p: Omit<Project, 'id'>) => string
  updateProject: (id: string, patch: Partial<Project>) => void
  addStage: (s: Omit<Stage, 'id'>) => string
  updateStage: (id: string, patch: Partial<Stage>) => void
  removeStage: (id: string) => void
  addTask: (t: Omit<Task, 'id'>) => string
  updateTask: (id: string, patch: Partial<Task>) => void
  removeTask: (id: string) => void

  createRequest: (data: {
    projectId: string; items: RequestItem[]; priority: Priority; neededBy: string; comment?: string; submit: boolean
  }) => string
  submitRequest: (id: string) => void
  approveRequest: (id: string) => void
  rejectRequest: (id: string, reason: string) => void
  deleteRequest: (id: string) => void
  chooseSupplier: (requestId: string, supplierId: string) => string | null
  advanceOrder: (orderId: string) => void
  receiveOrder: (orderId: string) => void

  receiveStock: (a: { warehouseId: string; materialId: string; qty: number; note: string }) => void
  issueStock: (a: { warehouseId: string; materialId: string; qty: number; note: string }) => string | null
  transferStock: (a: { fromId: string; toId: string; materialId: string; qty: number; note: string }) => string | null
  setMinQty: (warehouseId: string, materialId: string, minQty: number) => void

  toggleDocSigned: (id: string) => void
  addDocument: (d: Omit<ProjectDoc, 'id'>) => void

  addEstimate: (e: Omit<Estimate, 'id'>) => string
  removeEstimate: (id: string) => void
  saveEstimateCorrection: (baseId: string, items: EstimateItem[], note: string) => string

  createExecutionReport: (a: { projectId: string; estimateId: string; dateFrom: string; dateTo: string }) => string
  setExecutionQty: (reportId: string, itemId: string, qty: number) => void
  fillExecutionQty: (reportId: string, qty: Record<string, number>) => void
  signExecutionReport: (reportId: string) => void
  deleteExecutionReport: (reportId: string) => void

  saveCostCalc: (input: CostInput, id?: string) => string
  addQualityDoc: (d: Omit<QualityDoc, 'id' | 'createdAt' | 'authorId' | 'check' | 'checkedBy'>) => string
  setQualityCheck: (id: string, check: IncomingCheck, note?: string) => void
  removeQualityDoc: (id: string) => void
  addPhoto: (p: Omit<SitePhoto, 'id' | 'authorId' | 'versions'>) => string
  savePhotoVersion: (id: string, ops: PhotoOp[], edits: string[]) => number
  removePhoto: (id: string) => void
  addCadFile: (f: { projectId: string; name: string; format: CadFile['format']; key: string; size: number }) => string
  addCadFileVersion: (id: string, v: Pick<CadFileVersion, 'key' | 'note' | 'edits' | 'size'>) => number
  removeCadFile: (id: string) => void

  markLetterRead: (id: string) => void
  setLetterNoReply: (id: string, noReply: boolean) => void
  createReply: (inId: string, subject: string, body: string, to: string) => string
  updateOutLetter: (id: string, patch: Pick<Letter, 'subject' | 'body'>) => void
  submitLetter: (id: string) => void
  approveLetter: (id: string) => void
  returnLetter: (id: string, reason: string) => void
  sendLetter: (id: string) => void
  createOutgoing: (l: Pick<Letter, 'projectId' | 'to' | 'subject' | 'body'>, note: string) => string
  receiveLetter: (l: Pick<Letter, 'projectId' | 'from' | 'subject' | 'body' | 'senderRef' | 'attachments'>) => string
  removeCostCalc: (id: string) => void

  createExecDoc: (a: {
    projectId: string; stageId?: string; requirementId?: string; kind: ExecDocKind; title: string; works: string[]; note?: string; qualityDocIds?: string[]
  }) => string
  setExecStatus: (id: string, status: ExecDocStatus, note?: string) => void
  addExecVersion: (id: string, body: string, note: string) => void

  addKbDoc: (d: { category: KbCategory; title: string }) => void
  removeKbDoc: (id: string) => void
  toggleKbIndexed: (id: string) => void
  addFeedback: (f: Omit<AiFeedback, 'id' | 'date' | 'authorId'>) => string

  pushChat: (m: Omit<ChatMessage, 'id' | 'date'>) => string
  clearChat: () => void
  setChatFeedback: (messageId: string, feedbackId: string) => void

  markNotificationRead: (id: string) => void
  markAllNotificationsRead: () => void
  pushNotification: (n: Omit<Notification, 'id' | 'date' | 'read'>) => void

  addCadElements: (els: CadElement[], item: Omit<CadHistoryItem, 'id' | 'date' | 'userId' | 'addedIds'>) => void
  undoCad: (historyId: string) => void
}

export type Store = DataState & UiState & Actions

const pad = (n: number) => String(n).padStart(4, '0')

function withProgressSync(s: DataState, projectId: string): DataState['projects'] {
  return s.projects.map((p) => {
    if (p.id !== projectId) return p
    const m = projectMetrics(p, s.stages)
    return m.stagesCount > 0 ? { ...p, progress: Math.round(m.progress) } : p
  })
}

function log(s: DataState, userId: string, text: string, projectId?: string): DataState['activity'] {
  return [{ id: genId('a'), date: TODAY, userId, text, projectId }, ...s.activity].slice(0, 100)
}

function notify(s: DataState, n: Omit<Notification, 'id' | 'date' | 'read'>): DataState['notifications'] {
  return [{ id: genId('n'), date: TODAY, read: false, ...n }, ...s.notifications].slice(0, 60)
}

function addToStock(stock: DataState['stock'], warehouseId: string, materialId: string, delta: number) {
  const exists = stock.some((x) => x.warehouseId === warehouseId && x.materialId === materialId)
  if (!exists) return [...stock, { warehouseId, materialId, qty: Math.max(0, delta), minQty: 0 }]
  return stock.map((x) =>
    x.warehouseId === warehouseId && x.materialId === materialId ? { ...x, qty: Math.max(0, x.qty + delta) } : x,
  )
}

const DATA_KEYS: (keyof DataState)[] = [
  'users', 'projects', 'stages', 'tasks', 'materials', 'warehouses', 'stock', 'movements', 'suppliers', 'requests',
  'orders', 'estimates', 'documents', 'execDocs', 'requirements', 'kbDocs', 'feedback', 'notifications', 'chat',
  'activity', 'cadAdded', 'cadHistory', 'executionReports', 'costCalcs', 'qualityDocs', 'photos', 'cadFiles', 'letters',
]

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      ...createSeed(),
      currentUserId: 'u_dir',
      theme: 'light',

      setCurrentUser: (id) => set({ currentUserId: id }),
      setTheme: (theme) => set({ theme }),
      resetDemo: () => set({ ...createSeed() }),

      setUserProjects: (userId, projectIds) =>
        set((s) => ({
          users: s.users.map((u) => (u.id === userId ? { ...u, projectIds } : u)),
          activity: log(s, s.currentUserId, `Изменено назначение объектов: ${s.users.find((u) => u.id === userId)?.name ?? ''}`),
        })),
      setUserRole: (userId, role) =>
        set((s) => ({
          users: s.users.map((u) => (u.id === userId ? { ...u, role } : u)),
          activity: log(s, s.currentUserId, `Изменена роль: ${s.users.find((u) => u.id === userId)?.name ?? ''}`),
        })),

      // ---- Проекты ----
      addProject: (p) => {
        const id = genId('p')
        set((s) => ({
          users: s.users.map((u) => (u.id === p.managerId && !u.projectIds.includes(id) ? { ...u, projectIds: [...u.projectIds, id] } : u)),
          projects: [...s.projects, { ...p, id }],
          warehouses: [...s.warehouses, { id: `w_${id}`, name: `Склад объекта: ${p.name}`, projectId: id }],
          activity: log(s, s.currentUserId, `Создан объект «${p.name}»`, id),
        }))
        return id
      },
      updateProject: (id, patch) =>
        set((s) => ({
          users: patch.managerId
            ? s.users.map((u) => (u.id === patch.managerId && !u.projectIds.includes(id) ? { ...u, projectIds: [...u.projectIds, id] } : u))
            : s.users,
          projects: s.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)),
          activity: log(s, s.currentUserId, `Изменён объект «${s.projects.find((p) => p.id === id)?.name ?? ''}»`, id),
        })),

      addStage: (st) => {
        const id = genId('st')
        set((s) => {
          const next = { ...s, stages: [...s.stages, { ...st, id }] }
          return {
            stages: next.stages,
            projects: withProgressSync(next, st.projectId),
            activity: log(s, s.currentUserId, `Добавлен этап «${st.name}»`, st.projectId),
          }
        })
        return id
      },
      updateStage: (id, patch) =>
        set((s) => {
          const stages = s.stages.map((x) => (x.id === id ? { ...x, ...patch } : x))
          const st = stages.find((x) => x.id === id)
          if (!st) return {}
          return {
            stages,
            projects: withProgressSync({ ...s, stages }, st.projectId),
            activity: log(s, s.currentUserId, `Обновлён этап «${st.name}»`, st.projectId),
          }
        }),
      removeStage: (id) =>
        set((s) => {
          const st = s.stages.find((x) => x.id === id)
          if (!st) return {}
          const stages = s.stages.filter((x) => x.id !== id)
          return {
            stages,
            tasks: s.tasks.filter((t) => t.stageId !== id),
            projects: withProgressSync({ ...s, stages }, st.projectId),
            activity: log(s, s.currentUserId, `Удалён этап «${st.name}»`, st.projectId),
          }
        }),

      addTask: (t) => {
        const id = genId('t')
        set((s) => ({
          tasks: [...s.tasks, { ...t, id }],
          activity: log(s, s.currentUserId, `Создана задача «${t.title}»`, t.projectId),
        }))
        return id
      },
      updateTask: (id, patch) =>
        set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),
      removeTask: (id) => set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),

      // ---- Снабжение ----
      createRequest: ({ projectId, items, priority, neededBy, comment, submit }) => {
        const id = genId('r')
        set((s) => {
          const number = `ЗК-${pad(s.requests.length + 1)}`
          const req: PurchaseRequest = {
            id, number, projectId, authorId: s.currentUserId, responsibleId: 'u_sup', createdAt: TODAY, neededBy,
            priority, status: submit ? 'pending' : 'draft', items, comment,
          }
          return {
            requests: [...s.requests, req],
            activity: log(s, s.currentUserId, `Создана заявка ${number}${submit ? ' и отправлена на согласование' : ' (черновик)'}`, projectId),
            notifications: submit
              ? notify(s, { text: `Новая заявка ${number} ожидает согласования`, link: '/procurement', roles: ['director', 'pm', 'admin'] })
              : s.notifications,
          }
        })
        return id
      },
      submitRequest: (id) =>
        set((s) => {
          const r = s.requests.find((x) => x.id === id)
          if (!r) return {}
          return {
            requests: s.requests.map((x) => (x.id === id ? { ...x, status: 'pending' } : x)),
            activity: log(s, s.currentUserId, `Заявка ${r.number} отправлена на согласование`, r.projectId),
            notifications: notify(s, { text: `Заявка ${r.number} ожидает согласования`, link: '/procurement', roles: ['director', 'pm', 'admin'] }),
          }
        }),
      approveRequest: (id) =>
        set((s) => {
          const r = s.requests.find((x) => x.id === id)
          if (!r) return {}
          return {
            requests: s.requests.map((x) => (x.id === id ? { ...x, status: 'approved', rejectReason: undefined } : x)),
            activity: log(s, s.currentUserId, `Заявка ${r.number} согласована`, r.projectId),
            notifications: notify(s, { text: `Заявка ${r.number} согласована — выберите поставщика`, link: '/procurement', roles: ['supply', 'admin'] }),
          }
        }),
      rejectRequest: (id, reason) =>
        set((s) => {
          const r = s.requests.find((x) => x.id === id)
          if (!r) return {}
          return {
            requests: s.requests.map((x) => (x.id === id ? { ...x, status: 'rejected', rejectReason: reason } : x)),
            activity: log(s, s.currentUserId, `Заявка ${r.number} отклонена: ${reason}`, r.projectId),
            notifications: notify(s, { text: `Заявка ${r.number} отклонена: ${reason}`, link: '/procurement', roles: ['foreman', 'pm', 'admin'] }),
          }
        }),
      deleteRequest: (id) => set((s) => ({ requests: s.requests.filter((r) => r.id !== id) })),
      chooseSupplier: (requestId, supplierId) => {
        const s = get()
        const r = s.requests.find((x) => x.id === requestId)
        const sup = s.suppliers.find((x) => x.id === supplierId)
        if (!r || !sup) return null
        if (r.items.some((i) => sup.prices[i.materialId] === undefined)) return null
        const orderId = genId('o')
        const order: PurchaseOrder = {
          id: orderId, number: `ЗАК-${pad(s.orders.length + 1)}`, requestId, projectId: r.projectId, supplierId,
          createdAt: TODAY, expectedDate: addDays(TODAY, sup.deliveryDays), status: 'placed',
          items: r.items.map((i) => ({ materialId: i.materialId, qty: i.qty, price: sup.prices[i.materialId] })),
        }
        set((st) => ({
          requests: st.requests.map((x) => (x.id === requestId ? { ...x, status: 'ordered', supplierId } : x)),
          orders: [...st.orders, order],
          activity: log(st, st.currentUserId, `По заявке ${r.number} сформирован заказ ${order.number} (${sup.name})`, r.projectId),
        }))
        return orderId
      },
      advanceOrder: (orderId) =>
        set((s) => ({ orders: s.orders.map((o) => (o.id === orderId && o.status === 'placed' ? { ...o, status: 'shipped' } : o)) })),
      receiveOrder: (orderId) =>
        set((s) => {
          const o = s.orders.find((x) => x.id === orderId)
          if (!o || o.status === 'delivered') return {}
          const wh = s.warehouses.find((w) => w.projectId === o.projectId)
          if (!wh) return {}
          let stock = s.stock
          const moves = o.items.map((it) => {
            stock = addToStock(stock, wh.id, it.materialId, it.qty)
            return {
              id: genId('mv'), date: TODAY, type: 'in' as const, materialId: it.materialId, qty: it.qty, toWarehouseId: wh.id,
              note: `Поставка по заказу ${o.number}`, userId: s.currentUserId, requestId: o.requestId,
            }
          })
          const req = s.requests.find((r) => r.id === o.requestId)
          return {
            stock,
            movements: [...moves, ...s.movements],
            orders: s.orders.map((x) => (x.id === orderId ? { ...x, status: 'delivered' } : x)),
            requests: s.requests.map((r) => (r.id === o.requestId ? { ...r, status: 'delivered' } : r)),
            activity: log(s, s.currentUserId, `Материалы по заказу ${o.number} оприходованы на склад (${req?.number ?? ''})`, o.projectId),
          }
        }),

      // ---- Склад ----
      receiveStock: ({ warehouseId, materialId, qty, note }) =>
        set((s) => ({
          stock: addToStock(s.stock, warehouseId, materialId, qty),
          movements: [{ id: genId('mv'), date: TODAY, type: 'in', materialId, qty, toWarehouseId: warehouseId, note, userId: s.currentUserId }, ...s.movements],
        })),
      issueStock: ({ warehouseId, materialId, qty, note }) => {
        const row = get().stock.find((x) => x.warehouseId === warehouseId && x.materialId === materialId)
        if (!row || row.qty < qty) return `Недостаточно материала на складе (доступно: ${row?.qty ?? 0})`
        set((s) => ({
          stock: addToStock(s.stock, warehouseId, materialId, -qty),
          movements: [{ id: genId('mv'), date: TODAY, type: 'out', materialId, qty, fromWarehouseId: warehouseId, note, userId: s.currentUserId }, ...s.movements],
        }))
        return null
      },
      transferStock: ({ fromId, toId, materialId, qty, note }) => {
        if (fromId === toId) return 'Выберите разные склады'
        const row = get().stock.find((x) => x.warehouseId === fromId && x.materialId === materialId)
        if (!row || row.qty < qty) return `Недостаточно материала на складе-отправителе (доступно: ${row?.qty ?? 0})`
        set((s) => ({
          stock: addToStock(addToStock(s.stock, fromId, materialId, -qty), toId, materialId, qty),
          movements: [{ id: genId('mv'), date: TODAY, type: 'transfer', materialId, qty, fromWarehouseId: fromId, toWarehouseId: toId, note, userId: s.currentUserId }, ...s.movements],
        }))
        return null
      },
      setMinQty: (warehouseId, materialId, minQty) =>
        set((s) => ({
          stock: s.stock.map((x) => (x.warehouseId === warehouseId && x.materialId === materialId ? { ...x, minQty } : x)),
        })),

      // ---- Документы ----
      toggleDocSigned: (id) =>
        set((s) => ({
          documents: s.documents.map((d) => (d.id === id ? { ...d, status: d.status === 'signed' ? 'unsigned' : 'signed' } : d)),
        })),
      addDocument: (d) => set((s) => ({ documents: [...s.documents, { ...d, id: genId('d') }] })),

      // ---- Сметы ----
      addEstimate: (e) => {
        const id = genId('e')
        set((s) => ({
          estimates: [...s.estimates, { ...e, id }],
          activity: log(s, s.currentUserId, `Загружена смета «${e.name}»`, e.projectId),
        }))
        return id
      },
      removeEstimate: (id) => set((s) => ({ estimates: s.estimates.filter((e) => e.id !== id) })),
      saveEstimateCorrection: (baseId, items, note) => {
        const id = genId('e')
        set((s) => {
          const base = s.estimates.find((e) => e.id === baseId)
          if (!base) return {}
          const version = Math.max(...s.estimates.filter((e) => e.projectId === base.projectId && e.name === base.name).map((e) => e.version)) + 1
          return {
            estimates: [...s.estimates, { ...base, id, version, items, note, date: TODAY }],
            activity: log(s, s.currentUserId, `Корректировка сметы «${base.name}» → v${version}: ${note}`, base.projectId),
          }
        })
        return id
      },

      // ---- Выполнение (КС-2 / КС-3) ----
      createExecutionReport: ({ projectId, estimateId, dateFrom, dateTo }) => {
        const id = genId('x')
        set((s) => {
          const number = Math.max(0, ...s.executionReports.filter((r) => r.projectId === projectId).map((r) => r.number)) + 1
          const r: ExecutionReport = { id, projectId, estimateId, number, dateFrom, dateTo, status: 'draft', qty: {}, createdAt: TODAY }
          return { executionReports: [...s.executionReports, r], activity: log(s, s.currentUserId, `Создан КС-2 №${number} (черновик)`, projectId) }
        })
        return id
      },
      setExecutionQty: (reportId, itemId, qty) =>
        set((s) => ({
          executionReports: s.executionReports.map((r) =>
            r.id === reportId && r.status === 'draft' ? { ...r, qty: { ...r.qty, [itemId]: qty } } : r),
        })),
      fillExecutionQty: (reportId, qty) =>
        set((s) => ({
          executionReports: s.executionReports.map((r) => (r.id === reportId && r.status === 'draft' ? { ...r, qty } : r)),
        })),
      signExecutionReport: (reportId) =>
        set((s) => {
          const r = s.executionReports.find((x) => x.id === reportId)
          if (!r) return {}
          return {
            executionReports: s.executionReports.map((x) => (x.id === reportId ? { ...x, status: 'signed', signedBy: s.currentUserId } : x)),
            activity: log(s, s.currentUserId, `Подписаны КС-2/КС-3 №${r.number}`, r.projectId),
            notifications: notify(s, { roles: ['accountant', 'director'], text: `Подписаны КС-2/КС-3 №${r.number} — можно выставлять счёт`, link: '/execution' }),
          }
        }),
      // ---- Себестоимость ----
      saveCostCalc: (input, id) => {
        const cid = id ?? genId('cc')
        set((s) => {
          const exists = s.costCalcs.some((c) => c.id === cid)
          return {
            costCalcs: exists
              ? s.costCalcs.map((c) => (c.id === cid ? { ...c, input, createdAt: TODAY, authorId: s.currentUserId } : c))
              : [{ id: cid, input, createdAt: TODAY, authorId: s.currentUserId }, ...s.costCalcs],
            activity: log(s, s.currentUserId, `${exists ? 'Обновлён' : 'Сохранён'} расчёт себестоимости «${input.name}»`),
          }
        })
        return cid
      },
      removeCostCalc: (id) => set((s) => ({ costCalcs: s.costCalcs.filter((c) => c.id !== id) })),

      // ---- Документы о качестве ----
      addQualityDoc: (d) => {
        const id = genId('qd')
        set((s) => ({
          qualityDocs: [{ ...d, id, createdAt: TODAY, authorId: s.currentUserId, check: 'pending' }, ...s.qualityDocs],
          activity: log(s, s.currentUserId, `Добавлен документ о качестве: ${d.kind} № ${d.number}`, d.projectId),
        }))
        return id
      },
      setQualityCheck: (id, check, note) =>
        set((s) => {
          const d = s.qualityDocs.find((x) => x.id === id)
          if (!d) return {}
          return {
            qualityDocs: s.qualityDocs.map((x) => (x.id === id ? { ...x, check, checkedBy: s.currentUserId, note: note ?? x.note } : x)),
            activity: log(s, s.currentUserId, `Входной контроль: ${d.kind} № ${d.number} — ${check === 'accepted' ? 'принят' : check === 'rejected' ? 'отклонён' : 'на проверке'}`, d.projectId),
            notifications: check === 'rejected' ? notify(s, { roles: ['supply', 'pm'], text: `Отклонён документ о качестве ${d.kind} № ${d.number} — нужен корректный документ от поставщика`, link: `/pto?project=${d.projectId}&tab=quality` }) : s.notifications,
          }
        }),
      removeQualityDoc: (id) => set((s) => ({ qualityDocs: s.qualityDocs.filter((x) => x.id !== id) })),

      // ---- Фотофиксация ----
      addPhoto: (p) => {
        const id = genId('ph')
        set((s) => ({
          photos: [{ ...p, id, authorId: s.currentUserId, versions: [{ version: 1, date: TODAY, authorId: s.currentUserId, ops: [], edits: ['Оригинал'] }] }, ...s.photos],
          activity: log(s, s.currentUserId, `Загружено фото «${p.title}»`, p.projectId),
        }))
        return id
      },
      savePhotoVersion: (id, ops, edits) => {
        let v = 0
        set((s) => {
          const ph = s.photos.find((x) => x.id === id)
          if (!ph) return {}
          v = ph.versions.length + 1
          return {
            photos: s.photos.map((x) => (x.id === id ? { ...x, versions: [...x.versions, { version: v, date: TODAY, authorId: s.currentUserId, ops, edits }] } : x)),
            activity: log(s, s.currentUserId, `Фото «${ph.title}»: версия ${v} (${edits.length} правок)`, ph.projectId),
          }
        })
        return v
      },
      removePhoto: (id) => set((s) => ({ photos: s.photos.filter((x) => x.id !== id) })),

      // ---- Чертежи DXF ----
      addCadFile: ({ projectId, name, format, key, size }) => {
        const id = genId('cf')
        set((s) => ({
          cadFiles: [{ id, projectId, name, format, versions: [{ version: 1, date: TODAY, authorId: s.currentUserId, key, note: 'Загружен', edits: [], size }] }, ...s.cadFiles],
          activity: log(s, s.currentUserId, `Загружен чертёж «${name}»`, projectId),
        }))
        return id
      },
      addCadFileVersion: (id, v) => {
        let n = 0
        set((s) => {
          const f = s.cadFiles.find((x) => x.id === id)
          if (!f) return {}
          n = f.versions.length + 1
          return {
            cadFiles: s.cadFiles.map((x) => (x.id === id ? { ...x, versions: [...x.versions, { ...v, version: n, date: TODAY, authorId: s.currentUserId }] } : x)),
            activity: log(s, s.currentUserId, `Чертёж «${f.name}»: версия ${n} — ${v.note}`, f.projectId),
          }
        })
        return n
      },
      removeCadFile: (id) => set((s) => ({ cadFiles: s.cadFiles.filter((x) => x.id !== id) })),

      // ---- Переписка ----
      markLetterRead: (id) => set((s) => ({ letters: s.letters.map((l) => (l.id === id && l.status === 'new' ? { ...l, status: 'read' } : l)) })),
      setLetterNoReply: (id, noReply) => set((s) => ({
        letters: s.letters.map((l) => (l.id === id ? { ...l, status: noReply ? 'noreply' : 'read', log: [...l.log, { date: TODAY, userId: s.currentUserId, text: noReply ? 'Отмечено: ответ не требуется' : 'Возвращено в работу' }] } : l)),
      })),
      createReply: (inId, subject, body, to) => {
        const id = genId('L')
        set((s) => {
          const src = s.letters.find((l) => l.id === inId)!
          const out: Letter = {
            id, projectId: src.projectId, direction: 'out', number: '—', date: TODAY, from: 'Генеральный директор', to, subject, body,
            attachments: [], status: 'draft', inReplyTo: inId, authorId: s.currentUserId,
            log: [{ date: TODAY, userId: s.currentUserId, text: 'Черновик подготовлен (AI-помощник, по данным системы)' }],
          }
          return { letters: [...s.letters, out], activity: log(s, s.currentUserId, `Подготовлен черновик ответа: ${src.subject}`, src.projectId) }
        })
        return id
      },
      updateOutLetter: (id, patch) => set((s) => ({ letters: s.letters.map((l) => (l.id === id && (l.status === 'draft' || l.status === 'review') ? { ...l, ...patch } : l)) })),
      submitLetter: (id) => set((s) => {
        const l = s.letters.find((x) => x.id === id)
        if (!l) return {}
        return {
          letters: s.letters.map((x) => (x.id === id ? { ...x, status: 'review', log: [...x.log, { date: TODAY, userId: s.currentUserId, text: 'Отправлено на согласование' }] } : x)),
          notifications: notify(s, { roles: ['director', 'pm'], text: `Письмо на согласование: ${l.subject}`, link: `/mail?letter=${l.inReplyTo ?? l.id}` }),
        }
      }),
      approveLetter: (id) => set((s) => ({
        letters: s.letters.map((x) => (x.id === id ? { ...x, status: 'approved', approvedBy: s.currentUserId, log: [...x.log, { date: TODAY, userId: s.currentUserId, text: 'Согласовано' }] } : x)),
      })),
      returnLetter: (id, reason) => set((s) => ({
        letters: s.letters.map((x) => (x.id === id ? { ...x, status: 'draft', approvedBy: undefined, log: [...x.log, { date: TODAY, userId: s.currentUserId, text: `Возвращено на доработку: ${reason}` }] } : x)),
      })),
      sendLetter: (id) => set((s) => {
        const l = s.letters.find((x) => x.id === id)
        if (!l || l.status !== 'approved') return {}
        const number = nextOutNumber(s.letters, TODAY)
        return {
          letters: s.letters.map((x) => {
            if (x.id === id) return { ...x, status: 'sent', number, date: TODAY, log: [...x.log, { date: TODAY, userId: s.currentUserId, text: `Отправлено, исх. № ${number} (демо: письмо не уходит наружу)` }] }
            if (x.id === l.inReplyTo) return { ...x, status: 'replied', log: [...x.log, { date: TODAY, userId: s.currentUserId, text: `Дан ответ исх. № ${number}` }] }
            return x
          }),
          activity: log(s, s.currentUserId, `Отправлено письмо исх. № ${number}: ${l.subject}`, l.projectId),
        }
      }),
      createOutgoing: (l, note) => {
        const id = genId('L')
        set((s) => ({
          letters: [...s.letters, {
            ...l, id, direction: 'out', number: '—', date: TODAY, from: 'Генеральный директор', attachments: [], status: 'draft', authorId: s.currentUserId,
            log: [{ date: TODAY, userId: s.currentUserId, text: note }],
          }],
          activity: log(s, s.currentUserId, `Подготовлено письмо: ${l.subject}`, l.projectId),
        }))
        return id
      },
      receiveLetter: (l) => {
        const id = genId('L')
        set((s) => {
          const number = String(1050 + s.letters.filter((x) => x.direction === 'in').length)
          const letter: Letter = {
            ...l, id, direction: 'in', number, date: TODAY, to: 'Генеральному директору', status: 'new', replyBy: extractDeadline({ body: l.body, date: TODAY }),
            log: [{ date: TODAY, userId: s.currentUserId, text: 'Получено по электронной почте (имитация), зарегистрировано' }],
          }
          return {
            letters: [letter, ...s.letters],
            notifications: notify(s, { text: `Новое письмо: ${l.from} — ${l.subject}`, link: `/mail?letter=${id}` }),
          }
        })
        return id
      },
      deleteExecutionReport: (reportId) =>
        set((s) => ({ executionReports: s.executionReports.filter((r) => !(r.id === reportId && r.status === 'draft')) })),

      // ---- ПТО ----
      createExecDoc: ({ projectId, stageId, requirementId, kind, title, works, note, qualityDocIds }) => {
        const id = genId('ed')
        set((s) => {
          const project = s.projects.find((p) => p.id === projectId)!
          const stage = s.stages.find((x) => x.id === stageId)
          const author = s.users.find((u) => u.id === s.currentUserId)!
          const doc: ExecDoc = {
            id, projectId, stageId, requirementId, kind, title, status: 'draft', createdAt: TODAY, authorId: s.currentUserId, qualityDocIds,
            versions: [{
              version: 1, date: TODAY, authorId: s.currentUserId, note: 'Создан по шаблону',
              body: renderExecDocBody({
                kind, project, stage, works, date: TODAY, author: author.name, note,
                attachments: (qualityDocIds ?? []).map((q) => s.qualityDocs.find((d) => d.id === q)).filter((d): d is QualityDoc => !!d).map((d) => qualityLine(d, s.materials)),
              }),
            }],
          }
          return {
            execDocs: [...s.execDocs, doc],
            activity: log(s, s.currentUserId, `Создан документ «${title}»`, projectId),
          }
        })
        return id
      },
      setExecStatus: (id, status, note) =>
        set((s) => {
          const d = s.execDocs.find((x) => x.id === id)
          if (!d) return {}
          const label = status === 'review' ? 'отправлен на согласование' : status === 'approved' ? 'согласован' : status === 'rejected' ? 'возвращён на доработку' : 'переведён в черновик'
          return {
            execDocs: s.execDocs.map((x) => (x.id === id ? { ...x, status } : x)),
            activity: log(s, s.currentUserId, `Документ «${d.title}» ${label}${note ? ': ' + note : ''}`, d.projectId),
            notifications: status === 'review'
              ? notify(s, { text: `Документ «${d.title}» ожидает согласования`, link: '/pto', roles: ['pm', 'director', 'admin'] })
              : s.notifications,
          }
        }),
      addExecVersion: (id, body, note) =>
        set((s) => ({
          execDocs: s.execDocs.map((d) =>
            d.id === id
              ? {
                  ...d,
                  status: d.status === 'approved' ? 'draft' : d.status,
                  versions: [...d.versions, { version: d.versions.length + 1, date: TODAY, authorId: s.currentUserId, note, body }],
                }
              : d,
          ),
        })),

      // ---- База знаний ----
      addKbDoc: ({ category, title }) =>
        set((s) => {
          const author = s.users.find((u) => u.id === s.currentUserId)
          const kb: KbDoc = { id: genId('k'), category, title, addedAt: TODAY, author: author?.name ?? '', chunks: 0, indexed: false }
          return { kbDocs: [kb, ...s.kbDocs] }
        }),
      removeKbDoc: (id) => set((s) => ({ kbDocs: s.kbDocs.filter((k) => k.id !== id) })),
      toggleKbIndexed: (id) =>
        set((s) => ({
          kbDocs: s.kbDocs.map((k) =>
            k.id === id ? { ...k, indexed: !k.indexed, chunks: !k.indexed ? Math.max(k.chunks, 8) : k.chunks } : k,
          ),
        })),
      addFeedback: (f) => {
        const id = genId('f')
        set((s) => {
          const fb: AiFeedback = { ...f, id, date: TODAY, authorId: s.currentUserId }
          const author = s.users.find((u) => u.id === s.currentUserId)
          // Проверенное исправление попадает в базу знаний только после явного действия сотрудника
          const kb: KbDoc | null = f.verdict === 'corrected' && f.correction && author && can(author.role, 'kb.manage')
            ? {
                id: genId('k'), category: 'Проверенные решения специалистов', title: f.correction.slice(0, 90),
                addedAt: TODAY, author: author?.name ?? '', chunks: 1, indexed: true,
              }
            : null
          return { feedback: [fb, ...s.feedback], kbDocs: kb ? [kb, ...s.kbDocs] : s.kbDocs }
        })
        return id
      },

      // ---- Чат ----
      pushChat: (m) => {
        const id = genId('c')
        set((s) => ({ chat: [...s.chat, { ...m, id, date: new Date().toISOString() }] }))
        return id
      },
      clearChat: () => set((s) => ({ chat: s.chat.slice(0, 1) })),
      setChatFeedback: (messageId, feedbackId) =>
        set((s) => ({ chat: s.chat.map((m) => (m.id === messageId ? { ...m, feedbackId } : m)) })),

      // ---- Уведомления ----
      markNotificationRead: (id) => set((s) => ({ notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)) })),
      markAllNotificationsRead: () => set((s) => ({ notifications: s.notifications.map((n) => ({ ...n, read: true })) })),
      pushNotification: (n) => set((s) => ({ notifications: notify(s, n) })),

      // ---- CAD ----
      addCadElements: (els, item) =>
        set((s) => ({
          cadAdded: [...s.cadAdded, ...els.map((e) => ({ ...e, added: true, projectId: item.projectId }))],
          cadHistory: [
            { ...item, id: genId('ch'), date: new Date().toISOString(), userId: s.currentUserId, addedIds: els.map((e) => e.id) },
            ...s.cadHistory,
          ],
        })),
      undoCad: (historyId) =>
        set((s) => {
          const h = s.cadHistory.find((x) => x.id === historyId)
          if (!h) return {}
          const ids = new Set(h.addedIds)
          return { cadAdded: s.cadAdded.filter((e) => !ids.has(e.id)), cadHistory: s.cadHistory.filter((x) => x.id !== historyId) }
        }),
    }),
    {
      name: 'stroyai-demo-v1',
      version: 8,
      // v2: добавлены тестовые сметы — подменяем пустой список сметами из seed
      migrate: (persisted, from) => {
        const st = persisted as Record<string, unknown>
        if (from < 2 && Array.isArray(st.estimates) && st.estimates.length === 0) st.estimates = createSeed().estimates
        if (from < 4) st.executionReports = createSeed().executionReports
        if (from < 8) st.letters = createSeed().letters
        if (from < 7) st.cadFiles = createSeed().cadFiles
        if (from < 6) { const seed = createSeed(); st.qualityDocs = seed.qualityDocs; st.photos = seed.photos }
        if (from < 5) {
          // v5: площадь/тип объектов для себестоимости и демо-расчёты новых объектов
          const seed = createSeed()
          st.costCalcs = seed.costCalcs
          if (Array.isArray(st.projects)) st.projects = (st.projects as Project[]).map((p) => {
            const sp = seed.projects.find((x) => x.id === p.id)
            return sp && p.area == null ? { ...p, area: sp.area, kind: sp.kind, floors: sp.floors } : p
          })
        }
        if (from < 3) {
          // v3: обезличенные имена сотрудников — обновляем справочник и авторов базы знаний
          const seed = createSeed()
          const old = (st.users as { id: string; role: string; projectIds: string[] }[]) ?? []
          st.users = seed.users.map((u) => { const o = old.find((x) => x.id === u.id); return o ? { ...u, role: o.role, projectIds: o.projectIds } : u })
          st.kbDocs = ((st.kbDocs as { id: string }[]) ?? []).map((k) => { const n = seed.kbDocs.find((x) => x.id === k.id); return n ? { ...k, author: n.author } : k })
        }
        return st as unknown as Store
      },
      partialize: (s) => {
        const out: Record<string, unknown> = { currentUserId: s.currentUserId, theme: s.theme }
        for (const k of DATA_KEYS) out[k] = s[k]
        return out as Partial<Store>
      },
    },
  ),
)

export function useCurrentUser(): User {
  const users = useStore((s) => s.users)
  const id = useStore((s) => s.currentUserId)
  return users.find((u) => u.id === id) ?? users[0]
}
