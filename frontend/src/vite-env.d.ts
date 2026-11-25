/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 'demo' — прототип на localStorage с демо-данными; иначе — рабочая версия на API */
  readonly VITE_APP_MODE?: string
  /** Разделы, включённые в рабочей сборке (через запятую). Этап 1: employees */
  readonly VITE_ENABLED_SECTIONS?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
