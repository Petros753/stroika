// Доменные типы СтройAI. Намеренно не зависят от React:
// те же структуры в будущем лягут в схему PostgreSQL / Pydantic-модели FastAPI.

export type Role =
  | 'admin'
  | 'director'
  | 'pm'
  | 'pto'
  | 'estimator'
  | 'supply'
  | 'foreman'
  | 'accountant'

export interface User {
  id: string
  name: string
  role: Role
  /** Объекты, к которым назначен сотрудник (для директора/админа/бухгалтера доступны все) */
  projectIds: string[]
  email: string
}

export type ProjectStatus = 'planning' | 'in_progress' | 'paused' | 'completed'

export interface Project {
  id: string
  name: string
  address: string
  customer: string
  managerId: string
  startDate: string // ISO yyyy-mm-dd
  endDate: string
  budget: number
  status: ProjectStatus
  /** Ручное значение; если у объекта есть этапы, готовность считается по ним */
  progress: number
  description?: string
  /** Общая площадь, м² — нужна для себестоимости за м² и расчёта по аналогу */
  area?: number
  kind?: BuildingKind
  floors?: number
}

export type BuildingKind = 'residential' | 'school' | 'medical' | 'office' | 'warehouse' | 'retail'
export type StructureKind = 'monolith' | 'brick' | 'steel' | 'precast'
export type FinishLevel = 'rough' | 'whitebox' | 'turnkey'
export type CostGroup = 'prep' | 'foundation' | 'frame' | 'roof' | 'facade' | 'engineering' | 'finishing' | 'landscaping'

/** Входные данные расчёта себестоимости нового объекта */
export interface CostInput {
  name: string
  kind: BuildingKind
  area: number
  floors: number
  underground: boolean
  structure: StructureKind
  finish: FinishLevel
  region: string
  months: number
  method: 'norms' | 'analog'
  analogId?: string
  overheadPct: number
  reservePct: number
  marginPct: number
}

export interface CostCalc {
  id: string
  input: CostInput
  createdAt: string
  authorId: string
}

export interface Stage {
  id: string
  projectId: string
  name: string
  /** Корпус / участок */
  section: string
  /** Вид работ */
  workType: string
  startDate: string
  endDate: string
  progress: number // 0..100
  plannedCost: number
  actualCost: number
}

export type TaskStatus = 'todo' | 'in_progress' | 'done'
export type Priority = 'low' | 'normal' | 'high' | 'urgent'

export interface Task {
  id: string
  projectId: string
  stageId: string
  title: string
  assigneeId: string
  dueDate: string
  status: TaskStatus
  priority: Priority
}

export interface Material {
  id: string
  name: string
  unit: string
  /** Ориентировочная цена для оценок, ₽ */
  refPrice: number
}

export interface Warehouse {
  id: string
  name: string
  /** null — центральный склад компании */
  projectId: string | null
}

export interface StockItem {
  warehouseId: string
  materialId: string
  qty: number
  minQty: number
}

export type MovementType = 'in' | 'out' | 'transfer'

export interface StockMovement {
  id: string
  date: string
  type: MovementType
  materialId: string
  qty: number
  fromWarehouseId?: string
  toWarehouseId?: string
  note: string
  userId: string
  requestId?: string
}

export interface Supplier {
  id: string
  name: string
  rating: number // 1..5
  deliveryDays: number
  /** Прайс-лист: materialId -> цена за единицу */
  prices: Record<string, number>
}

export type RequestStatus =
  | 'draft'
  | 'pending' // на согласовании
  | 'approved'
  | 'rejected'
  | 'ordered'
  | 'delivered'

export interface RequestItem {
  materialId: string
  qty: number
}

export interface PurchaseRequest {
  id: string
  number: string
  projectId: string
  authorId: string
  responsibleId: string // снабженец
  createdAt: string
  neededBy: string
  priority: Priority
  status: RequestStatus
  items: RequestItem[]
  comment?: string
  rejectReason?: string
  supplierId?: string
}

export type OrderStatus = 'placed' | 'shipped' | 'delivered'

export interface PurchaseOrder {
  id: string
  number: string
  requestId: string
  projectId: string
  supplierId: string
  createdAt: string
  expectedDate: string
  status: OrderStatus
  items: { materialId: string; qty: number; price: number }[]
}

export interface EstimateItem {
  id: string
  section: string
  code: string
  name: string
  unit: string
  qty: number
  price: number
  /** Работа исключена при корректировке сметы: в итог и сверку не входит */
  excluded?: boolean
}

export interface Estimate {
  id: string
  projectId: string
  name: string
  version: number
  /** Группа версий одной сметы: сравнивать можно любые две */
  source: 'ГРАНД-Смета' | 'Excel' | 'PDF' | 'XML'
  date: string
  items: EstimateItem[]
  /** Комментарий к версии (например, итоги корректировки) */
  note?: string
}

/** Справка о выполнении: КС-2 и КС-3 формируются из неё и сметы */
export interface ExecutionReport {
  id: string
  projectId: string
  estimateId: string
  number: number
  dateFrom: string
  dateTo: string
  status: 'draft' | 'signed'
  /** Выполнено за период: id позиции сметы → объём */
  qty: Record<string, number>
  createdAt: string
  signedBy?: string
}

export type DocStatus = 'signed' | 'unsigned'

export interface ProjectDoc {
  id: string
  projectId: string
  name: string
  type: string
  counterparty: string
  date: string
  status: DocStatus
}

export type ExecDocKind =
  | 'АОСР'
  | 'АООК'
  | 'АОУСИТО'
  | 'Акт ГРО'
  | 'Акт разбивки осей'
  | 'Исполнительная схема'
  | 'Акт входного контроля'
  | 'Акт гидравлических испытаний'
  | 'Акт промывки и дезинфекции'
  | 'Протокол сопротивления изоляции'
  | 'Акт испытания оборудования'
  | 'Акт передачи фронта работ'
  | 'Реестр документации'
  | 'Журнал работ'
  | 'Акт / протокол'

/** Документы о качестве материалов */
export type QualityDocKind = 'Сертификат соответствия' | 'Декларация о соответствии' | 'Паспорт качества' | 'Протокол испытаний' | 'Отказное письмо'
export type IncomingCheck = 'pending' | 'accepted' | 'rejected'

export interface QualityDoc {
  id: string
  projectId: string
  materialId: string
  kind: QualityDocKind
  number: string
  issuer: string
  /** Партия / плавка / номер поставки */
  batch?: string
  issuedAt: string
  validUntil?: string
  orderId?: string
  fileName?: string
  check: IncomingCheck
  checkedBy?: string
  note?: string
  createdAt: string
  authorId: string
}

/** Чертёж DXF: файлы версий лежат в IndexedDB (в рабочей версии — S3), оригинал не перезаписывается */
export interface CadFileVersion { version: number; date: string; authorId: string; key: string; note: string; edits: string[]; size: number }
export interface CadFile {
  id: string
  projectId: string
  name: string
  /** Исходный формат загрузки */
  format: 'DXF' | 'DWG'
  versions: CadFileVersion[]
}

/** Техническая правка фото. Координаты — доли (0..1) от размеров кадра на момент правки */
export type PhotoOp =
  | { t: 'rotate'; deg: 90 | -90 }
  | { t: 'crop'; x: number; y: number; w: number; h: number }
  | { t: 'arrow'; x1: number; y1: number; x2: number; y2: number; color: string }
  | { t: 'rect'; x: number; y: number; w: number; h: number; color: string }
  | { t: 'text'; x: number; y: number; text: string; color: string }
  | { t: 'blur'; x: number; y: number; w: number; h: number }
  | { t: 'stamp'; text: string }
  | { t: 'adjust'; brightness: number; contrast: number }

/** Фотофиксация: оригинал не перезаписывается; версия = оригинал + список правок (воспроизводимо и проверяемо) */
export interface PhotoVersion {
  version: number
  date: string
  authorId: string
  ops: PhotoOp[]
  /** Описание правок этой версии относительно предыдущей */
  edits: string[]
}
export interface SitePhoto {
  id: string
  projectId: string
  stageId?: string
  title: string
  takenAt: string
  /** Оригинал: demo:<сцена> (встроенный демо-снимок) или idb:<ключ> (загруженный файл в IndexedDB браузера) */
  src: string
  authorId: string
  versions: PhotoVersion[]
}

export type ExecDocStatus = 'draft' | 'review' | 'approved' | 'rejected'

export interface ExecDocVersion {
  version: number
  date: string
  authorId: string
  note: string
  body: string
}

export interface ExecDoc {
  id: string
  projectId: string
  stageId?: string
  requirementId?: string
  /** Приложенные документы о качестве (id QualityDoc) */
  qualityDocIds?: string[]
  kind: ExecDocKind
  title: string
  status: ExecDocStatus
  createdAt: string
  authorId: string
  versions: ExecDocVersion[]
}

/** Что по плану должно быть оформлено для этапа */
export interface ExecRequirement {
  id: string
  projectId: string
  stageId?: string
  kind: ExecDocKind
  title: string
}

export type KbCategory =
  | 'Нормативная документация'
  | 'Проектная документация'
  | 'Сметные нормативы'
  | 'Шаблоны компании'
  | 'Договоры'
  | 'История завершённых объектов'
  | 'Проверенные решения специалистов'

export interface KbDoc {
  id: string
  category: KbCategory
  title: string
  addedAt: string
  author: string
  chunks: number
  indexed: boolean
}

export interface AiFeedback {
  id: string
  question: string
  answer: string
  verdict: 'confirmed' | 'corrected'
  correction?: string
  authorId: string
  date: string
}

export interface Notification {
  id: string
  text: string
  date: string
  read: boolean
  link?: string
  /** Если задано — уведомление видят только эти роли */
  roles?: Role[]
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  date: string
  projectId?: string
  /** Структурированный результат (таблица) */
  table?: { head: string[]; rows: string[][] }
  link?: { to: string; label: string }[]
  feedbackId?: string
}

/** Переписка с заказчиком, технадзором, субподрядчиками */
export type LetterCategory = 'schedule' | 'payment' | 'quality' | 'change' | 'claim' | 'info'
export type InStatus = 'new' | 'read' | 'replied' | 'noreply'
export type OutStatus = 'draft' | 'review' | 'approved' | 'sent'
export interface Letter {
  id: string
  projectId: string
  direction: 'in' | 'out'
  /** Рег. номер: входящий (наш) или исходящий */
  number: string
  /** Номер и дата документа отправителя (для входящих) */
  senderRef?: string
  date: string
  from: string
  to: string
  subject: string
  body: string
  attachments: string[]
  /** Входящее: статус обработки; исходящее: статус согласования */
  status: InStatus | OutStatus
  replyBy?: string
  inReplyTo?: string
  authorId?: string
  approvedBy?: string
  /** Журнал по письму: кто что сделал */
  log: { date: string; userId: string; text: string }[]
}

export interface ActivityItem {
  id: string
  date: string
  userId: string
  text: string
  projectId?: string
}

// ---- AI CAD ----

export type CadLayer = 'walls' | 'dims' | 'electric' | 'plumbing' | 'vent'

export type CadKind =
  | 'wall'
  | 'door'
  | 'window'
  | 'room'
  | 'socket'
  | 'switch'
  | 'light'
  | 'cable'
  | 'pipe'
  | 'fixture'
  | 'duct'
  | 'dim'

export interface CadElement {
  id: string
  layer: CadLayer
  kind: CadKind
  floor: number
  roomNo?: number
  x: number
  y: number
  x2?: number
  y2?: number
  w?: number
  h?: number
  label?: string
  props: Record<string, string | number>
  /** Добавлен пользователем / AI-командой */
  added?: boolean
  /** Для добавленных элементов — объект, к чертежу которого они относятся */
  projectId?: string
}

export interface CadHistoryItem {
  id: string
  projectId: string
  date: string
  userId: string
  command: string
  summary: string
  addedIds: string[]
}

// ---- Права ----

export type Permission =
  | 'mail.draft'
  | 'mail.send'
  | 'costing.edit'
  | 'project.create'
  | 'project.edit'
  | 'stage.edit'
  | 'task.edit'
  | 'request.create'
  | 'request.approve'
  | 'request.supplier'
  | 'order.receive'
  | 'stock.move'
  | 'estimate.upload'
  | 'estimate.compare'
  | 'pto.create'
  | 'pto.approve'
  | 'kb.manage'
  | 'cad.edit'
  | 'employees.manage'
  | 'finance.view'
  | 'docs.sign'
  | 'execution.edit'
  | 'execution.approve'

export type SectionKey =
  | 'mail'
  | 'costing'
  | 'dashboard'
  | 'projects'
  | 'cad'
  | 'estimates'
  | 'procurement'
  | 'warehouse'
  | 'pto'
  | 'assistant'
  | 'knowledge'
  | 'employees'
  | 'execution'
