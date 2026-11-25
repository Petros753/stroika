/** Генерирует shared/permissions.json из src/domain/permissions.ts — единый источник прав для фронтенда и бэкенда.
 *  Запуск: npx tsx scripts/gen-permissions.ts (из папки frontend) */
import { writeFileSync } from 'node:fs'
import { ALL_PROJECTS_ROLES, PERMISSIONS, SECTION_ACCESS, SECTION_PATH, SECTION_LABEL } from '../src/domain/permissions'
import { ROLE_LABEL, PERMISSION_LABEL } from '../src/domain/labels'

const out = { roles: ROLE_LABEL, sections: SECTION_ACCESS, permissions: PERMISSIONS, allProjectsRoles: ALL_PROJECTS_ROLES, sectionPath: SECTION_PATH, sectionLabel: SECTION_LABEL, permissionLabel: PERMISSION_LABEL }
writeFileSync(new URL('../../shared/permissions.json', import.meta.url), JSON.stringify(out, null, 2) + '\n')
console.log('shared/permissions.json updated')
