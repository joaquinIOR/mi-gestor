import { decryptJson, deriveKey, encryptJson, fromBase64, KDF_ITERATIONS, randomBytes, toBase64 } from './crypto';
import { todayKey } from './dates';
import { blobToDataUrl } from './images';
import { sanitizeGoals } from './goals';
import { sanitizeGroups } from './shared';
import { sanitizeSettings } from './settings';
import { MAX_DOCUMENTS, sanitizeBudget, sanitizeCategories, sanitizeDocuments, sanitizeMovements, sanitizeNotes, sanitizeWallet } from './validate';

const APP_ID = 'mi-gestor';
const MAX_FILE_BYTES = 150 * 1024 * 1024;
export const MIN_BACKUP_PASSWORD = 8;

// Descarga un archivo. El enlace temporal se libera después de un minuto (en teléfonos lentos la
// descarga puede tardar en empezar).
export function downloadFile(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// La copia siempre se cifra con una contraseña propia (AES-GCM + PBKDF2).
export async function exportBackup(store, state, password) {
  const documents = await Promise.all(
    (await store.listDocuments()).map(async ({ images, ...meta }) => ({
      ...meta,
      images: await Promise.all(images.map(blobToDataUrl)),
    }))
  );
  if (documents.length > MAX_DOCUMENTS) throw new Error(`La copia admite hasta ${MAX_DOCUMENTS} documentos. Borra algunos antes de copiar.`);
  const salt = randomBytes(16);
  // La fecha de la copia va cifrada, junto con los datos.
  const box = await encryptJson(await deriveKey(password, salt), { ...state, documents, createdAt: Date.now() });
  const file = {
    app: APP_ID,
    version: 2,
    encrypted: true,
    kdf: { name: 'PBKDF2-SHA256', salt: toBase64(salt), iterations: KDF_ITERATIONS },
    cipher: 'AES-GCM-256',
    iv: toBase64(box.iv),
    data: toBase64(box.data),
  };

  const text = JSON.stringify(file);
  // Nunca se entrega una copia que después no se podría restaurar.
  if (text.length > MAX_FILE_BYTES) throw new Error('La copia es demasiado grande (muchas fotos en Documentos). Borra las fotos que ya no necesites.');
  downloadFile(new Blob([text], { type: 'application/json' }), `mi-gestor-${todayKey()}.json`);
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
    wallet: sanitizeWallet(payload.wallet),
    groups: sanitizeGroups(payload.groups),
    goals: sanitizeGoals(payload.goals),
    documents: sanitizeDocuments(payload.documents),
    settings: sanitizeSettings(payload.settings),
    createdAt: Number.isFinite(payload.createdAt) ? payload.createdAt : null,
  };
}
