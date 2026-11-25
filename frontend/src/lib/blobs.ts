/** Хранилище файлов в IndexedDB браузера (фото): localStorage для картинок мал. В рабочей версии — S3. */
const DB = 'stroyai-files'
const STORE = 'files'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(STORE)
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}
export const putBlob = (key: string, blob: Blob) => tx('readwrite', (s) => s.put(blob, key)).then(() => undefined)
export const getBlob = (key: string) => tx<Blob | undefined>('readonly', (s) => s.get(key))
export const delBlob = (key: string) => tx('readwrite', (s) => s.delete(key)).then(() => undefined)
