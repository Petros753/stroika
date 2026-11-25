import type {
  ActivityItem, ChatMessage, ExecDoc, ExecRequirement, KbDoc, AiFeedback, Material, Notification,
  Project, ProjectDoc, PurchaseOrder, PurchaseRequest, Stage, StockItem, StockMovement, Supplier,
  Task, User, Warehouse, Estimate, CadElement, CadHistoryItem, ExecDocKind, ExecutionReport, CostCalc, QualityDoc, SitePhoto, CadFile, Letter,
} from '../domain/types'
import { renderExecDocBody } from '../domain/execdocs'
import { seedEstimates } from './estimates'
import { seedExecutionReports } from './execution'
import { seedCostCalcs } from './costing'
import { seedQualityDocs } from './quality'
import { seedPhotos } from './photos'
import { seedLetters } from './mail'

function seedCadFiles(): CadFile[] {
  return [{
    id: 'cf1', projectId: 'p4', name: 'АР_План_1_этажа.dxf', format: 'DXF',
    versions: [{ version: 1, date: '2026-11-10', authorId: 'u_pto', key: 'demo:office', note: 'Загружен из проектной документации (демо)', edits: [], size: 0 }],
  }]
}

const M = (x: number) => Math.round(x * 1_000_000)

export interface DataState {
  users: User[]
  projects: Project[]
  stages: Stage[]
  tasks: Task[]
  materials: Material[]
  warehouses: Warehouse[]
  stock: StockItem[]
  movements: StockMovement[]
  suppliers: Supplier[]
  requests: PurchaseRequest[]
  orders: PurchaseOrder[]
  estimates: Estimate[]
  executionReports: ExecutionReport[]
  costCalcs: CostCalc[]
  qualityDocs: QualityDoc[]
  photos: SitePhoto[]
  cadFiles: CadFile[]
  letters: Letter[]
  documents: ProjectDoc[]
  execDocs: ExecDoc[]
  requirements: ExecRequirement[]
  kbDocs: KbDoc[]
  feedback: AiFeedback[]
  notifications: Notification[]
  chat: ChatMessage[]
  activity: ActivityItem[]
  cadAdded: CadElement[]
  cadHistory: CadHistoryItem[]
}

// ---------- Сотрудники ----------
const users: User[] = [
  { id: 'u_admin', name: 'Администратор', role: 'admin', projectIds: [], email: 'admin@stroyai.demo' },
  { id: 'u_dir', name: 'Карабасов Аслан', role: 'director', projectIds: [], email: 'director@stroyai.demo' },
  { id: 'u_pm1', name: 'Руководитель проекта №1', role: 'pm', projectIds: ['p1', 'p3'], email: 'pm1@stroyai.demo' },
  { id: 'u_pm2', name: 'Руководитель проекта №2', role: 'pm', projectIds: ['p2', 'p4'], email: 'pm2@stroyai.demo' },
  { id: 'u_pto', name: 'Инженер ПТО', role: 'pto', projectIds: ['p1', 'p2', 'p3'], email: 'pto@stroyai.demo' },
  { id: 'u_est', name: 'Сметчик', role: 'estimator', projectIds: ['p1', 'p2', 'p3', 'p4'], email: 'estimator@stroyai.demo' },
  { id: 'u_sup', name: 'Снабженец', role: 'supply', projectIds: ['p1', 'p2', 'p3', 'p4'], email: 'supply@stroyai.demo' },
  { id: 'u_for1', name: 'Прораб №1', role: 'foreman', projectIds: ['p1'], email: 'foreman1@stroyai.demo' },
  { id: 'u_for2', name: 'Прораб №2', role: 'foreman', projectIds: ['p2', 'p4'], email: 'foreman2@stroyai.demo' },
  { id: 'u_for3', name: 'Прораб №3', role: 'foreman', projectIds: ['p3'], email: 'foreman3@stroyai.demo' },
  { id: 'u_acc', name: 'Бухгалтер', role: 'accountant', projectIds: [], email: 'accountant@stroyai.demo' },
]

// ---------- Объекты ----------
const projects: Project[] = [
  {
    id: 'p1', name: 'Жилой комплекс «Северный»', address: 'г. Москва, ул. Северная, вл. 12',
    customer: 'ООО «СеверСтройИнвест»', managerId: 'u_pm1', startDate: '2025-03-01', endDate: '2027-06-30',
    budget: M(1240), status: 'in_progress', progress: 69,
    description: 'Два 24-этажных жилых корпуса с подземным паркингом и благоустройством.',
    area: 18000, kind: 'residential', floors: 24,
  },
  {
    id: 'p2', name: 'Общеобразовательная школа на 825 мест', address: 'г. Казань, ул. Школьная, 5',
    customer: 'Управление капитального строительства г. Казани', managerId: 'u_pm2', startDate: '2025-06-01', endDate: '2026-12-20',
    budget: M(640), status: 'in_progress', progress: 80,
    description: 'Трёхэтажное здание школы со спортивным блоком и актовым залом.',
    area: 9500, kind: 'school', floors: 3,
  },
  {
    id: 'p3', name: 'Медицинский центр «Здоровье+»', address: 'г. Екатеринбург, ул. Больничная, 18',
    customer: 'ГК «МедАльянс»', managerId: 'u_pm1', startDate: '2025-09-15', endDate: '2027-02-28',
    budget: M(510), status: 'in_progress', progress: 58,
    description: 'Многопрофильный диагностический центр с чистыми помещениями и медицинскими газами.',
    area: 5200, kind: 'medical', floors: 4,
  },
  {
    id: 'p4', name: 'Бизнес-центр «Атриум»', address: 'г. Санкт-Петербург, Невский пр., 140',
    customer: 'АО «Атриум Девелопмент»', managerId: 'u_pm2', startDate: '2026-02-01', endDate: '2028-03-31',
    budget: M(920), status: 'in_progress', progress: 21,
    description: 'Офисная башня класса А, 18 этажей, подземная парковка.',
    area: 11500, kind: 'office', floors: 18,
  },
]

// ---------- Этапы ----------
let stageSeq = 0
function st(
  projectId: string, name: string, section: string, workType: string,
  startDate: string, endDate: string, progress: number, plannedM: number, actualM: number,
): Stage {
  stageSeq += 1
  return {
    id: `st_${projectId}_${stageSeq}`, projectId, name, section, workType, startDate, endDate, progress,
    plannedCost: M(plannedM), actualCost: M(actualM),
  }
}

const stages: Stage[] = [
  // P1 — Жилой комплекс «Северный». Себестоимость по плану 1 080 млн при бюджете 1 240 млн
  st('p1', 'Подготовка площадки и котлован', 'Участок №1', 'Земляные работы', '2025-03-01', '2025-05-31', 100, 62, 64),
  st('p1', 'Фундаменты и подземная часть', 'Корпус 1', 'Монолитные работы', '2025-05-15', '2025-09-30', 100, 148, 151),
  st('p1', 'Монолитный каркас', 'Корпус 1', 'Монолитные работы', '2025-09-01', '2026-06-30', 97, 232, 226),
  st('p1', 'Монолитный каркас', 'Корпус 2', 'Монолитные работы', '2026-02-01', '2026-12-31', 78, 214, 168),
  st('p1', 'Инженерные сети (ЭОМ, ВК, ОВ)', 'Корпус 1', 'Инженерные системы', '2026-05-01', '2027-02-28', 58, 190, 118),
  st('p1', 'Внутренняя отделка', 'Корпус 1', 'Отделочные работы', '2026-09-01', '2027-05-31', 22, 160, 36),
  st('p1', 'Благоустройство территории', 'Участок №1', 'Благоустройство', '2027-03-01', '2027-06-30', 0, 74, 0),
  // P2 — Школа. Себестоимость 560 млн при бюджете 640 млн. Отстаёт от графика
  st('p2', 'Подготовка площадки и земляные работы', 'Участок', 'Земляные работы', '2025-06-01', '2025-08-15', 100, 38, 38),
  st('p2', 'Фундаменты и нулевой цикл', 'Основной корпус', 'Монолитные работы', '2025-08-01', '2025-11-30', 100, 72, 75),
  st('p2', 'Каркас и кровля', 'Основной корпус', 'Строительно-монтажные работы', '2025-11-15', '2026-06-15', 100, 148, 154),
  st('p2', 'Инженерные системы (ЭОМ, ОВ, ВК)', 'Основной корпус', 'Инженерные системы', '2026-04-01', '2026-10-31', 72, 120, 96),
  st('p2', 'Внутренняя отделка', 'Основной корпус', 'Отделочные работы', '2026-07-01', '2026-12-10', 55, 96, 60),
  st('p2', 'Спортивный блок', 'Спортзал', 'Строительно-монтажные работы', '2026-03-01', '2026-11-30', 80, 52, 44),
  st('p2', 'Благоустройство и сдача', 'Участок', 'Благоустройство', '2026-10-01', '2026-12-20', 25, 34, 10),
  // P3 — Медцентр. Себестоимость 440 млн при бюджете 510 млн. Самый большой перерасход
  st('p3', 'Подготовка площадки и котлован', 'Участок', 'Земляные работы', '2025-09-15', '2025-12-15', 100, 34, 41),
  st('p3', 'Фундаменты', 'Корпус А', 'Монолитные работы', '2025-12-01', '2026-03-31', 100, 58, 71),
  st('p3', 'Каркас здания', 'Корпус А', 'Монолитные работы', '2026-03-15', '2026-10-15', 100, 118, 142),
  st('p3', 'Медицинские инженерные системы (газы, ОВ, чистые помещения)', 'Корпус А', 'Инженерные системы', '2026-08-01', '2027-01-31', 45, 96, 68),
  st('p3', 'Внутренняя отделка', 'Корпус А', 'Отделочные работы', '2026-12-01', '2027-02-28', 0, 82, 0),
  st('p3', 'Медицинское оснащение и пусконаладка', 'Корпус А', 'Пусконаладочные работы', '2027-01-15', '2027-02-28', 0, 52, 0),
  // P4 — Бизнес-центр. Себестоимость 800 млн при бюджете 920 млн. Ранняя стадия
  st('p4', 'Проектирование и изыскания', 'Участок', 'Проектные работы', '2026-02-01', '2026-05-31', 100, 36, 37),
  st('p4', 'Подготовка площадки, шпунтовое ограждение', 'Участок', 'Земляные работы', '2026-05-15', '2026-09-15', 100, 74, 76),
  st('p4', 'Котлован и фундаментная плита', 'Башня', 'Монолитные работы', '2026-08-15', '2027-01-31', 38, 148, 58),
  st('p4', 'Монолитный каркас', 'Башня', 'Монолитные работы', '2027-01-15', '2027-11-30', 0, 260, 0),
  st('p4', 'Фасады и инженерные системы', 'Башня', 'Инженерные системы', '2027-06-01', '2028-02-28', 0, 190, 0),
  st('p4', 'Отделка и сдача', 'Башня', 'Отделочные работы', '2027-10-01', '2028-03-31', 0, 92, 0),
]

const stageOf = (projectId: string, idx: number) =>
  stages.filter((s) => s.projectId === projectId)[idx - 1].id

// ---------- Задачи ----------
let taskSeq = 0
function tk(
  projectId: string, stageIdx: number, title: string, assigneeId: string, dueDate: string,
  status: Task['status'], priority: Task['priority'],
): Task {
  taskSeq += 1
  return { id: `t_${taskSeq}`, projectId, stageId: stageOf(projectId, stageIdx), title, assigneeId, dueDate, status, priority }
}

const tasks: Task[] = [
  tk('p1', 4, 'Согласовать армирование перекрытия 14 этажа, корпус 2', 'u_pm1', '2026-11-10', 'in_progress', 'high'),
  tk('p1', 5, 'Приёмка электромонтажа 1–3 этажей, корпус 1', 'u_for1', '2026-11-20', 'in_progress', 'normal'),
  tk('p1', 4, 'Оформить заказ арматуры на декабрь', 'u_sup', '2026-11-18', 'todo', 'high'),
  tk('p1', 3, 'Закрыть КС-2 за октябрь по корпусу 1', 'u_est', '2026-11-05', 'todo', 'normal'),
  tk('p1', 3, 'Подготовить исполнительную документацию по каркасу корпуса 1', 'u_pto', '2026-11-30', 'todo', 'normal'),
  tk('p1', 2, 'Сдать геодезическую съёмку подземной части', 'u_pto', '2025-10-05', 'done', 'normal'),
  tk('p2', 4, 'Прокладка кабельных трасс на 2 этаже', 'u_for2', '2026-11-05', 'in_progress', 'urgent'),
  tk('p2', 4, 'Монтаж ВРУ в электрощитовой', 'u_for2', '2026-11-08', 'todo', 'urgent'),
  tk('p2', 5, 'Закупка керамогранита для санузлов', 'u_sup', '2026-11-12', 'todo', 'high'),
  tk('p2', 4, 'Оформить АОСР на инженерные сети', 'u_pto', '2026-11-10', 'todo', 'high'),
  tk('p2', 4, 'Пусконаладка вентиляции', 'u_pm2', '2026-11-28', 'todo', 'normal'),
  tk('p2', 5, 'Отделка актового зала', 'u_for2', '2026-11-30', 'in_progress', 'normal'),
  tk('p2', 6, 'Подготовка к приёмке комиссией', 'u_pm2', '2026-12-10', 'todo', 'high'),
  tk('p2', 3, 'Приёмка кровли', 'u_pm2', '2026-06-20', 'done', 'normal'),
  tk('p3', 4, 'Согласовать изменения по чистым помещениям с заказчиком', 'u_pm1', '2026-11-07', 'in_progress', 'high'),
  tk('p3', 4, 'Монтаж медицинских газов, 1 этаж', 'u_for3', '2026-11-25', 'in_progress', 'normal'),
  tk('p3', 4, 'Закупка воздуховодов для чистых помещений', 'u_sup', '2026-11-15', 'todo', 'urgent'),
  tk('p3', 4, 'Скорректировать смету по перерасходу', 'u_est', '2026-11-12', 'todo', 'high'),
  tk('p3', 3, 'Подготовить АОСР на монолитные работы', 'u_pto', '2026-11-18', 'in_progress', 'normal'),
  tk('p4', 3, 'Мониторинг осадки шпунтового ограждения', 'u_for2', '2026-11-20', 'in_progress', 'normal'),
  tk('p4', 3, 'Заказ арматуры для фундаментной плиты', 'u_sup', '2026-11-16', 'todo', 'high'),
  tk('p4', 4, 'Согласовать график монолитного каркаса', 'u_pm2', '2026-11-30', 'todo', 'normal'),
  tk('p4', 3, 'Журнал бетонных работ по плите', 'u_pto', '2026-11-14', 'todo', 'normal'),
  tk('p4', 2, 'Приёмка шпунтового ограждения', 'u_pm2', '2026-09-20', 'done', 'normal'),
]

// ---------- Материалы, склады ----------
const materials: Material[] = [
  { id: 'm_rebar', name: 'Арматура А500С Ø12', unit: 'т', refPrice: 68000 },
  { id: 'm_conc', name: 'Бетон В25 (М350)', unit: 'м³', refPrice: 5900 },
  { id: 'm_cable', name: 'Кабель ВВГнг-LS 3×2,5', unit: 'м', refPrice: 62 },
  { id: 'm_socket', name: 'Розетка скрытой установки', unit: 'шт', refPrice: 320 },
  { id: 'm_pipe', name: 'Труба ПНД Ø110', unit: 'м', refPrice: 410 },
  { id: 'm_duct', name: 'Воздуховод оцинкованный', unit: 'м²', refPrice: 980 },
  { id: 'm_gkl', name: 'Гипсокартон 12,5 мм', unit: 'лист', refPrice: 440 },
  { id: 'm_wool', name: 'Утеплитель минераловатный', unit: 'м²', refPrice: 520 },
  { id: 'm_window', name: 'Окно ПВХ двухкамерное', unit: 'м²', refPrice: 8200 },
  { id: 'm_tile', name: 'Керамогранит 600×600', unit: 'м²', refPrice: 1450 },
  { id: 'm_plaster', name: 'Штукатурная смесь 30 кг', unit: 'меш', refPrice: 390 },
  { id: 'm_paint', name: 'Краска интерьерная', unit: 'кг', refPrice: 210 },
]

const warehouses: Warehouse[] = [
  { id: 'w_c', name: 'Центральный склад', projectId: null },
  { id: 'w_p1', name: 'Склад объекта: ЖК «Северный»', projectId: 'p1' },
  { id: 'w_p2', name: 'Склад объекта: Школа', projectId: 'p2' },
  { id: 'w_p3', name: 'Склад объекта: Медцентр', projectId: 'p3' },
  { id: 'w_p4', name: 'Склад объекта: Бизнес-центр', projectId: 'p4' },
]

const sk = (warehouseId: string, materialId: string, qty: number, minQty: number): StockItem => ({
  warehouseId, materialId, qty, minQty,
})

const stock: StockItem[] = [
  sk('w_c', 'm_rebar', 60, 30), sk('w_c', 'm_cable', 3000, 1000), sk('w_c', 'm_socket', 800, 300),
  sk('w_c', 'm_pipe', 600, 200), sk('w_c', 'm_duct', 150, 100), sk('w_c', 'm_gkl', 900, 300),
  sk('w_c', 'm_wool', 1200, 400), sk('w_c', 'm_window', 120, 50), sk('w_c', 'm_tile', 800, 300),
  sk('w_c', 'm_plaster', 700, 200), sk('w_c', 'm_paint', 900, 300),
  // ЖК «Северный»
  sk('w_p1', 'm_rebar', 14, 40), sk('w_p1', 'm_cable', 2600, 1500), sk('w_p1', 'm_socket', 180, 250),
  sk('w_p1', 'm_gkl', 640, 300), sk('w_p1', 'm_wool', 410, 300), sk('w_p1', 'm_plaster', 220, 200),
  sk('w_p1', 'm_pipe', 240, 150), sk('w_p1', 'm_duct', 90, 80), sk('w_p1', 'm_window', 40, 60),
  // Школа
  sk('w_p2', 'm_cable', 420, 1500), sk('w_p2', 'm_socket', 310, 400), sk('w_p2', 'm_pipe', 80, 120),
  sk('w_p2', 'm_duct', 210, 150), sk('w_p2', 'm_gkl', 520, 400), sk('w_p2', 'm_tile', 160, 300),
  sk('w_p2', 'm_plaster', 410, 200), sk('w_p2', 'm_paint', 380, 250), sk('w_p2', 'm_window', 60, 40),
  // Медцентр
  sk('w_p3', 'm_duct', 35, 200), sk('w_p3', 'm_cable', 980, 800), sk('w_p3', 'm_pipe', 160, 200),
  sk('w_p3', 'm_rebar', 22, 10), sk('w_p3', 'm_gkl', 300, 200), sk('w_p3', 'm_wool', 120, 100),
  // Бизнес-центр
  sk('w_p4', 'm_rebar', 85, 120),
]

const movements: StockMovement[] = [
  { id: 'mv_1', date: '2026-11-02', type: 'in', materialId: 'm_gkl', qty: 200, toWarehouseId: 'w_p2', note: 'Поставка по заказу ЗК-0004', userId: 'u_sup', requestId: 'r4' },
  { id: 'mv_2', date: '2026-11-02', type: 'in', materialId: 'm_plaster', qty: 300, toWarehouseId: 'w_p2', note: 'Поставка по заказу ЗК-0004', userId: 'u_sup', requestId: 'r4' },
  { id: 'mv_3', date: '2026-11-04', type: 'out', materialId: 'm_cable', qty: 380, fromWarehouseId: 'w_p2', note: 'Выдача на прокладку трасс, 2 этаж', userId: 'u_for2' },
  { id: 'mv_4', date: '2026-11-05', type: 'transfer', materialId: 'm_socket', qty: 150, fromWarehouseId: 'w_c', toWarehouseId: 'w_p2', note: 'Перемещение с центрального склада', userId: 'u_sup' },
  { id: 'mv_5', date: '2026-11-06', type: 'out', materialId: 'm_rebar', qty: 26, fromWarehouseId: 'w_p1', note: 'Армирование перекрытия, корпус 2', userId: 'u_for1' },
  { id: 'mv_6', date: '2026-11-07', type: 'out', materialId: 'm_duct', qty: 65, fromWarehouseId: 'w_p3', note: 'Монтаж воздуховодов, 1 этаж', userId: 'u_for3' },
  { id: 'mv_7', date: '2026-11-09', type: 'transfer', materialId: 'm_rebar', qty: 15, fromWarehouseId: 'w_p1', toWarehouseId: 'w_p4', note: 'Перемещение между объектами для плиты', userId: 'u_sup' },
  { id: 'mv_8', date: '2026-11-10', type: 'out', materialId: 'm_plaster', qty: 120, fromWarehouseId: 'w_p2', note: 'Штукатурка актового зала', userId: 'u_for2' },
  { id: 'mv_9', date: '2026-11-11', type: 'out', materialId: 'm_gkl', qty: 110, fromWarehouseId: 'w_p2', note: 'Монтаж перегородок, 3 этаж', userId: 'u_for2' },
  { id: 'mv_10', date: '2026-11-12', type: 'out', materialId: 'm_cable', qty: 220, fromWarehouseId: 'w_p1', note: 'Электромонтаж корпус 1', userId: 'u_for1' },
]

// ---------- Поставщики ----------
const suppliers: Supplier[] = [
  { id: 's1', name: 'ООО «МеталлТорг»', rating: 4.5, deliveryDays: 3, prices: { m_rebar: 66500 } },
  { id: 's2', name: 'АО «БетонСервис»', rating: 4.2, deliveryDays: 1, prices: { m_conc: 5700 } },
  { id: 's3', name: 'ООО «ЭлектроСнаб»', rating: 4.7, deliveryDays: 4, prices: { m_cable: 58, m_socket: 295, m_pipe: 395 } },
  {
    id: 's4', name: 'ООО «СтройМаркет Опт»', rating: 4.0, deliveryDays: 2,
    prices: { m_gkl: 415, m_wool: 505, m_tile: 1390, m_plaster: 372, m_paint: 198, m_rebar: 69500, m_conc: 6100 },
  },
  { id: 's5', name: 'ООО «ВентТехно»', rating: 4.4, deliveryDays: 6, prices: { m_duct: 940, m_pipe: 430, m_window: 7900, m_cable: 64 } },
  {
    id: 's6', name: 'ООО «Альфа Снаб»', rating: 3.9, deliveryDays: 5,
    prices: {
      m_rebar: 67800, m_conc: 5850, m_cable: 60, m_socket: 310, m_pipe: 405, m_duct: 990, m_gkl: 430,
      m_wool: 515, m_window: 8100, m_tile: 1430, m_plaster: 380, m_paint: 205,
    },
  },
]

// ---------- Заявки и заказы ----------
const requests: PurchaseRequest[] = [
  {
    id: 'r1', number: 'ЗК-0001', projectId: 'p2', authorId: 'u_for2', responsibleId: 'u_sup', createdAt: '2026-11-03', neededBy: '2026-11-12',
    priority: 'urgent', status: 'ordered', items: [{ materialId: 'm_cable', qty: 1500 }, { materialId: 'm_socket', qty: 300 }],
    comment: 'Для ЭОМ 2–3 этажей', supplierId: 's3',
  },
  {
    id: 'r2', number: 'ЗК-0002', projectId: 'p1', authorId: 'u_for1', responsibleId: 'u_sup', createdAt: '2026-11-08', neededBy: '2026-11-20',
    priority: 'high', status: 'pending', items: [{ materialId: 'm_rebar', qty: 30 }, { materialId: 'm_socket', qty: 200 }],
    comment: 'Корпус 2, перекрытия 14–16 этажей',
  },
  {
    id: 'r3', number: 'ЗК-0003', projectId: 'p3', authorId: 'u_for3', responsibleId: 'u_sup', createdAt: '2026-11-10', neededBy: '2026-11-25',
    priority: 'high', status: 'pending', items: [{ materialId: 'm_duct', qty: 300 }, { materialId: 'm_pipe', qty: 150 }],
    comment: 'Чистые помещения, 2 этаж',
  },
  {
    id: 'r4', number: 'ЗК-0004', projectId: 'p2', authorId: 'u_for2', responsibleId: 'u_sup', createdAt: '2026-10-20', neededBy: '2026-11-02',
    priority: 'normal', status: 'delivered', items: [{ materialId: 'm_gkl', qty: 200 }, { materialId: 'm_plaster', qty: 300 }], supplierId: 's4',
  },
  {
    id: 'r5', number: 'ЗК-0005', projectId: 'p4', authorId: 'u_for2', responsibleId: 'u_sup', createdAt: '2026-11-12', neededBy: '2026-11-26',
    priority: 'normal', status: 'approved', items: [{ materialId: 'm_rebar', qty: 80 }, { materialId: 'm_conc', qty: 120 }],
    comment: 'Фундаментная плита, захватка 3',
  },
  {
    id: 'r6', number: 'ЗК-0006', projectId: 'p2', authorId: 'u_for2', responsibleId: 'u_sup', createdAt: '2026-11-13', neededBy: '2026-11-24',
    priority: 'normal', status: 'draft', items: [{ materialId: 'm_tile', qty: 200 }, { materialId: 'm_pipe', qty: 100 }],
  },
  {
    id: 'r7', number: 'ЗК-0007', projectId: 'p1', authorId: 'u_for1', responsibleId: 'u_sup', createdAt: '2026-10-28', neededBy: '2026-11-15',
    priority: 'normal', status: 'rejected', items: [{ materialId: 'm_window', qty: 40 }],
    rejectReason: 'Объём превышает лимит по смете, уточнить количество с проектировщиками',
  },
  {
    id: 'r8', number: 'ЗК-0008', projectId: 'p3', authorId: 'u_for3', responsibleId: 'u_sup', createdAt: '2026-11-01', neededBy: '2026-11-16',
    priority: 'normal', status: 'ordered', items: [{ materialId: 'm_wool', qty: 200 }, { materialId: 'm_gkl', qty: 150 }], supplierId: 's6',
  },
]

const orders: PurchaseOrder[] = [
  {
    id: 'o1', number: 'ЗАК-0001', requestId: 'r1', projectId: 'p2', supplierId: 's3', createdAt: '2026-11-04', expectedDate: '2026-11-18',
    status: 'shipped', items: [{ materialId: 'm_cable', qty: 1500, price: 58 }, { materialId: 'm_socket', qty: 300, price: 295 }],
  },
  {
    id: 'o2', number: 'ЗАК-0002', requestId: 'r4', projectId: 'p2', supplierId: 's4', createdAt: '2026-10-22', expectedDate: '2026-11-02',
    status: 'delivered', items: [{ materialId: 'm_gkl', qty: 200, price: 415 }, { materialId: 'm_plaster', qty: 300, price: 372 }],
  },
  {
    id: 'o3', number: 'ЗАК-0003', requestId: 'r8', projectId: 'p3', supplierId: 's6', createdAt: '2026-11-03', expectedDate: '2026-11-17',
    status: 'shipped', items: [{ materialId: 'm_wool', qty: 200, price: 515 }, { materialId: 'm_gkl', qty: 150, price: 430 }],
  },
]

// ---------- Документы ----------
const docs: ProjectDoc[] = [
  { id: 'd1', projectId: 'p1', name: 'Договор строительного подряда', type: 'Договор', counterparty: 'ООО «СеверСтройИнвест»', date: '2025-02-20', status: 'signed' },
  { id: 'd2', projectId: 'p1', name: 'КС-2 №14 за октябрь 2026, корпус 1', type: 'Акт КС-2', counterparty: 'ООО «СеверСтройИнвест»', date: '2026-10-31', status: 'unsigned' },
  { id: 'd3', projectId: 'p1', name: 'КС-3 №14 за октябрь 2026', type: 'Справка КС-3', counterparty: 'ООО «СеверСтройИнвест»', date: '2026-10-31', status: 'unsigned' },
  { id: 'd4', projectId: 'p1', name: 'Дополнительное соглашение №3 (изменение графика)', type: 'Допсоглашение', counterparty: 'ООО «СеверСтройИнвест»', date: '2026-09-15', status: 'signed' },
  { id: 'd5', projectId: 'p2', name: 'Контракт на строительство школы', type: 'Договор', counterparty: 'УКС г. Казани', date: '2025-05-12', status: 'signed' },
  { id: 'd6', projectId: 'p2', name: 'КС-2 №16 за октябрь 2026', type: 'Акт КС-2', counterparty: 'УКС г. Казани', date: '2026-10-31', status: 'unsigned' },
  { id: 'd7', projectId: 'p2', name: 'Допсоглашение №2 (перенос сроков)', type: 'Допсоглашение', counterparty: 'УКС г. Казани', date: '2026-11-05', status: 'unsigned' },
  { id: 'd8', projectId: 'p2', name: 'Счёт ЭлектроСнаб №412', type: 'Счёт', counterparty: 'ООО «ЭлектроСнаб»', date: '2026-11-04', status: 'signed' },
  { id: 'd9', projectId: 'p3', name: 'Договор подряда на строительство медцентра', type: 'Договор', counterparty: 'ГК «МедАльянс»', date: '2025-08-30', status: 'signed' },
  { id: 'd10', projectId: 'p3', name: 'Допсоглашение №4 (чистые помещения)', type: 'Допсоглашение', counterparty: 'ГК «МедАльянс»', date: '2026-11-06', status: 'unsigned' },
  { id: 'd11', projectId: 'p3', name: 'КС-2 №12 за октябрь 2026', type: 'Акт КС-2', counterparty: 'ГК «МедАльянс»', date: '2026-10-31', status: 'unsigned' },
  { id: 'd12', projectId: 'p3', name: 'Накладная Альфа Снаб №1873', type: 'Накладная', counterparty: 'ООО «Альфа Снаб»', date: '2026-11-03', status: 'signed' },
  { id: 'd13', projectId: 'p4', name: 'Договор генерального подряда', type: 'Договор', counterparty: 'АО «Атриум Девелопмент»', date: '2026-01-18', status: 'signed' },
  { id: 'd14', projectId: 'p4', name: 'КС-2 №8 за октябрь 2026', type: 'Акт КС-2', counterparty: 'АО «Атриум Девелопмент»', date: '2026-10-31', status: 'unsigned' },
  { id: 'd15', projectId: 'p4', name: 'Акт приёмки шпунтового ограждения', type: 'Акт', counterparty: 'АО «Атриум Девелопмент»', date: '2026-09-20', status: 'signed' },
  { id: 'd16', projectId: 'p4', name: 'Допсоглашение №1 (расширение состава работ)', type: 'Допсоглашение', counterparty: 'АО «Атриум Девелопмент»', date: '2026-10-12', status: 'unsigned' },
]

// ---------- Исполнительная документация: требования и документы ----------
const requirements: ExecRequirement[] = []
const execDocs: ExecDoc[] = []

/** Ключи «непочатых» документов: по ним ассистент отвечает, чего не хватает */
const MISSING = new Set<string>([
  'p2:4:АОСР', 'p2:5:АОСР', 'p2:3:Исполнительная схема', 'p2:6:АОСР',
  'p3:4:АОСР', 'p3:3:Исполнительная схема', 'p3:3:Акт / протокол',
  'p1:4:АОСР', 'p1:5:АОСР', 'p1:3:Акт / протокол',
  'p4:3:АОСР',
])

function stageKindDocs(progress: number): ExecDocKind[] {
  if (progress >= 100) return ['АОСР', 'Исполнительная схема', 'Акт / протокол']
  if (progress > 0) return ['АОСР']
  return []
}

let reqSeq = 0
let docSeq = 0
for (const project of projects) {
  const pStages = stages.filter((s) => s.projectId === project.id)
  pStages.forEach((stage, i) => {
    for (const kind of stageKindDocs(stage.progress)) {
      reqSeq += 1
      const req: ExecRequirement = {
        id: `rq_${reqSeq}`, projectId: project.id, stageId: stage.id, kind,
        title: `${kind}: ${stage.name}, ${stage.section}`,
      }
      requirements.push(req)
      if (MISSING.has(`${project.id}:${i + 1}:${kind}`)) continue
      docSeq += 1
      const done = stage.progress >= 100
      const status = done ? (docSeq % 4 === 0 ? 'review' : 'approved') : (docSeq % 2 === 0 ? 'review' : 'draft')
      const authorId = 'u_pto'
      const date = done ? stage.endDate : '2026-11-05'
      execDocs.push({
        id: `ed_${docSeq}`, projectId: project.id, stageId: stage.id, requirementId: req.id, kind, title: req.title,
        status, createdAt: date, authorId,
        versions: [{
          version: 1, date, authorId, note: 'Первичная версия',
          body: renderExecDocBody({
            kind, project, stage, works: [stage.workType + ': ' + stage.name], date, author: 'Инженер ПТО',
          }),
        }],
      })
    }
  })
  // Реестр и журнал на уровне объекта
  reqSeq += 1
  requirements.push({ id: `rq_${reqSeq}`, projectId: project.id, kind: 'Реестр документации', title: `Реестр исполнительной документации: ${project.name}` })
  docSeq += 1
  execDocs.push({
    id: `ed_${docSeq}`, projectId: project.id, requirementId: `rq_${reqSeq}`, kind: 'Реестр документации',
    title: `Реестр исполнительной документации: ${project.name}`, status: 'approved', createdAt: '2026-10-01', authorId: 'u_pto',
    versions: [{
      version: 1, date: '2026-10-01', authorId: 'u_pto', note: 'Первичная версия',
      body: renderExecDocBody({ kind: 'Реестр документации', project, works: ['Перечень сформирован автоматически по этапам объекта'], date: '2026-10-01', author: 'Инженер ПТО' }),
    }],
  })
  reqSeq += 1
  requirements.push({ id: `rq_${reqSeq}`, projectId: project.id, kind: 'Журнал работ', title: `Общий журнал работ: ${project.name}` })
  docSeq += 1
  execDocs.push({
    id: `ed_${docSeq}`, projectId: project.id, requirementId: `rq_${reqSeq}`, kind: 'Журнал работ',
    title: `Общий журнал работ: ${project.name}`, status: 'review', createdAt: project.startDate, authorId: 'u_pto',
    versions: [{
      version: 1, date: project.startDate, authorId: 'u_pto', note: 'Журнал открыт',
      body: renderExecDocBody({ kind: 'Журнал работ', project, works: ['Начало работ на объекте'], date: project.startDate, author: 'Инженер ПТО' }),
    }],
  })
}

// ---------- База знаний ----------
const kbDocs: KbDoc[] = [
  { id: 'k1', category: 'Нормативная документация', title: 'СП 48.13330 Организация строительства (демо-запись)', addedAt: '2026-05-10', author: 'Инженер ПТО', chunks: 412, indexed: true },
  { id: 'k2', category: 'Нормативная документация', title: 'Требования к исполнительной документации (демо-запись)', addedAt: '2026-05-10', author: 'Инженер ПТО', chunks: 188, indexed: true },
  { id: 'k3', category: 'Проектная документация', title: 'ЖК «Северный»: раздел АР, корпус 1', addedAt: '2026-06-02', author: 'Руководитель проекта №1', chunks: 276, indexed: true },
  { id: 'k4', category: 'Проектная документация', title: 'Школа: раздел ЭОМ', addedAt: '2026-07-14', author: 'Руководитель проекта №2', chunks: 143, indexed: true },
  { id: 'k5', category: 'Сметные нормативы', title: 'Сметные нормативы и индексы, 3 квартал 2026', addedAt: '2026-09-30', author: 'Сметчик', chunks: 530, indexed: true },
  { id: 'k6', category: 'Шаблоны компании', title: 'Шаблон АОСР (внутренний, на утверждении)', addedAt: '2026-08-21', author: 'Инженер ПТО', chunks: 12, indexed: true },
  { id: 'k7', category: 'Договоры', title: 'Типовой договор подряда', addedAt: '2026-04-03', author: 'Карабасов Аслан', chunks: 64, indexed: true },
  { id: 'k8', category: 'История завершённых объектов', title: 'Детский сад на 220 мест, итоговый отчёт', addedAt: '2026-03-18', author: 'Карабасов Аслан', chunks: 97, indexed: true },
  { id: 'k9', category: 'Проверенные решения специалистов', title: 'Норма расхода арматуры на плиту перекрытия', addedAt: '2026-10-08', author: 'Руководитель проекта №1', chunks: 3, indexed: true },
  { id: 'k10', category: 'Проверенные решения специалистов', title: 'Сроки поставки воздуховодов в Екатеринбург', addedAt: '2026-10-19', author: 'Снабженец', chunks: 2, indexed: false },
]

const feedback: AiFeedback[] = [
  {
    id: 'f1', question: 'Какой запас арматуры закладывать на монолитную плиту?',
    answer: 'Запас 2%', verdict: 'corrected', correction: 'Для плит перекрытия закладываем 3% на отходы и нахлёст (проверено руководителем проекта)',
    authorId: 'u_pm1', date: '2026-10-08',
  },
]

// ---------- Прочее ----------
const notifications: Notification[] = [
  { id: 'n1', text: 'Заявка ЗК-0002 (ЖК «Северный») ожидает согласования', date: '2026-11-08', read: false, link: '/procurement', roles: ['director', 'pm', 'admin'] },
  { id: 'n2', text: 'Заявка ЗК-0003 (Медцентр) ожидает согласования', date: '2026-11-10', read: false, link: '/procurement', roles: ['director', 'pm', 'admin'] },
  { id: 'n3', text: 'Заявка ЗК-0005 согласована — выберите поставщика', date: '2026-11-12', read: false, link: '/procurement', roles: ['supply', 'admin'] },
  { id: 'n4', text: 'На складе школы заканчивается кабель ВВГнг', date: '2026-11-13', read: false, link: '/warehouse' },
  { id: 'n5', text: 'АОСР по инженерным сетям школы не подготовлен', date: '2026-11-13', read: false, link: '/pto', roles: ['pto', 'pm', 'director', 'admin'] },
]

const chat: ChatMessage[] = [
  {
    id: 'c0', role: 'assistant', date: '2026-11-14T09:00:00Z',
    text: 'Здравствуйте! Я помощник СтройAI. Отвечаю по данным системы по заранее заданным правилам (демонстрационный алгоритм, не языковая модель). Спросите, например: «Какие объекты отстают от графика?»',
  },
]

const activity: ActivityItem[] = [
  { id: 'a1', date: '2026-11-13', userId: 'u_for2', text: 'Создан черновик заявки ЗК-0006', projectId: 'p2' },
  { id: 'a2', date: '2026-11-12', userId: 'u_for2', text: 'Создана заявка ЗК-0005 (согласована)', projectId: 'p4' },
  { id: 'a3', date: '2026-11-10', userId: 'u_for3', text: 'Создана заявка ЗК-0003', projectId: 'p3' },
]

export function createSeed(): DataState {
  return JSON.parse(
    JSON.stringify({
      users, projects, stages, tasks, materials, warehouses, stock, movements, suppliers, requests, orders,
      estimates: seedEstimates, executionReports: seedExecutionReports(seedEstimates), costCalcs: seedCostCalcs(), qualityDocs: seedQualityDocs(), photos: seedPhotos(), cadFiles: seedCadFiles(), letters: seedLetters(), documents: docs, execDocs, requirements, kbDocs, feedback, notifications, chat, activity,
      cadAdded: [], cadHistory: [],
    }),
  ) as DataState
}
