import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** В рабочей версии в браузере хранится только тема; бизнес-данные — на сервере. */
export const useTheme = create<{ theme: 'light' | 'dark'; toggle: () => void }>()(
  persist((set) => ({ theme: 'light', toggle: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })) }), {
    name: 'stroyai-ui',
  }),
)
