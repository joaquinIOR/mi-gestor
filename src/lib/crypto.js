// Cifrado con Web Crypto: AES-GCM 256 y claves derivadas con PBKDF2-SHA256.
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const KDF_ITERATIONS = 600000;

// Web Crypto solo existe en contextos seguros (HTTPS o localhost).
export const cryptoAvailable = () => window.isSecureContext && !!globalThis.crypto?.subtle;

export const randomBytes = (n) => crypto.getRandomValues(new Uint8Array(n));

export function toBase64(bytes) {
  const view = new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < view.length; i += 0x8000) binary += String.fromCharCode(...view.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function fromBase64(text) {
  const binary = atob(text);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

export async function deriveKey(password, salt, iterations = KDF_ITERATIONS) {
  const base = await crypto.subtle.importKey('raw', encoder.encode(password.normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']
  );
}

export const generateDataKey = () => crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);

export async function wrapDataKey(dataKey, wrappingKey) {
  const iv = randomBytes(12);
  const wrapped = await crypto.subtle.wrapKey('raw', dataKey, wrappingKey, { name: 'AES-GCM', iv });
  return { iv: toBase64(iv), wrapped: toBase64(wrapped) };
}

// Por defecto la clave queda "no extraíble": ni siquiera el propio código puede leerla.
export const unwrapDataKey = ({ iv, wrapped }, wrappingKey, extractable = false) =>
  crypto.subtle.unwrapKey(
    'raw',
    fromBase64(wrapped),
    wrappingKey,
    { name: 'AES-GCM', iv: fromBase64(iv) },
    { name: 'AES-GCM', length: 256 },
    extractable,
    ['encrypt', 'decrypt']
  );

export async function encryptBytes(key, bytes) {
  const iv = randomBytes(12);
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes);
  return { iv, data };
}

export const decryptBytes = (key, { iv, data }) => crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);

export const encryptJson = (key, value) => encryptBytes(key, encoder.encode(JSON.stringify(value)));
export const decryptJson = async (key, box) => JSON.parse(decoder.decode(await decryptBytes(key, box)));
