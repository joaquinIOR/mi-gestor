import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Fingerprint, Lock, ShieldCheck, Smartphone } from 'lucide-react';
import { isInstalled, isIOS } from '../lib/persist';
import { biometricErrorMessage, biometricSupported, readBiometricSecret, registerBiometric } from '../lib/biometric';
import RecoveryCode from '../components/RecoveryCode';
import { hasEncryptedData, openSession, wipeAllData } from '../lib/store';
import {
  biometricInfo,
  codeWarning,
  commitRecovery,
  createVault,
  enableBiometric,
  hasRecovery,
  getLockout,
  lockoutWait,
  MIN_CODE_LENGTH,
  recoverAccess,
  registerFailure,
  removeVault,
  resetFailures,
  readVault,
  unlockVault,
  unlockWithBiometric,
  WIPE_AFTER_FAILURES,
  WrongCodeError,
} from '../lib/vault';

// «Espera 4:30 min» en vez de «Espera 270 s».
const waitText = (s) => (s < 60 ? `${s} s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} min`);

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

// En iPhone, Safari y la app instalada guardan sus datos por separado: lo que se cree en Safari no pasa a la app.
function InstallFirst({ invite, onContinue }) {
  const [copied, setCopied] = useState(false);
  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${import.meta.env.BASE_URL}${invite}`);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="lock-screen">
      <div className="lock-card">
        <span className="lock-icon">
          <Smartphone size={32} />
        </span>
        <h1>Primero instala Mi Gestor</h1>
        <p className="muted">
          En iPhone, lo que guardes aquí en Safari <b>no pasa</b> a la app instalada, y Safari puede borrarlo si no lo usas por unos días.
        </p>
        <ol className="steps">
          <li>
            Toca <b>Compartir</b> (el cuadrado con la flecha) y luego <b>Añadir a pantalla de inicio</b>.
          </li>
          <li>Abre Mi Gestor desde el ícono nuevo y crea ahí tu código.</li>
          {invite && <li>Dentro de la app: Grupo → «Unirme con invitación» y pega el enlace.</li>}
        </ol>
        {invite && (
          <button type="button" className="btn" onClick={copyInvite}>
            {copied ? 'Invitación copiada ✓' : 'Copiar la invitación'}
          </button>
        )}
        <button type="button" className="btn ghost small" onClick={onContinue}>
          Continuar en Safari de todos modos
        </button>
      </div>
    </div>
  );
}

export function SetupScreen({ onReady, onExisting, invite, wiped }) {
  const [inSafari, setInSafari] = useState(() => isIOS() && !isInstalled());
  const [code, setCode] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null);
  const [orphan, setOrphan] = useState(false);
  // Después del código de recuperación se ofrece la huella / Face ID (si el teléfono lo permite).
  const [bioSupported, setBioSupported] = useState(false);
  const [askBio, setAskBio] = useState(false);
  const [bioError, setBioError] = useState('');
  const warning = code.length >= MIN_CODE_LENGTH ? codeWarning(code) : '';

  useEffect(() => {
    hasEncryptedData().then(setOrphan, () => {});
    biometricSupported().then(setBioSupported, () => {});
  }, []);
  const finish = (session) => {
    setCode('');
    setConfirm('');
    onReady(session);
  };
  const activateBio = async () => {
    setBioError('');
    setBusy(true);
    try {
      await enableBiometric(code, registerBiometric);
      finish(created.session);
    } catch (err) {
      setBioError(biometricErrorMessage(err));
      setBusy(false);
    }
  };
  const startOver = async () => {
    if (!window.confirm('Se borrarán de este teléfono los datos que no se pueden abrir. Si tienes una copia de seguridad, después podrás restaurarla en Ajustes → Importar. ¿Continuar?')) return;
    await wipeAllData();
    setOrphan(false);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (code.length < MIN_CODE_LENGTH) return setError(`El código debe tener al menos ${MIN_CODE_LENGTH} caracteres.`);
    if (code !== confirm) return setError('Los códigos no coinciden.');
    // Si en otra ventana ya se creó el código, no se reemplaza (se perderían los datos): se pide ese código.
    if (readVault()) return onExisting();
    if (orphan) return setError('Primero decide qué hacer con los datos anteriores.');
    setBusy(true);
    setError('');
    try {
      const { key, recovery } = await createVault(code);
      resetFailures();
      setCreated({ session: await openSession(key), recovery });
    } catch {
      setError('No se pudo proteger la app en este navegador.');
      setBusy(false);
    }
  };

  if (inSafari && !created) return <InstallFirst invite={invite} onContinue={() => setInSafari(false)} />;

  if (created && askBio) {
    return (
      <div className="lock-screen">
        <div className="lock-card">
          <span className="lock-icon">
            <Fingerprint size={32} />
          </span>
          <h1>¿Desbloquear con huella o Face ID?</h1>
          <p className="muted">Así no tendrás que escribir el código cada vez. Tu código sigue sirviendo siempre.</p>
          <p className="hint warn-text">El teléfono también puede aceptar su propio código de desbloqueo: actívalo solo si nadie más lo conoce.</p>
          {bioError && <p className="error">{bioError}</p>}
          <button type="button" className="btn primary" onClick={activateBio} disabled={busy}>
            <Fingerprint size={20} /> {busy ? 'Esperando al sensor…' : 'Activar'}
          </button>
          <button type="button" className="btn ghost" onClick={() => finish(created.session)} disabled={busy}>
            Ahora no
          </button>
        </div>
      </div>
    );
  }

  if (created) {
    return (
      <div className="lock-screen">
        <div className="lock-card">
          <RecoveryCode
            code={created.recovery.code}
            onDone={() => {
              commitRecovery(created.recovery);
              setBusy(false);
              if (bioSupported) setAskBio(true);
              else finish(created.session);
            }}
          />
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
        {wiped && (
          <p className="error">
            Se borraron los datos de este teléfono por demasiados intentos con el código. Si tienes una copia de seguridad, podrás restaurarla
            después de crear el código nuevo.
          </p>
        )}
        <p className="muted">
          Crea un código para bloquear la app. Tus datos y documentos se <b>cifrarán</b> con él: sin el código nadie puede leerlos, ni
          siquiera copiando los archivos del teléfono.
        </p>
        {orphan && (
          <div className="notice warn">
            <div className="notice-text">
              <b>Hay datos de antes que no se pueden abrir</b>
              <p>
                Este teléfono tiene datos cifrados de Mi Gestor, pero falta la llave para abrirlos (por ejemplo, porque se borraron los datos
                del navegador). Sin ella nadie puede leerlos. Si tienes una copia de seguridad, podrás restaurarla después.
              </p>
            </div>
            <button type="button" className="btn small danger" onClick={startOver}>
              Borrar y empezar de cero
            </button>
          </div>
        )}
        <CodeInput value={code} onChange={setCode} placeholder={`Código (mínimo ${MIN_CODE_LENGTH} caracteres)`} autoFocus autoComplete="new-password" />
        <CodeInput value={confirm} onChange={setConfirm} placeholder="Repite el código" autoComplete="new-password" />
        {warning && <p className="hint warn-text">{warning}</p>}
        <p className="hint">
          Después te daremos un <b>código de recuperación</b> por si algún día olvidas este.
        </p>
        <p className="hint">¿Ya usabas Mi Gestor en otro teléfono? Crea un código y luego ve a Ajustes → Importar para restaurar tu copia.</p>
        {error && <p className="error">{error}</p>}
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? 'Cifrando…' : 'Crear código'}
        </button>
      </form>
    </div>
  );
}

export function LockScreen({ wipeOnFailures, quickType, invited, autoBiometric = true, onUnlock, onWiped }) {
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
    const timer = setInterval(() => {
      setNow(Date.now());
      setLockout(getLockout());
    }, 1000);
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
    if (!hasBiometric || !autoBiometric || autoTried.current || document.visibilityState !== 'visible') return;
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
  }, [hasBiometric, autoBiometric, onUnlock]);

  const [recovering, setRecovering] = useState(false);
  const [canRecover] = useState(hasRecovery);
  const wait = lockoutWait(lockout, now);
  const remaining = Math.max(0, WIPE_AFTER_FAILURES - lockout.failures);

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
        removeVault();
        await wipeAllData();
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
      <RecoverForm onCancel={() => setRecovering(false)} onUnlock={onUnlock} />
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
        {wait > 0 && <p className="hint warn-text">Demasiados intentos. Espera {waitText(wait)}.</p>}
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

// El código de recuperación tiene 160 bits al azar: no hace falta limitar intentos ni esperar, y sus fallos
// no cuentan para el borrado tras 10 intentos (solo una pausa breve entre intentos).
function RecoverForm({ onCancel, onUnlock }) {
  const [recovery, setRecovery] = useState('');
  const [code, setCode] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (code.length < MIN_CODE_LENGTH) return setError(`El código nuevo debe tener al menos ${MIN_CODE_LENGTH} caracteres.`);
    if (code !== confirm) return setError('Los códigos nuevos no coinciden.');
    setBusy(true);
    setError('');
    try {
      const key = await recoverAccess(recovery, code);
      resetFailures();
      onUnlock(await openSession(key));
    } catch (err) {
      setError(err.message || 'No se pudo recuperar el acceso.');
      setTimeout(() => setBusy(false), err instanceof WrongCodeError ? 2000 : 0);
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
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? 'Recuperando…' : 'Recuperar y entrar'}
        </button>
        <button type="button" className="btn ghost small" onClick={onCancel}>
          Volver
        </button>
      </form>
    </div>
  );
}
