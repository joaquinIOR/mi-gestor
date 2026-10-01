import { fromBase64, randomBytes, toBase64 } from './crypto';

// WebAuthn + PRF: el teléfono guarda una passkey protegida por huella o Face ID y,
// al verificar al usuario, entrega un secreto fijo de 32 bytes con el que se cifra la clave de datos.
export class BiometricUnsupportedError extends Error {}

export async function biometricSupported() {
  try {
    if (!window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable) return false;
    if (!(await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())) return false;
    if (PublicKeyCredential.getClientCapabilities) {
      const caps = await PublicKeyCredential.getClientCapabilities();
      if (caps['extension:prf'] === false) return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function evaluate(credentialId, salt, signal) {
  const assertion = await navigator.credentials.get({
    signal,
    publicKey: {
      challenge: randomBytes(32),
      allowCredentials: [{ type: 'public-key', id: credentialId, transports: ['internal'] }],
      userVerification: 'required',
      timeout: 60000,
      extensions: { prf: { eval: { first: salt } } },
    },
  });
  const secret = assertion.getClientExtensionResults().prf?.results?.first;
  if (!secret) throw new BiometricUnsupportedError('Este teléfono no permite usar la huella para cifrar.');
  return secret;
}

export async function registerBiometric() {
  const salt = randomBytes(32);
  const credential = await navigator.credentials.create({
    publicKey: {
      rp: { name: 'Mi Gestor' },
      user: { id: randomBytes(16), name: 'mi-gestor', displayName: 'Mi Gestor' },
      challenge: randomBytes(32),
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'required' },
      timeout: 60000,
      extensions: { prf: { eval: { first: salt } } },
    },
  });
  const prf = credential.getClientExtensionResults().prf;
  if (!prf?.enabled) throw new BiometricUnsupportedError('Este teléfono no permite usar la huella para cifrar.');
  const credentialId = new Uint8Array(credential.rawId);
  // Algunos teléfonos entregan el secreto al crear la passkey; otros necesitan una segunda verificación.
  const secret = prf.results?.first ?? (await evaluate(credentialId, salt));
  return { credentialId: toBase64(credentialId), salt: toBase64(salt), secret };
}

export const readBiometricSecret = ({ credentialId, salt }, signal) => evaluate(fromBase64(credentialId), fromBase64(salt), signal);

export function biometricErrorMessage(err) {
  if (err instanceof BiometricUnsupportedError) return err.message;
  if (err?.name === 'NotAllowedError' || err?.name === 'AbortError') return 'Verificación cancelada.';
  return err?.message || 'No se pudo usar la huella.';
}
