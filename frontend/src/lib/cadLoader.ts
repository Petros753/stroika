import { decodeDxf, parseDxf, writeDxf, type Drawing } from '../domain/dxf'
import { demoDrawing } from '../domain/dxfDemo'
import { getBlob } from './blobs'

/** Загрузка версии чертежа: встроенный демо-план или файл из IndexedDB */
export async function loadDrawing(key: string): Promise<Drawing> {
  if (key === 'demo:office') return parseDxf(writeDxf(demoDrawing()))
  const blob = await getBlob(key)
  if (!blob) throw new Error('Файл чертежа хранится в другом браузере (демо: файлы лежат локально)')
  return parseDxf(decodeDxf(await blob.arrayBuffer()))
}
