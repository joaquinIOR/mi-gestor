import { deriveKey, deriveKeyFromSecret, fromBase64, generateDataKey, KDF_ITERATIONS, randomBytes, toBase64, unwrapDataKey, wrapDataKey } from './crypto';

// La "bóveda" guarda la clave de datos cifrada con una clave derivada del código del usuario.
// El código nunca se guarda: sin él no se pueden leer los datos.
const VAULT_KEY = 'miGestor.vault';
const LOCKOUT_KEY = 'miGestor.lockout';

export const MIN_CODE_LENGTH = 6;
export const WIPE_AFTER_FAILURES = 10;
// Espera (en segundos) tras N intentos fallidos seguidos.
const DELAYS = [0, 0, 0, 0, 0, 30, 60, 300, 900];

export class WrongCodeError extends Error {}

export function readVault() {
  try {
    const vault = JSON.parse(localStorage.getItem(VAULT_KEY));
    return vault?.v === 1 ? vault : null;
  } catch {
    return null;
  }
}

const writeVault = (vault) => localStorage.setItem(VAULT_KEY, JSON.stringify(vault));

// Conserva el acceso biométrico: la clave de datos no cambia al cambiar el código.
async function storeDataKey(dataKey, code) {
  const salt = randomBytes(16);
  const wrapped = await wrapDataKey(dataKey, await deriveKey(code, salt));
  const biometric = readVault()?.biometric;
  writeVault({ v: 1, salt: toBase64(salt), iterations: KDF_ITERATIONS, ...wrapped, ...(biometric ? { biometric } : {}) });
}

async function openDataKey(code, extractable = false) {
  const vault = readVault();
  if (!vault) throw new Error('No hay bóveda');
  const wrappingKey = await deriveKey(code, fromBase64(vault.salt), vault.iterations);
  try {
    return await unwrapDataKey(vault, wrappingKey, extractable);
  } catch {
    throw new WrongCodeError('Código incorrecto');
  }
}

export async function createVault(code) {
  await storeDataKey(await generateDataKey(), code);
  return openDataKey(code);
}

export const unlockVault = (code) => openDataKey(code);

// Cambiar el código solo vuelve a cifrar la clave de datos; los datos no cambian.
export async function changeCode(current, next) {
  await storeDataKey(await openDataKey(current, true), next);
}

export const removeVault = () => localStorage.removeItem(VAULT_KEY);

// --- Huella / Face ID ---
// La clave de datos se cifra una segunda vez con un secreto que solo entrega el sensor biométrico
// del teléfono (passkey con la extensión WebAuthn PRF). Sin la huella o la cara, ese secreto no existe.
const BIOMETRIC_PURPOSE = 'mi-gestor/biometric/v1';

export const biometricInfo = () => readVault()?.biometric ?? null;

// Primero se comprueba el código (para no crear una passkey inútil) y después se registra la huella.
export async function enableBiometric(code, register) {
  const dataKey = await openDataKey(code, true);
  const { credentialId, salt, secret } = await register();
  const wrapped = await wrapDataKey(dataKey, await deriveKeyFromSecret(secret, BIOMETRIC_PURPOSE));
  writeVault({ ...readVault(), biometric: { credentialId, salt, ...wrapped } });
}

export async function unlockWithBiometric(readSecret) {
  const info = biometricInfo();
  if (!info) throw new Error('La huella no está activada.');
  const secret = await readSecret(info);
  try {
    return await unwrapDataKey(info, await deriveKeyFromSecret(secret, BIOMETRIC_PURPOSE));
  } catch {
    throw new Error('No se pudo desbloquear con la huella. Usa tu código.');
  }
}

export function disableBiometric() {
  const vault = readVault();
  if (!vault) return;
  delete vault.biometric;
  writeVault(vault);
}

export function getLockout() {
  try {
    return JSON.parse(localStorage.getItem(LOCKOUT_KEY)) ?? { failures: 0, until: 0 };
  } catch {
    return { failures: 0, until: 0 };
  }
}

export function registerFailure() {
  const failures = getLockout().failures + 1;
  const next = { failures, until: Date.now() + DELAYS[Math.min(failures, DELAYS.length - 1)] * 1000 };
  localStorage.setItem(LOCKOUT_KEY, JSON.stringify(next));
  return next;
}

export const resetFailures = () => localStorage.removeItem(LOCKOUT_KEY);

// Aviso (no bloqueante) para códigos fáciles de adivinar.
export function codeWarning(code) {
  if (/^(\d)\1+$/.test(code) || '0123456789'.includes(code) || '9876543210'.includes(code)) return 'Este código es muy fácil de adivinar.';
  if (/^\d+$/.test(code) && code.length < 8) return 'Consejo: un código de 8 o más caracteres, con letras, es mucho más difícil de romper.';
  return '';
}
