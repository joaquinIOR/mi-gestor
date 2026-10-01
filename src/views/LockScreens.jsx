import { useEffect, useState } from 'react';
import { Eye, EyeOff, Lock, ShieldCheck } from 'lucide-react';
import { openSession, wipeAllData } from '../lib/store';
import {
  codeWarning,
  createVault,
  getLockout,
  MIN_CODE_LENGTH,
  registerFailure,
  removeVault,
  resetFailures,
  unlockVault,
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
  const warning = code.length >= MIN_CODE_LENGTH ? codeWarning(code) : '';

  const submit = async (e) => {
    e.preventDefault();
    if (code.length < MIN_CODE_LENGTH) return setError(`El código debe tener al menos ${MIN_CODE_LENGTH} caracteres.`);
    if (code !== confirm) return setError('Los códigos no coinciden.');
    setBusy(true);
    setError('');
    try {
      const key = await createVault(code);
      resetFailures();
      onReady(await openSession(key));
    } catch {
      setError('No se pudo proteger la app en este navegador.');
      setBusy(false);
    }
  };

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
          ⚠️ Si olvidas el código <b>no hay forma de recuperar los datos</b>. Guarda una copia de seguridad cifrada desde Ajustes.
        </p>
        {error && <p className="error">{error}</p>}
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? 'Cifrando…' : 'Crear código'}
        </button>
      </form>
    </div>
  );
}

export function LockScreen({ wipeOnFailures, onUnlock, onWiped }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [lockout, setLockout] = useState(getLockout);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

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

  return (
    <div className="lock-screen">
      <form className="lock-card" onSubmit={submit}>
        <span className="lock-icon">
          <Lock size={32} />
        </span>
        <h1>Mi Gestor</h1>
        <p className="muted">Escribe tu código para desbloquear.</p>
        <CodeInput value={code} onChange={setCode} placeholder="Código" autoFocus autoComplete="current-password" />
        {error && <p className="error">{error}</p>}
        {wait > 0 && <p className="hint warn-text">Demasiados intentos. Espera {wait} s.</p>}
        {wipeOnFailures && lockout.failures > 0 && (
          <p className="hint warn-text">
            Quedan {remaining} {remaining === 1 ? 'intento' : 'intentos'} antes de borrar todos los datos.
          </p>
        )}
        <button type="submit" className="btn primary" disabled={busy || wait > 0}>
          {busy ? 'Abriendo…' : 'Desbloquear'}
        </button>
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
