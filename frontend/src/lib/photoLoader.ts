import { applyOps, drawDemoScene, type DemoScene } from '../domain/photo'
import { getBlob } from './blobs'
import type { PhotoOp } from '../domain/types'

/** Загрузка оригинала фото в холст (с кэшем) и рендер версии */
const cache = new Map<string, Promise<HTMLCanvasElement>>()

export function loadBase(src: string): Promise<HTMLCanvasElement> {
  let p = cache.get(src)
  if (!p) {
    p = (async () => {
      if (src.startsWith('demo:')) return drawDemoScene(src.slice(5) as DemoScene)
      const blob = await getBlob(src.slice(4))
      if (!blob) throw new Error('Файл фото не найден в этом браузере')
      const bmp = await createImageBitmap(blob)
      const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height
      c.getContext('2d')!.drawImage(bmp, 0, 0)
      return c
    })()
    cache.set(src, p)
    p.catch(() => cache.delete(src))
  }
  return p
}

const thumbs = new Map<string, string>()
export async function thumbnail(src: string, ops: PhotoOp[], width = 360): Promise<string> {
  const key = src + JSON.stringify(ops)
  const hit = thumbs.get(key)
  if (hit) return hit
  const full = applyOps(await loadBase(src), ops)
  const c = document.createElement('canvas'); c.width = width; c.height = Math.round((full.height / full.width) * width)
  c.getContext('2d')!.drawImage(full, 0, 0, c.width, c.height)
  const url = c.toDataURL('image/jpeg', 0.8)
  thumbs.set(key, url)
  return url
}

export function downloadCanvas(c: HTMLCanvasElement, filename: string) {
  c.toBlob((b) => {
    if (!b) return
    const url = URL.createObjectURL(b)
    const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }, 'image/jpeg', 0.9)
}
