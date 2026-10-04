import { decryptBytes, decryptJson, encryptBytes, encryptJson } from './crypto';
import { sanitizeCategories, sanitizeDocumentMeta, sanitizeMovements, sanitizeNotes } from './validate';

const DB_NAME = 'mi-gestor';
const DOCS = 'documents';
const VAULT = 'vault';
const LEGACY_KEYS = { movements: 'miGestor.movements', notes: 'miGestor.notes', categories: 'miGestor.categories' };

export const EMPTY_STATE = { movements: [], notes: [], categories: { expense: [], income: [] }, budget: null, groups: [], goals: [], wallet: null };

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DOCS)) db.createObjectStore(DOCS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(VAULT)) db.createObjectStore(VAULT);
    };
    request.onsuccess = () => {
      // Si otra pestaña actualiza la base de datos, esta conexión se cierra para no bloquearla.
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
  });
}

async function run(storeNames, mode, action) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    let tx;
    let request;
    const fail = (e) => {
      db.close();
      reject(tx?.error ?? e?.target?.error ?? new Error('No se pudo acceder a los datos de este teléfono.'));
    };
    try {
      tx = db.transaction(storeNames, mode);
      request = action(Array.isArray(storeNames) ? tx : tx.objectStore(storeNames));
    } catch (err) {
      db.close();
      reject(err);
      return;
    }
    tx.oncomplete = () => {
      db.close();
      resolve(request?.result);
    };
    tx.onerror = fail;
    tx.onabort = fail;
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
    // Restaurar una copia: todo (datos y documentos) se guarda en una sola operación; si algo falla
    // (por ejemplo, falta espacio), no cambia nada.
    replaceAll(state, documents) {
      saving = saving.catch(() => {}).then(async () => {
        const records = [];
        for (const doc of documents) records.push(await encryptDocument(key, doc));
        const box = await encryptJson(key, state);
        await run([DOCS, VAULT], 'readwrite', (tx) => {
          const docs = tx.objectStore(DOCS);
          docs.clear();
          records.forEach((r) => docs.put(r));
          tx.objectStore(VAULT).put(box, 'state');
        });
      });
      return saving;
    },
    countDocuments: () => run(DOCS, 'readonly', (s) => s.count()),
    // Solo los datos de los documentos (sin descifrar las fotos): para avisar vencimientos.
    async listDocumentMeta() {
      const records = await run(DOCS, 'readonly', (s) => s.getAll());
      return Promise.all(records.filter((r) => r.meta).map(async (r) => ({ id: r.id, ...(await decryptJson(key, r.meta)) })));
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
    // Recordatorios ya mostrados (cifrado: incluye identificadores y fechas de pago).
    async loadNotified() {
      const box = await run(VAULT, 'readonly', (s) => s.get('notified'));
      return box ? decryptJson(key, box).catch(() => ({})) : {};
    },
    async saveNotified(items) {
      const box = await encryptJson(key, items);
      await run(VAULT, 'readwrite', (s) => s.put(box, 'notified'));
    },
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
  // Los documentos sin cifrar de versiones antiguas se buscan una sola vez (no hace falta leer todas las fotos en cada desbloqueo).
  const migrated = await run(VAULT, 'readonly', (s) => s.get('legacyDone'));
  const legacyDocs = migrated ? [] : (await run(DOCS, 'readonly', (s) => s.getAll())).filter((r) => !r.meta);
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
  if (!migrated) await run(VAULT, 'readwrite', (s) => s.put(1, 'legacyDone'));

  return { store, state: state ?? EMPTY_STATE };
}

// ¿Quedaron datos cifrados de una instalación anterior (por ejemplo, si se borró la bóveda del navegador)?
// Sin su código no se pueden abrir; los documentos antiguos sin cifrar no cuentan (se cifran al crear el código).
export async function hasEncryptedData() {
  const [states, docs] = await Promise.all([run(VAULT, 'readonly', (s) => s.count('state')), run(DOCS, 'readonly', (s) => s.getAll())]);
  return states > 0 || docs.some((r) => r.meta);
}

// Borra todos los datos de la app en este dispositivo.
export async function wipeAllData() {
  // Este teléfono deja de recibir avisos del grupo (el servidor borra la suscripción al ver que ya no existe).
  // (sin esperar a la red: el borrado no se demora por esto)
  navigator.serviceWorker
    ?.getRegistration()
    .then((reg) => reg?.pushManager?.getSubscription())
    .then((sub) => sub?.unsubscribe())
    .catch(() => {});
  await run(DOCS, 'readwrite', (s) => s.clear());
  await run(VAULT, 'readwrite', (s) => s.clear());
  Object.values(LEGACY_KEYS).forEach((k) => localStorage.removeItem(k));
  localStorage.removeItem('miGestor.notified');
}
