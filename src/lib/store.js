import { decryptBytes, decryptJson, encryptBytes, encryptJson } from './crypto';
import { sanitizeCategories, sanitizeDocumentMeta, sanitizeMovements, sanitizeNotes } from './validate';

const DB_NAME = 'mi-gestor';
const DOCS = 'documents';
const VAULT = 'vault';
const LEGACY_KEYS = { movements: 'miGestor.movements', notes: 'miGestor.notes', categories: 'miGestor.categories' };

export const EMPTY_STATE = { movements: [], notes: [], categories: { expense: [], income: [] }, budget: null, groups: [], goals: [] };

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DOCS)) db.createObjectStore(DOCS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(VAULT)) db.createObjectStore(VAULT);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run(storeName, mode, action) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const request = action(tx.objectStore(storeName));
    tx.oncomplete = () => {
      db.close();
      resolve(request?.result);
    };
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function encryptDocument(key, { id, images, ...meta }) {
  return {
    id,
    meta: await encryptJson(key, meta),
    images: await Promise.all(
      images.map(async (blob) => ({ type: blob.type, ...(await encryptBytes(key, await blob.arrayBuffer())) }))
    ),
  };
}

async function decryptDocument(key, record) {
  const meta = await decryptJson(key, record.meta);
  const images = await Promise.all(
    record.images.map(async (img) => new Blob([await decryptBytes(key, img)], { type: img.type || 'image/jpeg' }))
  );
  return { id: record.id, ...meta, images };
}

// Todo lo que pasa por aquí se cifra con la clave de datos antes de tocar el disco.
export function createStore(key) {
  let saving = Promise.resolve();
  return {
    async loadState() {
      const box = await run(VAULT, 'readonly', (s) => s.get('state'));
      return box ? decryptJson(key, box) : null;
    },
    // Las escrituras se encadenan para que una versión antigua nunca pise a una nueva.
    saveState(state) {
      saving = saving.catch(() => {}).then(async () => {
        const box = await encryptJson(key, state);
        await run(VAULT, 'readwrite', (s) => s.put(box, 'state'));
      });
      return saving;
    },
    async listDocuments() {
      const records = await run(DOCS, 'readonly', (s) => s.getAll());
      return Promise.all(records.filter((r) => r.meta).map((r) => decryptDocument(key, r)));
    },
    async saveDocument(doc) {
      const record = await encryptDocument(key, doc);
      await run(DOCS, 'readwrite', (s) => s.put(record));
    },
    deleteDocument: (id) => run(DOCS, 'readwrite', (s) => s.delete(id)),
    clearDocuments: () => run(DOCS, 'readwrite', (s) => s.clear()),
  };
}

function readLegacyJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}

// Abre la sesión y cifra los datos que versiones anteriores guardaban sin cifrar.
export async function openSession(key) {
  const store = createStore(key);
  let state = await store.loadState();

  const legacy = Object.fromEntries(Object.entries(LEGACY_KEYS).map(([name, k]) => [name, readLegacyJson(k)]));
  const legacyDocs = (await run(DOCS, 'readonly', (s) => s.getAll())).filter((r) => !r.meta);
  const hasLegacy = Object.values(legacy).some((v) => v !== null) || legacyDocs.length > 0;

  if (hasLegacy) {
    if (!state) {
      state = {
        movements: sanitizeMovements(legacy.movements),
        notes: sanitizeNotes(legacy.notes),
        categories: sanitizeCategories(legacy.categories),
      };
    }
    await store.saveState(state);
    for (const doc of legacyDocs) {
      const meta = sanitizeDocumentMeta(doc);
      const images = (doc.images ?? []).filter((b) => b instanceof Blob);
      if (meta) await store.saveDocument({ id: doc.id, ...meta, images });
      else await store.deleteDocument(doc.id);
    }
    Object.values(LEGACY_KEYS).forEach((k) => localStorage.removeItem(k));
  }

  return { store, state: state ?? EMPTY_STATE };
}

// Borra todos los datos de la app en este dispositivo.
export async function wipeAllData() {
  await run(DOCS, 'readwrite', (s) => s.clear());
  await run(VAULT, 'readwrite', (s) => s.clear());
  Object.values(LEGACY_KEYS).forEach((k) => localStorage.removeItem(k));
  localStorage.removeItem('miGestor.notified');
}
