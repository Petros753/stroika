import type { Permission, Role, SectionKey } from './types'

/** Единая матрица прав. В рабочей версии переезжает в RBAC на бэкенде (FastAPI + PostgreSQL),
 *  а фронтенд получает её из /me/permissions. */

export const SECTION_ACCESS: Record<Role, SectionKey[]> = {
  admin: ['dashboard', 'projects', 'cad', 'estimates', 'execution', 'costing', 'mail', 'procurement', 'warehouse', 'pto', 'assistant', 'knowledge', 'employees'],
  director: ['dashboard', 'projects', 'cad', 'estimates', 'execution', 'costing', 'mail', 'procurement', 'warehouse', 'pto', 'assistant', 'knowledge', 'employees'],
  pm: ['dashboard', 'projects', 'cad', 'estimates', 'execution', 'costing', 'mail', 'procurement', 'warehouse', 'pto', 'assistant', 'knowledge'],
  pto: ['projects', 'cad', 'execution', 'pto', 'mail', 'assistant', 'knowledge'],
  estimator: ['projects', 'estimates', 'execution', 'costing', 'mail', 'assistant', 'knowledge'],
  supply: ['projects', 'procurement', 'warehouse', 'assistant'],
  foreman: ['projects', 'cad', 'execution', 'procurement', 'warehouse', 'pto', 'assistant'],
  accountant: ['dashboard', 'projects', 'estimates', 'execution', 'costing', 'mail', 'procurement', 'warehouse'],
}

export const PERMISSIONS: Record<Role, Permission[]> = {
  admin: [
    'project.create', 'project.edit', 'stage.edit', 'task.edit', 'request.create', 'request.approve', 'request.supplier',
    'order.receive', 'stock.move', 'estimate.upload', 'estimate.compare', 'pto.create', 'pto.approve', 'kb.manage',
    'cad.edit', 'employees.manage', 'finance.view', 'docs.sign', 'execution.edit', 'execution.approve', 'costing.edit', 'mail.draft', 'mail.send',
  ],
  director: [
    'project.create', 'project.edit', 'stage.edit', 'task.edit', 'request.approve', 'estimate.compare', 'pto.approve',
    'kb.manage', 'cad.edit', 'pto.create', 'employees.manage', 'finance.view', 'docs.sign', 'execution.approve', 'costing.edit', 'mail.draft', 'mail.send',
  ],
  pm: [
    'project.edit', 'stage.edit', 'task.edit', 'request.create', 'request.approve', 'estimate.compare', 'pto.approve',
    'cad.edit', 'pto.create', 'finance.view', 'docs.sign', 'execution.edit', 'execution.approve', 'costing.edit', 'mail.draft', 'mail.send',
  ],
  pto: ['task.edit', 'pto.create', 'cad.edit', 'kb.manage', 'execution.edit', 'mail.draft'],
  estimator: ['estimate.upload', 'estimate.compare', 'kb.manage', 'finance.view', 'execution.edit', 'costing.edit', 'mail.draft'],
  supply: ['request.supplier', 'order.receive', 'stock.move', 'request.create'],
  foreman: ['task.edit', 'stage.edit', 'request.create', 'stock.move', 'pto.create', 'execution.edit'],
  accountant: ['finance.view', 'docs.sign'],
}

export function can(role: Role, perm: Permission): boolean {
  return PERMISSIONS[role].includes(perm)
}

export function canSee(role: Role, section: SectionKey): boolean {
  return SECTION_ACCESS[role].includes(section)
}

/** Роли, которые видят все объекты независимо от назначения */
export const ALL_PROJECTS_ROLES: Role[] = ['admin', 'director', 'accountant']

export const SECTION_PATH: Record<SectionKey, string> = {
  dashboard: '/',
  projects: '/projects',
  cad: '/cad',
  estimates: '/estimates',
  execution: '/execution',
  costing: '/costing',
  mail: '/mail',
  procurement: '/procurement',
  warehouse: '/warehouse',
  pto: '/pto',
  assistant: '/assistant',
  knowledge: '/knowledge',
  employees: '/employees',
}

export const SECTION_LABEL: Record<SectionKey, string> = {
  dashboard: 'Главная панель',
  projects: 'Проекты',
  cad: 'AI CAD',
  estimates: 'Сметы',
  execution: 'Выполнение КС-2/КС-3',
  costing: 'Себестоимость',
  mail: 'Переписка',
  procurement: 'Снабжение',
  warehouse: 'Склад',
  pto: 'Исполнительная документация',
  assistant: 'AI-ассистент',
  knowledge: 'База знаний',
  employees: 'Сотрудники и права',
}
