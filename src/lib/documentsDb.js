// Los documentos (con sus fotos) se guardan en IndexedDB, solo en este dispositivo.
const DB_NAME = 'mi-gestor';
const STORE = 'documents';

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run(mode, action) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = action(tx.objectStore(STORE));
    tx.oncomplete = () => {
      db.close();
      resolve(request?.result);
    };
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const listDocuments = () => run('readonly', (store) => store.getAll());
export const saveDocument = (doc) => run('readwrite', (store) => store.put(doc));
export const deleteDocument = (id) => run('readwrite', (store) => store.delete(id));
export const clearDocuments = () => run('readwrite', (store) => store.clear());
