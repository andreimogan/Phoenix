const DB_NAME = 'city-intel-cache'
const DB_VERSION = 1

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)

    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('kv')) {
        db.createObjectStore('kv')
      }
    }

    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function withStore(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', mode)
    const store = tx.objectStore('kv')
    const result = fn(store)
    tx.oncomplete = () => resolve(result)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

export async function idbGet(key) {
  const db = await openDb()
  return await withStore(db, 'readonly', (store) => {
    return new Promise((resolve, reject) => {
      const req = store.get(key)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  })
}

export async function idbSet(key, value) {
  const db = await openDb()
  return await withStore(db, 'readwrite', (store) => {
    return new Promise((resolve, reject) => {
      const req = store.put(value, key)
      req.onsuccess = () => resolve(true)
      req.onerror = () => reject(req.error)
    })
  })
}

export async function idbDel(key) {
  const db = await openDb()
  return await withStore(db, 'readwrite', (store) => {
    return new Promise((resolve, reject) => {
      const req = store.delete(key)
      req.onsuccess = () => resolve(true)
      req.onerror = () => reject(req.error)
    })
  })
}

export async function idbEntriesByKeyPrefix(prefix) {
  const db = await openDb()
  return await withStore(db, 'readonly', (store) => {
    return new Promise((resolve, reject) => {
      const out = []
      const req = store.openCursor()
      req.onsuccess = () => {
        const cursor = req.result
        if (!cursor) {
          resolve(out)
          return
        }
        const key = cursor.key
        if (typeof key === 'string' && key.startsWith(prefix)) {
          out.push([key, cursor.value])
        }
        cursor.continue()
      }
      req.onerror = () => reject(req.error)
    })
  })
}

