import { create } from 'zustand'
import { useEffect } from 'react'
import { CheckCircle2, AlertTriangle, Info } from 'lucide-react'

interface ToastItem { id: number; text: string; kind: 'ok' | 'error' | 'info' }
interface ToastState { items: ToastItem[]; push: (text: string, kind?: ToastItem['kind']) => void; drop: (id: number) => void }

let seq = 0
export const useToast = create<ToastState>((set) => ({
  items: [],
  push: (text, kind = 'ok') => set((s) => ({ items: [...s.items, { id: ++seq, text, kind }] })),
  drop: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
}))

export const toast = {
  ok: (t: string) => useToast.getState().push(t, 'ok'),
  error: (t: string) => useToast.getState().push(t, 'error'),
  info: (t: string) => useToast.getState().push(t, 'info'),
}

function Item({ item }: { item: ToastItem }) {
  const drop = useToast((s) => s.drop)
  useEffect(() => {
    const t = setTimeout(() => drop(item.id), 3500)
    return () => clearTimeout(t)
  }, [item.id, drop])
  const Icon = item.kind === 'ok' ? CheckCircle2 : item.kind === 'error' ? AlertTriangle : Info
  const color = item.kind === 'ok' ? 'text-emerald-600' : item.kind === 'error' ? 'text-red-600' : 'text-brand-600'
  return (
    <div className="flex max-w-sm items-start gap-2 rounded-lg border bg-white px-3 py-2 text-sm shadow-lg dark:bg-slate-900">
      <Icon size={18} className={color + ' mt-0.5 shrink-0'} />
      <span>{item.text}</span>
    </div>
  )
}

export function Toaster() {
  const items = useToast((s) => s.items)
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
      {items.map((i) => (
        <div key={i.id} className="pointer-events-auto"><Item item={i} /></div>
      ))}
    </div>
  )
}
