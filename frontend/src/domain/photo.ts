import type { PhotoOp } from './types'

/** Обработка фото: только технические правки (кадрирование, поворот, пометки, штамп, размытие, яркость).
 *  Содержимое снимка не генерируется и не дорисовывается — это важно для исполнительной документации. */

export const DEMO_SCENES = { rebar: 'Армирование плиты', pit: 'Котлован и шпунт', cable: 'Кабельные трассы', facade: 'Фасад и окна', duct: 'Воздуховоды' } as const
export type DemoScene = keyof typeof DEMO_SCENES

export function describeOp(op: PhotoOp): string {
  switch (op.t) {
    case 'rotate': return op.deg === 90 ? 'Поворот на 90° вправо' : 'Поворот на 90° влево'
    case 'crop': return 'Кадрирование'
    case 'arrow': return 'Стрелка-указатель'
    case 'rect': return 'Рамка выделения'
    case 'text': return `Подпись «${op.text}»`
    case 'blur': return 'Размытие области (персональные данные / номера)'
    case 'stamp': return `Штамп: ${op.text}`
    case 'adjust': return `Яркость ${op.brightness}%, контраст ${op.contrast}%`
  }
}

/** Детерминированный генератор «шума» для демо-снимков */
function rng(seed: number) { let s = seed; return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646 }

/** Демо-снимок: процедурная сцена (вместо реальной фотографии в демо-данных) */
export function drawDemoScene(scene: DemoScene, w = 1200, h = 800): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const g = c.getContext('2d')!
  const r = rng(scene.length * 7919 + 13)
  const sky = (top: string, bottom: string, y = h * 0.45) => { const gr = g.createLinearGradient(0, 0, 0, y); gr.addColorStop(0, top); gr.addColorStop(1, bottom); g.fillStyle = gr; g.fillRect(0, 0, w, y) }
  if (scene === 'rebar') {
    g.fillStyle = '#8d8a84'; g.fillRect(0, 0, w, h)
    for (let i = 0; i < 26; i++) { // перспективная сетка арматуры
      const t = i / 25, y = h * (0.08 + 0.92 * t * t)
      g.strokeStyle = '#6b3f22'; g.lineWidth = 2 + t * 7; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke()
    }
    for (let i = -14; i <= 14; i++) {
      g.strokeStyle = '#7a4727'; g.lineWidth = 6; g.beginPath(); g.moveTo(w / 2 + i * 14, 0); g.lineTo(w / 2 + i * 95, h); g.stroke()
    }
    g.fillStyle = '#c9c2b5'; for (let i = 0; i < 40; i++) { g.fillRect(r() * w, h * 0.4 + r() * h * 0.6, 14, 10) } // фиксаторы
  } else if (scene === 'pit') {
    sky('#9cc3e4', '#dfe9f1')
    g.fillStyle = '#7b6a55'; g.fillRect(0, h * 0.45, w, h * 0.55)
    g.fillStyle = '#5d5145'; g.beginPath(); g.moveTo(w * 0.12, h * 0.55); g.lineTo(w * 0.88, h * 0.55); g.lineTo(w, h); g.lineTo(0, h); g.fill()
    for (let x = 0; x < w; x += 22) { g.fillStyle = x % 44 ? '#3f4a52' : '#56626b'; g.fillRect(x, h * 0.38, 20, h * 0.2) } // шпунт
    g.fillStyle = '#e0a526'; g.fillRect(w * 0.62, h * 0.6, 170, 70); g.fillRect(w * 0.68, h * 0.5, 60, 50) // экскаватор
    g.strokeStyle = '#e0a526'; g.lineWidth = 14; g.beginPath(); g.moveTo(w * 0.72, h * 0.52); g.lineTo(w * 0.55, h * 0.42); g.lineTo(w * 0.5, h * 0.66); g.stroke()
  } else if (scene === 'cable') {
    g.fillStyle = '#b9b4aa'; g.fillRect(0, 0, w, h)
    g.fillStyle = '#d7d2c8'; g.fillRect(0, 0, w, h * 0.25) // потолок
    for (let k = 0; k < 3; k++) {
      const y = h * (0.3 + k * 0.08); g.fillStyle = '#8f969b'; g.fillRect(0, y, w, 18)
      for (let j = 0; j < 7; j++) { g.strokeStyle = ['#222', '#555', '#f2f2f2'][j % 3]; g.lineWidth = 5; g.beginPath(); g.moveTo(0, y + 4 + j * 2); g.lineTo(w, y + 4 + j * 2 + (r() - 0.5) * 4); g.stroke() }
    }
    for (let x = 80; x < w; x += 260) { g.fillStyle = '#f4f4f0'; g.fillRect(x, h * 0.7, 46, 46); g.fillStyle = '#bbb'; g.beginPath(); g.arc(x + 23, h * 0.7 + 23, 12, 0, 7); g.fill() } // розетки
  } else if (scene === 'facade') {
    sky('#86b1d6', '#cfe0ee', h)
    g.fillStyle = '#c8b9a3'; g.fillRect(w * 0.1, h * 0.12, w * 0.8, h * 0.88)
    for (let fy = 0; fy < 6; fy++) for (let fx = 0; fx < 7; fx++) {
      const x = w * 0.14 + fx * w * 0.105, y = h * 0.17 + fy * h * 0.14
      g.fillStyle = r() > 0.25 ? '#3d5a73' : '#6f6a60'; g.fillRect(x, y, w * 0.07, h * 0.09)
      g.strokeStyle = '#f2f2f2'; g.lineWidth = 3; g.strokeRect(x, y, w * 0.07, h * 0.09)
    }
    g.strokeStyle = '#9aa0a5'; g.lineWidth = 3; for (let x = w * 0.05; x < w; x += 60) { g.beginPath(); g.moveTo(x, h * 0.1); g.lineTo(x, h); g.stroke() } // леса
  } else {
    g.fillStyle = '#c4c0b8'; g.fillRect(0, 0, w, h)
    g.fillStyle = '#e1ddd5'; g.fillRect(0, 0, w, h * 0.35)
    for (let k = 0; k < 2; k++) {
      const y = h * (0.12 + k * 0.2); const gr = g.createLinearGradient(0, y, 0, y + 70); gr.addColorStop(0, '#e9ecef'); gr.addColorStop(0.5, '#a9b0b6'); gr.addColorStop(1, '#ccd2d7')
      g.fillStyle = gr; g.fillRect(0, y, w, 70); for (let x = 0; x < w; x += 120) { g.fillStyle = '#8a9198'; g.fillRect(x, y, 6, 70) }
      for (let x = 60; x < w; x += 240) { g.strokeStyle = '#555'; g.lineWidth = 4; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, y); g.stroke() } // подвесы
    }
  }
  const img = g.getImageData(0, 0, w, h) // зерно, чтобы походило на фото
  for (let i = 0; i < img.data.length; i += 4) { const n = (r() - 0.5) * 22; img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n }
  g.putImageData(img, 0, 0)
  return c
}

function clone(src: HTMLCanvasElement, w = src.width, h = src.height) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c }

/** Применение одной правки: возвращает новый холст (исходный не меняется) */
export function applyOp(src: HTMLCanvasElement, op: PhotoOp): HTMLCanvasElement {
  const W = src.width, H = src.height
  if (op.t === 'rotate') {
    const c = clone(src, H, W); const g = c.getContext('2d')!
    g.translate(H / 2, W / 2); g.rotate((op.deg * Math.PI) / 180); g.drawImage(src, -W / 2, -H / 2); return c
  }
  if (op.t === 'crop') {
    const sx = Math.round(op.x * W), sy = Math.round(op.y * H), sw = Math.max(1, Math.round(op.w * W)), sh = Math.max(1, Math.round(op.h * H))
    const c = clone(src, sw, sh); c.getContext('2d')!.drawImage(src, sx, sy, sw, sh, 0, 0, sw, sh); return c
  }
  const c = clone(src); const g = c.getContext('2d')!; g.drawImage(src, 0, 0)
  const lw = Math.max(3, W / 220)
  switch (op.t) {
    case 'arrow': {
      const x1 = op.x1 * W, y1 = op.y1 * H, x2 = op.x2 * W, y2 = op.y2 * H, a = Math.atan2(y2 - y1, x2 - x1), head = lw * 5
      g.strokeStyle = op.color; g.fillStyle = op.color; g.lineWidth = lw; g.lineCap = 'round'
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2 - Math.cos(a) * head * 0.6, y2 - Math.sin(a) * head * 0.6); g.stroke()
      g.beginPath(); g.moveTo(x2, y2); g.lineTo(x2 - head * Math.cos(a - 0.45), y2 - head * Math.sin(a - 0.45)); g.lineTo(x2 - head * Math.cos(a + 0.45), y2 - head * Math.sin(a + 0.45)); g.closePath(); g.fill()
      break
    }
    case 'rect': g.strokeStyle = op.color; g.lineWidth = lw; g.strokeRect(op.x * W, op.y * H, op.w * W, op.h * H); break
    case 'text': {
      const fs = Math.round(W / 32); g.font = `600 ${fs}px Arial, sans-serif`; g.textBaseline = 'top'
      const tw = g.measureText(op.text).width; g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(op.x * W - 6, op.y * H - 4, tw + 12, fs + 10)
      g.fillStyle = op.color; g.fillText(op.text, op.x * W, op.y * H); break
    }
    case 'blur': { // пикселизация: необратимо скрывает детали (номера, лица)
      const x = Math.round(op.x * W), y = Math.round(op.y * H), w = Math.max(1, Math.round(op.w * W)), h = Math.max(1, Math.round(op.h * H))
      const cell = Math.max(8, Math.round(W / 60)), small = clone(src, Math.max(1, Math.ceil(w / cell)), Math.max(1, Math.ceil(h / cell)))
      small.getContext('2d')!.drawImage(src, x, y, w, h, 0, 0, small.width, small.height)
      g.imageSmoothingEnabled = false; g.drawImage(small, 0, 0, small.width, small.height, x, y, w, h); g.imageSmoothingEnabled = true; break
    }
    case 'stamp': {
      const fs = Math.round(Math.min(W, H) / 26), pad = fs * 0.6
      g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(0, H - fs - pad * 2, W, fs + pad * 2)
      g.font = `600 ${fs}px Arial, sans-serif`; g.fillStyle = '#ffd23f'; g.textBaseline = 'middle'; g.fillText(op.text, pad, H - fs / 2 - pad); break
    }
    case 'adjust': {
      const img = g.getImageData(0, 0, W, H), d = img.data, b = op.brightness / 100, k = op.contrast / 100
      for (let i = 0; i < d.length; i += 4) for (let j = 0; j < 3; j++) d[i + j] = Math.max(0, Math.min(255, ((d[i + j] * b) - 128) * k + 128))
      g.putImageData(img, 0, 0); break
    }
  }
  return c
}

export const applyOps = (base: HTMLCanvasElement, ops: PhotoOp[]) => ops.reduce(applyOp, base)

/** Уменьшение загруженного снимка (экономия места) */
export async function downscale(file: Blob, max = 2000): Promise<Blob> {
  const bmp = await createImageBitmap(file)
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k)
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('toBlob'))), 'image/jpeg', 0.85))
}
