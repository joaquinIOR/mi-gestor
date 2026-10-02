import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Fingerprint, Lock, ShieldCheck } from 'lucide-react';
import { biometricErrorMessage, readBiometricSecret } from '../lib/biometric';
import RecoveryCode from '../components/RecoveryCode';
import { openSession, wipeAllData } from '../lib/store';
import {
  biometricInfo,
  codeWarning,
  createVault,
  hasRecovery,
  getLockout,
  MIN_CODE_LENGTH,
  recoverAccess,
  registerFailure,
  removeVault,
  resetFailures,
  unlockVault,
  unlockWithBiometric,
  WIPE_AFTER_FAILURES,
  WrongCodeError,
} from '../lib/vault';

function CodeInput({ value, onChange, placeholder, autoFocus, autoComplete }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="code-input">
      <input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        maxLength={128}
      />
      <button type="button" className="icon-btn" onClick={() => setVisible((v) => !v)} aria-label={visible ? 'Ocultar código' : 'Mostrar código'}>
        {visible ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}

export function SetupScreen({ onReady }) {
  const [code, setCode] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null);
  const warning = code.length >= MIN_CODE_LENGTH ? codeWarning(code) : '';

  const submit = async (e) => {
    e.preventDefault();
    if (code.length < MIN_CODE_LENGTH) return setError(`El código debe tener al menos ${MIN_CODE_LENGTH} caracteres.`);
    if (code !== confirm) return setError('Los códigos no coinciden.');
    setBusy(true);
    setError('');
    try {
      const { key, recoveryCode } = await createVault(code);
      resetFailures();
      setCreated({ session: await openSession(key), recoveryCode });
    } catch {
      setError('No se pudo proteger la app en este navegador.');
      setBusy(false);
    }
  };

  if (created) {
    return (
      <div className="lock-screen">
        <div className="lock-card">
          <RecoveryCode code={created.recoveryCode} onDone={() => onReady(created.session)} />
        </div>
      </div>
    );
  }

  return (
    <div className="lock-screen">
      <form className="lock-card" onSubmit={submit}>
        <span className="lock-icon">
          <ShieldCheck size={32} />
        </span>
        <h1>Protege Mi Gestor</h1>
        <p className="muted">
          Crea un código para bloquear la app. Tus datos y documentos se <b>cifrarán</b> con él: sin el código nadie puede leerlos, ni
          siquiera copiando los archivos del teléfono.
        </p>
        <CodeInput value={code} onChange={setCode} placeholder={`Código (mínimo ${MIN_CODE_LENGTH} caracteres)`} autoFocus autoComplete="new-password" />
        <CodeInput value={confirm} onChange={setConfirm} placeholder="Repite el código" autoComplete="new-password" />
        {warning && <p className="hint warn-text">{warning}</p>}
        <p className="hint">
          Después te daremos un <b>código de recuperación</b> por si algún día olvidas este.
        </p>
        {error && <p className="error">{error}</p>}
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? 'Cifrando…' : 'Crear código'}
        </button>
      </form>
    </div>
  );
}

export function LockScreen({ wipeOnFailures, quickType, invited, onUnlock, onWiped }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [lockout, setLockout] = useState(getLockout);
  const [now, setNow] = useState(() => Date.now());
  const [hasBiometric] = useState(() => biometricInfo() !== null);
  const autoTried = useRef(false);
  // Petición de huella automática en curso: se cancela si el usuario prefiere escribir el código.
  const pendingBio = useRef(null);
  const cancelAutoBiometric = () => {
    pendingBio.current?.abort();
    pendingBio.current = null;
  };
  const typeCode = (value) => {
    cancelAutoBiometric();
    setCode(value);
  };

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const unlockBiometric = async () => {
    if (busy) return;
    cancelAutoBiometric();
    setBusy(true);
    setError('');
    try {
      const key = await unlockWithBiometric(readBiometricSecret);
      resetFailures();
      onUnlock(await openSession(key));
    } catch (err) {
      setBusy(false);
      setError(biometricErrorMessage(err));
    }
  };

  // Pide la huella automáticamente al aparecer la pantalla (en iPhone hay que tocar el botón).
  useEffect(() => {
    if (!hasBiometric || autoTried.current || document.visibilityState !== 'visible') return;
    autoTried.current = true;
    const controller = new AbortController();
    pendingBio.current = controller;
    readBiometricSecret(biometricInfo(), controller.signal)
      .then((secret) => unlockWithBiometric(() => secret))
      .then(async (key) => {
        resetFailures();
        onUnlock(await openSession(key));
      })
      .catch(() => {})
      .finally(() => {
        if (pendingBio.current === controller) pendingBio.current = null;
      });
    return () => controller.abort();
  }, [hasBiometric, onUnlock]);

  const [recovering, setRecovering] = useState(false);
  const [canRecover] = useState(hasRecovery);
  const wait = Math.max(0, Math.ceil((lockout.until - now) / 1000));
  const remaining = WIPE_AFTER_FAILURES - lockout.failures;

  const submit = async (e) => {
    e.preventDefault();
    if (wait > 0 || busy || !code) return;
    setBusy(true);
    setError('');
    try {
      const key = await unlockVault(code);
      resetFailures();
      onUnlock(await openSession(key));
    } catch (err) {
      setBusy(false);
      setCode('');
      if (!(err instanceof WrongCodeError)) return setError('No se pudieron abrir los datos.');
      const next = registerFailure();
      if (wipeOnFailures && next.failures >= WIPE_AFTER_FAILURES) {
        await wipeAllData();
        removeVault();
        resetFailures();
        onWiped();
        return;
      }
      setLockout(next);
      setNow(Date.now());
      setError('Código incorrecto.');
    }
  };

  if (recovering) {
    return (
      <RecoverForm
        wait={wait}
        onCancel={() => setRecovering(false)}
        onFailure={() => {
          setLockout(registerFailure());
          setNow(Date.now());
        }}
        onUnlock={onUnlock}
      />
    );
  }

  return (
    <div className="lock-screen">
      <form className="lock-card" onSubmit={submit}>
        <span className="lock-icon">
          <Lock size={32} />
        </span>
        <h1>Mi Gestor</h1>
        <p className="muted">
          {invited
            ? 'Desbloquea para unirte al grupo al que te invitaron.'
            : quickType
              ? `Desbloquea para registrar un ${quickType === 'income' ? 'ingreso' : 'gasto'}.`
              : 'Escribe tu código para desbloquear.'}
        </p>
        {hasBiometric && (
          <button type="button" className="btn primary" onClick={unlockBiometric} disabled={busy}>
            <Fingerprint size={20} /> Usar huella o Face ID
          </button>
        )}
        <CodeInput value={code} onChange={typeCode} placeholder="Código" autoFocus={!hasBiometric} autoComplete="current-password" />
        {error && <p className="error">{error}</p>}
        {wait > 0 && <p className="hint warn-text">Demasiados intentos. Espera {wait} s.</p>}
        {wipeOnFailures && lockout.failures > 0 && (
          <p className="hint warn-text">
            Quedan {remaining} {remaining === 1 ? 'intento' : 'intentos'} antes de borrar todos los datos.
          </p>
        )}
        <button type="submit" className={`btn ${hasBiometric ? '' : 'primary'}`} disabled={busy || wait > 0}>
          {busy ? 'Abriendo…' : 'Desbloquear'}
        </button>
        {canRecover && (
          <button type="button" className="btn ghost small" onClick={() => setRecovering(true)}>
            ¿Olvidaste tu código?
          </button>
        )}
      </form>
    </div>
  );
}

export function UnsupportedScreen() {
  return (
    <div className="lock-screen">
      <div className="lock-card">
        <span className="lock-icon">
          <Lock size={32} />
        </span>
        <h1>Conexión no segura</h1>
        <p className="muted">
          Para cifrar tus datos, Mi Gestor debe abrirse desde una dirección <b>https://</b> (por ejemplo, la de GitHub Pages).
        </p>
      </div>
    </div>
  );
}

function RecoverForm({ wait, onCancel, onFailure, onUnlock }) {
  const [recovery, setRecovery] = useState('');
  const [code, setCode] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (wait > 0 || busy) return;
    if (code.length < MIN_CODE_LENGTH) return setError(`El código nuevo debe tener al menos ${MIN_CODE_LENGTH} caracteres.`);
    if (code !== confirm) return setError('Los códigos nuevos no coinciden.');
    setBusy(true);
    setError('');
    try {
      const key = await recoverAccess(recovery, code);
      resetFailures();
      onUnlock(await openSession(key));
    } catch (err) {
      setBusy(false);
      if (err instanceof WrongCodeError) onFailure();
      setError(err.message || 'No se pudo recuperar el acceso.');
    }
  };

  return (
    <div className="lock-screen">
      <form className="lock-card" onSubmit={submit}>
        <span className="lock-icon">
          <ShieldCheck size={32} />
        </span>
        <h1>Recuperar acceso</h1>
        <p className="muted">Escribe tu código de recuperación (32 caracteres) y elige un código nuevo. No perderás ningún dato.</p>
        <input
          className="recovery-input"
          placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          autoComplete="off"
          value={recovery}
          onChange={(e) => setRecovery(e.target.value)}
          autoFocus
        />
        <CodeInput value={code} onChange={setCode} placeholder={`Código nuevo (mínimo ${MIN_CODE_LENGTH})`} autoComplete="new-password" />
        <CodeInput value={confirm} onChange={setConfirm} placeholder="Repite el código nuevo" autoComplete="new-password" />
        {error && <p className="error">{error}</p>}
        {wait > 0 && <p className="hint warn-text">Demasiados intentos. Espera {wait} s.</p>}
        <button type="submit" className="btn primary" disabled={busy || wait > 0}>
          {busy ? 'Recuperando…' : 'Recuperar y entrar'}
        </button>
        <button type="button" className="btn ghost small" onClick={onCancel}>
          Volver
        </button>
      </form>
    </div>
  );
}
