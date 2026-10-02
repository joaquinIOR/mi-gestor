import { deriveKey, deriveKeyFromSecret, fromBase64, generateDataKey, KDF_ITERATIONS, randomBytes, toBase64, unwrapDataKey, wrapDataKey } from './crypto';

// La "bóveda" guarda la clave de datos cifrada con una clave derivada del código del usuario.
// El código nunca se guarda: sin él no se pueden leer los datos.
const VAULT_KEY = 'miGestor.vault';
const LOCKOUT_KEY = 'miGestor.lockout';

export const MIN_CODE_LENGTH = 6;
export const WIPE_AFTER_FAILURES = 10;
// Espera (en segundos) tras N intentos fallidos seguidos.
const DELAYS = [0, 0, 0, 0, 0, 30, 60, 300, 900];
export const MAX_WAIT_MS = DELAYS[DELAYS.length - 1] * 1000;

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
async function storeDataKey(dataKey, code, { fresh = false } = {}) {
  const salt = randomBytes(16);
  const wrapped = await wrapDataKey(dataKey, await deriveKey(code, salt));
  // Conserva la huella y el código de recuperación: ambos protegen la misma clave de datos
  // (salvo en una bóveda nueva, que nunca hereda los de otra clave).
  const { biometric, recovery } = fresh ? {} : readVault() ?? {};
  writeVault({
    v: 1,
    salt: toBase64(salt),
    iterations: KDF_ITERATIONS,
    ...wrapped,
    ...(biometric ? { biometric } : {}),
    ...(recovery ? { recovery } : {}),
  });
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

// Crea la bóveda. El código de recuperación se prepara aquí, pero solo queda activo con commitRecovery,
// cuando la persona confirma que lo anotó (se muestra una sola vez).
export async function createVault(code) {
  const dataKey = await generateDataKey();
  await storeDataKey(dataKey, code, { fresh: true });
  return { key: await openDataKey(code), recovery: await prepareRecovery(dataKey) };
}

export const unlockVault = (code) => openDataKey(code);

// Cambiar el código solo vuelve a cifrar la clave de datos; los datos no cambian.
export async function changeCode(current, next) {
  await storeDataKey(await openDataKey(current, true), next);
}

export const removeVault = () => localStorage.removeItem(VAULT_KEY);

// --- Código de recuperación ---
// 32 caracteres al azar (160 bits) que también abren la clave de datos. Sirve si se olvida el código:
// con él se crea uno nuevo sin perder nada. Se muestra una sola vez y nunca se guarda en claro.
const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const RECOVERY_PURPOSE = 'mi-gestor/recovery/v1';

export const normalizeRecoveryCode = (text) => String(text ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const recoveryKey = (code) => deriveKeyFromSecret(new TextEncoder().encode(normalizeRecoveryCode(code)), RECOVERY_PURPOSE);

async function prepareRecovery(dataKey) {
  const chars = Array.from(randomBytes(32), (b) => RECOVERY_ALPHABET[b % 32]).join('');
  const code = chars.match(/.{4}/g).join('-');
  return { code, wrapped: await wrapDataKey(dataKey, await recoveryKey(code)) };
}

// Activa el código de recuperación (y deja sin efecto el anterior, si había).
export function commitRecovery(recovery) {
  const vault = readVault();
  if (!vault) throw new Error('No hay bóveda');
  writeVault({ ...vault, recovery: recovery.wrapped });
}

export const hasRecovery = () => !!readVault()?.recovery;

// Prepara un código de recuperación nuevo para una bóveda existente (se activa con commitRecovery).
export async function enableRecovery(code) {
  return prepareRecovery(await openDataKey(code, true));
}

// Con el código de recuperación se define un código nuevo; los datos no cambian.
export async function recoverAccess(recoveryCode, newCode) {
  const info = readVault()?.recovery;
  if (!info) throw new Error('No hay código de recuperación.');
  if (normalizeRecoveryCode(recoveryCode).length !== 32) throw new Error('El código de recuperación tiene 32 caracteres.');
  let dataKey;
  try {
    dataKey = await unwrapDataKey(info, await recoveryKey(recoveryCode), true);
  } catch {
    throw new WrongCodeError('Código de recuperación incorrecto.');
  }
  await storeDataKey(dataKey, newCode);
  return openDataKey(newCode);
}

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

// Con la huella también se puede cambiar el código olvidado o crear un código de recuperación (desde Ajustes).
async function biometricDataKey(readSecret) {
  const info = biometricInfo();
  if (!info) throw new Error('La huella no está activada.');
  const secret = await readSecret(info);
  try {
    return await unwrapDataKey(info, await deriveKeyFromSecret(secret, BIOMETRIC_PURPOSE), true);
  } catch {
    throw new Error('No se pudo verificar con la huella.');
  }
}

export async function changeCodeWithBiometric(readSecret, next) {
  await storeDataKey(await biometricDataKey(readSecret), next);
}

export async function enableRecoveryWithBiometric(readSecret) {
  return prepareRecovery(await biometricDataKey(readSecret));
}

export function disableBiometric() {
  const vault = readVault();
  if (!vault) return;
  delete vault.biometric;
  writeVault(vault);
}

export function getLockout() {
  try {
    const lockout = JSON.parse(localStorage.getItem(LOCKOUT_KEY)) ?? { failures: 0, until: 0 };
    // Si el reloj del teléfono se atrasó, la espera vuelve a contar desde ahora (nunca más que el máximo).
    const now = Date.now();
    if (lockout.at && now < lockout.at) {
      const fixed = { ...lockout, at: now, until: now + Math.min(lockout.until - lockout.at, MAX_WAIT_MS) };
      localStorage.setItem(LOCKOUT_KEY, JSON.stringify(fixed));
      return fixed;
    }
    return lockout;
  } catch {
    return { failures: 0, until: 0 };
  }
}

export function registerFailure() {
  const failures = getLockout().failures + 1;
  const at = Date.now();
  const next = { failures, at, until: at + DELAYS[Math.min(failures, DELAYS.length - 1)] * 1000 };
  localStorage.setItem(LOCKOUT_KEY, JSON.stringify(next));
  return next;
}

// Segundos de espera: nunca más que la espera máxima, aunque el reloj del teléfono cambie (ver getLockout).
export function lockoutWait(lockout, now = Date.now()) {
  return Math.max(0, Math.ceil(Math.min(lockout.until - now, MAX_WAIT_MS) / 1000));
}

export const resetFailures = () => localStorage.removeItem(LOCKOUT_KEY);

// Aviso (no bloqueante) para códigos fáciles de adivinar.
export function codeWarning(code) {
  if (/^(\d)\1+$/.test(code) || '0123456789'.includes(code) || '9876543210'.includes(code)) return 'Este código es muy fácil de adivinar.';
  if (/^\d+$/.test(code) && code.length < 8) return 'Consejo: un código de 8 o más caracteres, con letras, es mucho más difícil de romper.';
  return '';
}
