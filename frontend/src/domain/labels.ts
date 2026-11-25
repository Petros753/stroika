import type {
  DocStatus, ExecDocStatus, OrderStatus, Permission, Priority, ProjectStatus, RequestStatus, Role, TaskStatus,
} from './types'

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Администратор',
  director: 'Директор',
  pm: 'Руководитель проекта',
  pto: 'Инженер ПТО',
  estimator: 'Сметчик',
  supply: 'Снабженец',
  foreman: 'Прораб',
  accountant: 'Бухгалтер',
}

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  planning: 'Планирование',
  in_progress: 'В работе',
  paused: 'Приостановлен',
  completed: 'Завершён',
}

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'К выполнению',
  in_progress: 'В работе',
  done: 'Выполнено',
}

export const PRIORITY_LABEL: Record<Priority, string> = {
  low: 'Низкий',
  normal: 'Обычный',
  high: 'Высокий',
  urgent: 'Срочный',
}

export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  draft: 'Черновик',
  pending: 'На согласовании',
  approved: 'Согласована',
  rejected: 'Отклонена',
  ordered: 'Заказ размещён',
  delivered: 'Поставлена на склад',
}

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  placed: 'Размещён',
  shipped: 'В пути',
  delivered: 'Доставлен',
}

export const DOC_STATUS_LABEL: Record<DocStatus, string> = {
  signed: 'Подписан',
  unsigned: 'Не подписан',
}

export const EXEC_STATUS_LABEL: Record<ExecDocStatus, string> = {
  draft: 'Черновик',
  review: 'На согласовании',
  approved: 'Согласован',
  rejected: 'Возвращён на доработку',
}

export type Tone = 'slate' | 'blue' | 'green' | 'amber' | 'red' | 'violet'

export const PROJECT_STATUS_TONE: Record<ProjectStatus, Tone> = {
  planning: 'slate', in_progress: 'blue', paused: 'amber', completed: 'green',
}
export const PRIORITY_TONE: Record<Priority, Tone> = {
  low: 'slate', normal: 'blue', high: 'amber', urgent: 'red',
}
export const REQUEST_STATUS_TONE: Record<RequestStatus, Tone> = {
  draft: 'slate', pending: 'amber', approved: 'blue', rejected: 'red', ordered: 'violet', delivered: 'green',
}
export const TASK_STATUS_TONE: Record<TaskStatus, Tone> = {
  todo: 'slate', in_progress: 'blue', done: 'green',
}
export const EXEC_STATUS_TONE: Record<ExecDocStatus, Tone> = {
  draft: 'slate', review: 'amber', approved: 'green', rejected: 'red',
}

export const PERMISSION_LABEL: Record<Permission, string> = {
  'project.create': 'Создание объектов',
  'project.edit': 'Редактирование объектов',
  'stage.edit': 'Этапы работ',
  'task.edit': 'Задачи',
  'request.create': 'Создание заявок',
  'request.approve': 'Согласование заявок',
  'request.supplier': 'Выбор поставщика',
  'order.receive': 'Приёмка заказов',
  'stock.move': 'Движения по складу',
  'estimate.upload': 'Загрузка смет',
  'estimate.compare': 'Сверка смет',
  'pto.create': 'Создание документов ИД',
  'pto.approve': 'Согласование ИД',
  'kb.manage': 'Управление базой знаний',
  'cad.edit': 'Правка чертежей',
  'employees.manage': 'Управление сотрудниками',
  'finance.view': 'Финансовые показатели',
  'docs.sign': 'Подписание документов',
  'execution.edit': 'Внесение объёмов выполнения (КС-2)',
  'execution.approve': 'Подписание КС-2/КС-3',
  'costing.edit': 'Расчёт себестоимости новых объектов',
  'mail.draft': 'Подготовка ответов на письма',
  'mail.send': 'Согласование и отправка писем',
}
