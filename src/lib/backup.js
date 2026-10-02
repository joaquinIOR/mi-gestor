import { decryptJson, deriveKey, encryptJson, fromBase64, KDF_ITERATIONS, randomBytes, toBase64 } from './crypto';
import { todayKey } from './dates';
import { blobToDataUrl } from './images';
import { sanitizeGroups } from './shared';
import { sanitizeBudget, sanitizeCategories, sanitizeDocuments, sanitizeMovements, sanitizeNotes } from './validate';

const APP_ID = 'mi-gestor';
const MAX_FILE_BYTES = 150 * 1024 * 1024;
export const MIN_BACKUP_PASSWORD = 8;

// La copia siempre se cifra con una contraseña propia (AES-GCM + PBKDF2).
export async function exportBackup(store, state, password) {
  const documents = await Promise.all(
    (await store.listDocuments()).map(async ({ images, ...meta }) => ({
      ...meta,
      images: await Promise.all(images.map(blobToDataUrl)),
    }))
  );
  const salt = randomBytes(16);
  const box = await encryptJson(await deriveKey(password, salt), { ...state, documents });
  const file = {
    app: APP_ID,
    version: 2,
    encrypted: true,
    kdf: { name: 'PBKDF2-SHA256', salt: toBase64(salt), iterations: KDF_ITERATIONS },
    cipher: 'AES-GCM-256',
    iv: toBase64(box.iv),
    data: toBase64(box.data),
  };

  const url = URL.createObjectURL(new Blob([JSON.stringify(file)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `mi-gestor-${todayKey()}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function readBackupFile(file) {
  if (file.size > MAX_FILE_BYTES) throw new Error('El archivo es demasiado grande.');
  let json;
  try {
    json = JSON.parse(await file.text());
  } catch {
    throw new Error('El archivo no es una copia válida.');
  }
  if (json?.app !== APP_ID) throw new Error('El archivo no es una copia de Mi Gestor.');
  return json;
}

export const isEncryptedBackup = (json) => json.encrypted === true;

// Descifra (si hace falta) y valida una copia antes de usarla.
export async function openBackup(json, password) {
  let payload = json;
  if (isEncryptedBackup(json)) {
    const iterations = Number(json.kdf?.iterations);
    // Un número de iteraciones absurdo podría colgar la app: se rechaza.
    if (!(iterations >= 100000 && iterations <= 5000000)) throw new Error('La copia está dañada.');
    try {
      const key = await deriveKey(password, fromBase64(json.kdf.salt), iterations);
      payload = await decryptJson(key, { iv: fromBase64(json.iv), data: fromBase64(json.data) });
    } catch {
      throw new Error('Contraseña incorrecta o archivo dañado.');
    }
  }
  return {
    movements: sanitizeMovements(payload.movements),
    notes: sanitizeNotes(payload.notes),
    categories: sanitizeCategories(payload.categories),
    budget: sanitizeBudget(payload.budget),
    groups: sanitizeGroups(payload.groups),
    documents: sanitizeDocuments(payload.documents),
  };
}
