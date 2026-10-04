import { useEffect, useRef, useState } from 'react';
import { Bell, Check, Copy, Download, Fingerprint, KeyRound, Lock, Share2, ShieldAlert, Smartphone, Tags, Trash2, Upload, Zap } from 'lucide-react';
import { biometricErrorMessage, biometricSupported, readBiometricSecret, registerBiometric } from '../lib/biometric';
import { allowBackgroundBriefly, endBackgroundAllowance } from '../lib/autolock';
import { isEncryptedBackup, MIN_BACKUP_PASSWORD, openBackup, readBackupFile } from '../lib/backup';
import RecoveryCode from '../components/RecoveryCode';
import ShareApp from '../components/ShareApp';
import pushSql from '../../supabase/push.sql?raw';
import pushFunction from '../../supabase/functions/mg-push/index.ts?raw';
import { pushSupported } from '../lib/push';
import { notificationsSupported } from '../lib/notify';
import { isInstalled } from '../lib/persist';
import { hideQuickAccess, showQuickAccess } from '../lib/quick';
import { AUTO_LOCK_OPTIONS, CURRENCIES, TEXT_SIZES } from '../lib/settings';
import { PALETTES } from '../lib/themes';
import {
  biometricInfo,
  changeCode,
  changeCodeWithBiometric,
  codeWarning,
  commitRecovery,
  disableBiometric,
  enableBiometric,
  enableRecovery,
  enableRecoveryWithBiometric,
  getLockout,
  hasRecovery,
  lockoutWait,
  MIN_CODE_LENGTH,
  registerFailure,
  resetFailures,
  WIPE_AFTER_FAILURES,
  WrongCodeError,
} from '../lib/vault';

const THEMES = [
  { value: 'auto', label: 'Auto' },
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Oscuro' },
];

function Toggle({ checked, onChange, label, description }) {
  return (
    <label className="toggle">
      <span className="row-main">
        <span className="row-title">{label}</span>
        {description && <span className="hint">{description}</span>}
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

const passwordProps = { type: 'password', autoCapitalize: 'off', autoCorrect: 'off', spellCheck: false, maxLength: 128 };

// Los intentos con el código en Ajustes cuentan igual que en la pantalla de bloqueo (no sirven para adivinarlo).
function attemptBlocked() {
  const wait = lockoutWait(getLockout());
  return wait > 0 ? `Demasiados intentos. Espera ${wait} s.` : '';
}
function codeFailed(onLock) {
  if (lockoutWait(registerFailure()) > 0) onLock();
}

function ChangeCodeForm({ onDone, onLock }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (next.length < MIN_CODE_LENGTH) return setError(`El código nuevo debe tener al menos ${MIN_CODE_LENGTH} caracteres.`);
    if (next !== confirm) return setError('Los códigos nuevos no coinciden.');
    if (attemptBlocked()) return setError(attemptBlocked());
    setBusy(true);
    try {
      await changeCode(current, next);
      resetFailures();
      onDone('Código cambiado.');
    } catch (err) {
      if (err instanceof WrongCodeError) codeFailed(onLock);
      setError(err instanceof WrongCodeError ? 'El código actual no es correcto.' : 'No se pudo cambiar el código.');
      setBusy(false);
    }
  };
  // ¿Olvidaste el código actual? Con la huella también se puede cambiar.
  const withBiometric = async () => {
    if (next.length < MIN_CODE_LENGTH) return setError(`El código nuevo debe tener al menos ${MIN_CODE_LENGTH} caracteres.`);
    if (next !== confirm) return setError('Los códigos nuevos no coinciden.');
    setBusy(true);
    setError('');
    try {
      await changeCodeWithBiometric(readBiometricSecret, next);
      resetFailures();
      onDone('Código cambiado.');
    } catch (err) {
      setError(biometricErrorMessage(err));
      setBusy(false);
    }
  };

  return (
    <form className="subform" onSubmit={submit}>
      <input {...passwordProps} autoComplete="current-password" placeholder="Código actual" value={current} onChange={(e) => setCurrent(e.target.value)} />
      <input {...passwordProps} autoComplete="new-password" placeholder="Código nuevo" value={next} onChange={(e) => setNext(e.target.value)} />
      <input {...passwordProps} autoComplete="new-password" placeholder="Repite el código nuevo" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      {next.length >= MIN_CODE_LENGTH && codeWarning(next) && <p className="hint warn-text">{codeWarning(next)}</p>}
      {error && <p className="error">{error}</p>}
      <button type="submit" className="btn primary" disabled={busy}>
        {busy ? 'Guardando…' : 'Cambiar código'}
      </button>
      {biometricInfo() && (
        <button type="button" className="btn ghost" onClick={withBiometric} disabled={busy}>
          <Fingerprint size={18} /> No recuerdo el actual: usar huella / Face ID
        </button>
      )}
    </form>
  );
}

function BiometricForm({ onDone, onLock }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (attemptBlocked()) return setError(attemptBlocked());
    setBusy(true);
    setError('');
    try {
      await enableBiometric(code, registerBiometric);
      resetFailures();
      onDone('Huella / Face ID activado. La próxima vez podrás desbloquear con un toque.');
    } catch (err) {
      if (err instanceof WrongCodeError) codeFailed(onLock);
      setError(err instanceof WrongCodeError ? 'El código no es correcto.' : biometricErrorMessage(err));
      setBusy(false);
    }
  };

  return (
    <form className="subform" onSubmit={submit}>
      <p className="hint">Confirma tu código. Después el teléfono te pedirá la huella o la cara (puede pedirla dos veces).</p>
      <p className="hint warn-text">
        Ojo: el teléfono también puede aceptar su propio código de desbloqueo en lugar de la huella o la cara. Actívalo solo si nadie más
        conoce el código de tu teléfono.
      </p>
      <input {...passwordProps} autoComplete="current-password" placeholder="Tu código" value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
      {error && <p className="error">{error}</p>}
      <button type="submit" className="btn primary" disabled={busy || !code}>
        <Fingerprint size={18} /> {busy ? 'Esperando al sensor…' : 'Activar huella / Face ID'}
      </button>
    </form>
  );
}

function RecoveryForm({ onDone, onLock }) {
  const [code, setCode] = useState('');
  const [created, setCreated] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // El código nuevo solo reemplaza al anterior cuando confirmas que lo guardaste.
  if (created) {
    return (
      <RecoveryCode
        code={created.code}
        onDone={() => {
          commitRecovery(created);
          onDone('Código de recuperación guardado. El anterior, si había uno, ya no sirve.');
        }}
      />
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    if (attemptBlocked()) return setError(attemptBlocked());
    setBusy(true);
    setError('');
    try {
      setCreated(await enableRecovery(code));
      resetFailures();
    } catch (err) {
      if (err instanceof WrongCodeError) codeFailed(onLock);
      setError(err instanceof WrongCodeError ? 'El código no es correcto.' : 'No se pudo crear el código de recuperación.');
      setBusy(false);
    }
  };
  const withBiometric = async () => {
    setBusy(true);
    setError('');
    try {
      setCreated(await enableRecoveryWithBiometric(readBiometricSecret));
    } catch (err) {
      setError(biometricErrorMessage(err));
      setBusy(false);
    }
  };

  return (
    <form className="subform" onSubmit={submit}>
      <p className="hint">Confirma tu código actual para crear el código de recuperación.</p>
      <input {...passwordProps} autoComplete="current-password" placeholder="Tu código" value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
      {error && <p className="error">{error}</p>}
      <button type="submit" className="btn primary" disabled={busy || !code}>
        {busy ? 'Creando…' : 'Crear código de recuperación'}
      </button>
      {biometricInfo() && (
        <button type="button" className="btn ghost" onClick={withBiometric} disabled={busy}>
          <Fingerprint size={18} /> Confirmar con huella / Face ID
        </button>
      )}
    </form>
  );
}

function CategoryRow({ type, name, onRename, onDelete }) {
  const [value, setValue] = useState(name);
  const [error, setError] = useState('');
  const changed = value.trim() && value.trim() !== name;
  const save = () => {
    const clash = onRename(type, name, value.trim());
    if (clash) setError(`Ya existe un tipo llamado «${clash}».`);
  };
  return (
    <>
    <div className="cat-row">
      <input
        aria-label={`Nombre del tipo ${name}`}
        maxLength={24}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setError('');
        }}
      />
      <button type="button" className="icon-btn" disabled={!changed} onClick={save} aria-label={`Guardar ${name}`}>
        <Check size={18} />
      </button>
      <button
        type="button"
        className="icon-btn"
        onClick={() => window.confirm(`¿Borrar el tipo «${name}»? Sus movimientos pasarán a «${type === 'income' ? 'Otros ingresos' : 'Otros'}».`) && onDelete(type, name)}
        aria-label={`Borrar ${name}`}
      >
        <Trash2 size={18} />
      </button>
    </div>
    {error && <p className="error">{error}</p>}
    </>
  );
}

function CategoryManager({ categories, onRename, onDelete }) {
  const groups = [
    { type: 'expense', label: 'Gastos' },
    { type: 'income', label: 'Ingresos' },
  ];
  const total = (categories?.expense?.length ?? 0) + (categories?.income?.length ?? 0);
  if (!total) return <p className="hint">Aún no creas tipos propios. Puedes hacerlo con «+ Nuevo tipo» al registrar un movimiento.</p>;
  return groups.map((g) =>
    categories[g.type]?.length ? (
      <div className="field" key={g.type}>
        <span>{g.label}</span>
        {categories[g.type].map((name) => (
          <CategoryRow key={name} type={g.type} name={name} onRename={onRename} onDelete={onDelete} />
        ))}
      </div>
    ) : null
  );
}

function CopyButton({ text, label }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn small"
      onClick={() =>
        navigator.clipboard.writeText(text).then(
          () => setCopied(true),
          () => setCopied(false)
        )
      }
    >
      {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'Copiado' : label}
    </button>
  );
}

function PushSection({ enabled, groups, onEnable, onDisable }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (fn) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (err) {
      setError(err.message || 'No se pudo cambiar.');
    } finally {
      setBusy(false);
    }
  };

  if (!pushSupported()) {
    return <p className="hint">Este navegador no permite avisos con la app cerrada. En iPhone (iOS 16.4 o posterior), primero añade Mi Gestor a la pantalla de inicio.</p>;
  }
  if (!groups.length) return <p className="hint">Requiere un grupo conectado a tu Supabase (pestaña Grupo).</p>;

  return (
    <>
      <p className="hint">
        {enabled
          ? '✅ Activados en este teléfono: recibirás avisos de tus recordatorios, lo que hay que confirmar del saldo, cuentas de la casa y novedades del grupo aunque la app esté cerrada.'
          : 'Recibe avisos de recordatorios, de lo que hay que confirmar del saldo, de cuentas de la casa y novedades del grupo aunque la app esté cerrada. Los avisos nunca muestran montos ni nombres.'}
      </p>
      {!enabled && (
        <details className="push-setup">
          <summary>Preparar tu Supabase (una vez, quien creó el grupo)</summary>
          <ol className="steps">
            <li>
              En Supabase → <b>SQL Editor</b>, pega y ejecuta este código.
              <CopyButton text={pushSql} label="Copiar código SQL" />
            </li>
            <li>
              En <b>Edge Functions</b> → <b>Deploy a new function</b> → <b>Via Editor</b>: nombre <code>mg-push</code>, pega este código y pulsa{' '}
              <b>Deploy</b>.
              <CopyButton text={pushFunction} label="Copiar código de la función" />
            </li>
            <li>
              En la función <code>mg-push</code> → <b>Details</b>: desactiva <b>Verify JWT</b> (o «Enforce JWT verification») y guarda.
            </li>
          </ol>
        </details>
      )}
      {error && <p className="error">{error}</p>}
      {enabled ? (
        <button type="button" className="btn" disabled={busy} onClick={() => run(onDisable)}>
          Desactivar en este teléfono
        </button>
      ) : (
        <button type="button" className="btn primary" disabled={busy} onClick={() => run(onEnable)}>
          <Bell size={18} /> {busy ? 'Activando…' : 'Activar en este teléfono'}
        </button>
      )}
    </>
  );
}

function ExportForm({ onExport, onSaved, onDone }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  const download = async () => {
    setBusy(true);
    setError('');
    try {
      await onExport(password);
      // La copia ya cuenta como hecha; el paso siguiente solo recuerda guardarla fuera del teléfono.
      onSaved();
      setDownloaded(true);
      allowBackgroundBriefly();
    } catch (err) {
      setError(err?.message || 'No se pudo crear la copia.');
    }
    setBusy(false);
  };
  const submit = (e) => {
    e.preventDefault();
    if (password.length < MIN_BACKUP_PASSWORD) return setError(`Usa al menos ${MIN_BACKUP_PASSWORD} caracteres.`);
    if (password !== confirm) return setError('Las contraseñas no coinciden.');
    download();
  };

  // La copia solo cuenta como hecha cuando confirmas que el archivo quedó guardado.
  if (downloaded) {
    return (
      <div className="subform">
        <p className="hint">
          Revisa que el archivo <b>mi-gestor-….json</b> se haya descargado y guárdalo fuera del teléfono (Drive, iCloud o envíatelo por
          correo). Guarda también la contraseña: sin ella no se puede abrir.
        </p>
        <button
          type="button"
          className="btn primary"
          onClick={() => onDone('Copia de seguridad guardada.')}
        >
          Listo, la guardé
        </button>
        <button type="button" className="btn ghost" onClick={download} disabled={busy}>
          {busy ? 'Cifrando…' : 'No se descargó: intentar de nuevo'}
        </button>
        {error && <p className="error">{error}</p>}
      </div>
    );
  }

  return (
    <form className="subform" onSubmit={submit}>
      <p className="hint">La copia se cifra con esta contraseña. Puede ser distinta de tu código de desbloqueo.</p>
      <input {...passwordProps} autoComplete="new-password" placeholder={`Contraseña de la copia (mín. ${MIN_BACKUP_PASSWORD})`} value={password} onChange={(e) => setPassword(e.target.value)} />
      <input {...passwordProps} autoComplete="new-password" placeholder="Repite la contraseña" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      {error && <p className="error">{error}</p>}
      <button type="submit" className="btn primary" disabled={busy}>
        {busy ? 'Cifrando…' : 'Descargar copia cifrada'}
      </button>
    </form>
  );
}

function ImportForm({ onImport, onDone, current }) {
  const [backup, setBackup] = useState(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Primero se abre la copia (así una contraseña equivocada no pregunta nada) y se muestra qué trae.
  const restore = async (json, pass) => {
    setBusy(true);
    setError('');
    try {
      const data = await openBackup(json, pass);
      const date = data.createdAt ? ` del ${new Date(data.createdAt).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })}` : '';
      const summary = `La copia${date} tiene ${data.movements.length} movimientos, ${data.notes.length} notas y ${data.documents.length} documentos.`;
      const now = current ? ` Ahora tienes ${current.movements} movimientos, ${current.notes} notas y ${current.documents} documentos.` : '';
      if (!window.confirm(`${summary}${now} Restaurarla reemplaza todo lo actual. ¿Continuar?`)) {
        setBusy(false);
        return;
      }
      await onImport(data);
      onDone('Datos restaurados.');
    } catch (err) {
      setError(err?.name === 'QuotaExceededError' ? 'No hay espacio suficiente en el teléfono; no se cambió nada.' : err?.message || 'No se pudo restaurar la copia.');
      setBusy(false);
    }
  };

  const pick = async (e) => {
    endBackgroundAllowance();
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    try {
      const json = await readBackupFile(file);
      if (isEncryptedBackup(json)) setBackup(json);
      else if (window.confirm('Esta copia es antigua y NO está cifrada. ¿Importarla de todos modos? Después bórrala de donde la tengas guardada.')) {
        restore(json, '');
      }
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="subform">
      {!backup ? (
        <label className="btn">
          <Upload size={18} /> Elegir archivo de copia
          <input type="file" accept="application/json,.json" hidden onClick={allowBackgroundBriefly} onChange={pick} />
        </label>
      ) : (
        <form
          className="subform"
          onSubmit={(e) => {
            e.preventDefault();
            restore(backup, password);
          }}
        >
          <input {...passwordProps} autoComplete="current-password" placeholder="Contraseña de la copia" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
          <button type="submit" className="btn primary" disabled={busy || !password}>
            {busy ? 'Restaurando…' : 'Restaurar copia'}
          </button>
        </form>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

export default function Settings({ settings, onChange, onExport, onBackupSaved, currentCounts, onImport, onReset, onLock, initialPanel = null, persistence, categories, onRenameCategory, onDeleteCategory, groups = [], onEnablePush, onDisablePush }) {
  const [permission, setPermission] = useState(() => (notificationsSupported() ? Notification.permission : 'unsupported'));
  const [installPrompt, setInstallPrompt] = useState(() => window.deferredInstallPrompt ?? null);
  const [panel, setPanel] = useState(initialPanel);
  const [recoveryReady, setRecoveryReady] = useState(hasRecovery);
  const darkMode = settings.theme === 'dark' || (settings.theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const [status, setStatus] = useState('');
  const [bioSupported, setBioSupported] = useState(null);
  const [bioEnabled, setBioEnabled] = useState(() => biometricInfo() !== null);

  useEffect(() => {
    biometricSupported().then(setBioSupported);
  }, []);

  // Si se abrió desde Inicio («Hacer copia», «Crear código de recuperación»), se muestra esa parte.
  useEffect(() => {
    const id = { export: 'settings-backup', import: 'settings-backup', recovery: 'settings-recovery' }[initialPanel];
    if (id) requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }));
    // Solo al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Los mensajes de resultado («Código cambiado», «Copia guardada»…) siempre quedan a la vista.
  const statusRef = useRef(null);
  useEffect(() => {
    if (status) statusRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [status]);

  const toggleQuickAccess = async (on) => {
    setStatus('');
    if (!on) {
      onChange({ quickAccess: false });
      hideQuickAccess().catch(() => {});
      return;
    }
    let current = permission;
    if (current === 'default') {
      current = await Notification.requestPermission();
      setPermission(current);
    }
    if (current !== 'granted') {
      setStatus('Para el acceso rápido en la barra de notificaciones, permite las notificaciones de Mi Gestor.');
      return;
    }
    onChange({ quickAccess: true });
    if (!(await showQuickAccess().catch(() => false))) setStatus('El acceso rápido aparecerá cuando la app esté instalada y abierta desde https.');
  };

  const enableNotifications = async () => setPermission(await Notification.requestPermission());
  const install = async () => {
    installPrompt.prompt();
    await installPrompt.userChoice;
    window.deferredInstallPrompt = null;
    setInstallPrompt(null);
  };
  const toggle = (name) => {
    setStatus('');
    setPanel((p) => (p === name ? null : name));
  };
  const done = (message) => {
    setPanel(null);
    setStatus(message);
    setBioEnabled(biometricInfo() !== null);
    setRecoveryReady(hasRecovery());
  };

  return (
    <div className="form">
      {status && (
        <p className="status" role="status" ref={statusRef}>
          {status}
        </p>
      )}
      <section className="settings-group">
        <h3 className="card-title">
          <ShieldAlert size={18} /> Seguridad
        </h3>
        <div className="field">
          <span>Bloquear automáticamente</span>
          <div className="segmented">
            {AUTO_LOCK_OPTIONS.map((o) => (
              <button type="button" key={o.value} className={settings.autoLock === o.value ? 'on' : ''} aria-pressed={settings.autoLock === o.value} onClick={() => onChange({ autoLock: o.value })}>
                {o.label}
              </button>
            ))}
          </div>
          <p className="hint">También se bloquea tras ese tiempo sin usarla (mínimo 1 min).</p>
        </div>
        <div className="actions">
          <button type="button" className="btn grow" onClick={onLock}>
            <Lock size={18} /> Bloquear ahora
          </button>
          <button type="button" className="btn grow" onClick={() => toggle('code')}>
            <KeyRound size={18} /> Cambiar código
          </button>
        </div>
        {panel === 'code' && <ChangeCodeForm onDone={done} onLock={onLock} />}
        <div className="field">
          <span>Huella / Face ID</span>
          {bioEnabled ? (
            <Toggle
              checked
              onChange={() => {
                if (window.confirm('¿Desactivar el desbloqueo con huella / Face ID? Tendrás que usar tu código.')) {
                  disableBiometric();
                  done('Huella / Face ID desactivado. Si quieres, borra la passkey "Mi Gestor" del gestor de contraseñas del teléfono.');
                }
              }}
              label="Desbloquear con huella o Face ID"
              description="Activado. Tu código sigue funcionando siempre."
            />
          ) : bioSupported === false ? (
            <p className="hint">
              Este teléfono o navegador no permite usar la huella en apps web. Necesitas Android con Chrome actualizado, o iPhone con iOS 18 o
              posterior y la app instalada desde Safari.
            </p>
          ) : (
            <>
              <button type="button" className="btn" onClick={() => toggle('biometric')} disabled={bioSupported === null}>
                <Fingerprint size={18} /> Activar huella / Face ID
              </button>
              {panel === 'biometric' && <BiometricForm onDone={done} onLock={onLock} />}
            </>
          )}
        </div>
        <div className="field">
          <span>Código de recuperación</span>
          <p className={`hint ${recoveryReady ? '' : 'warn-text'}`}>
            {recoveryReady
              ? '✅ Creado. Si olvidas tu código, en la pantalla de bloqueo toca «¿Olvidaste tu código?».'
              : '⚠️ Aún no tienes. Sin él, si olvidas tu código pierdes tus datos personales.'}
          </p>
          {panel !== 'recovery' && (
            <button type="button" className="btn" onClick={() => toggle('recovery')}>
              <KeyRound size={18} /> {recoveryReady ? 'Crear uno nuevo' : 'Crear código de recuperación'}
            </button>
          )}
          {panel === 'recovery' && (
            <div id="settings-recovery">
              <RecoveryForm onDone={done} onLock={onLock} />
            </div>
          )}
        </div>
        <div className="field">
          <span>Protección contra borrado</span>
          <p className="hint">
            {persistence === 'granted'
              ? '✅ Activa: el teléfono no borrará los datos de Mi Gestor para liberar espacio.'
              : isInstalled()
                ? 'El teléfono no la confirmó. Haz copias de seguridad de vez en cuando.'
                : '⚠️ Instala Mi Gestor en la pantalla de inicio: así el teléfono no borrará tus datos (en iPhone, Safari los borra tras 7 días sin usar la web).'}
          </p>
        </div>
        <Toggle
          checked={settings.notificationDetails}
          onChange={(v) => onChange({ notificationDetails: v })}
          label="Montos en las notificaciones"
          description="Apagado: los avisos no muestran montos ni descripciones en la pantalla bloqueada."
        />
        <Toggle
          checked={settings.wipeOnFailures}
          onChange={(v) => {
            if (!v || window.confirm(`Si alguien falla el código ${WIPE_AFTER_FAILURES} veces seguidas, se borrarán TODOS los datos. ¿Activar?`)) {
              onChange({ wipeOnFailures: v });
            }
          }}
          label={`Borrar todo tras ${WIPE_AFTER_FAILURES} intentos fallidos`}
          description="Protege tus documentos si te roban el teléfono. Ten una copia de seguridad."
        />
      </section>

      <section className="settings-group">
        <h3 className="card-title">
          <Zap size={18} /> Acceso rápido
        </h3>
        <Toggle
          checked={settings.quickAccess}
          onChange={toggleQuickAccess}
          label="Botones en la barra de notificaciones"
          description="Deja fija una notificación con «− Gasto» y «+ Ingreso». No muestra ningún dato tuyo."
        />
        <p className="hint">
          <b>Android:</b> mantén pulsado el icono de Mi Gestor para ver <b>Gasto rápido</b> e <b>Ingreso rápido</b>; puedes arrastrarlos a la
          pantalla de inicio como si fueran widgets. <b>iPhone:</b> las apps web no admiten botones en notificaciones ni atajos del icono.
        </p>
      </section>

      <section className="settings-group" id="settings-backup">
        <h3 className="card-title">Copia de seguridad cifrada</h3>
        <p className="hint">
          {settings.lastBackupAt
            ? `Última copia: ${new Date(settings.lastBackupAt).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })}.`
            : 'Aún no has hecho ninguna copia.'}
        </p>
        <p className="hint">Incluye movimientos, notas y documentos con fotos. Úsala para no perder nada o pasar tus datos a otro teléfono.</p>
        <div className="actions">
          <button type="button" className="btn grow" onClick={() => toggle('export')}>
            <Download size={18} /> Exportar
          </button>
          <button type="button" className="btn grow" onClick={() => toggle('import')}>
            <Upload size={18} /> Importar
          </button>
        </div>
        {panel === 'export' && <ExportForm onExport={onExport} onSaved={onBackupSaved} onDone={done} />}
        {panel === 'import' && <ImportForm onImport={onImport} onDone={done} current={currentCounts} />}
      </section>

      <section className="settings-group">
        <h3 className="card-title">
          <Tags size={18} /> Mis tipos de gasto e ingreso
        </h3>
        <CategoryManager categories={categories} onRename={onRenameCategory} onDelete={onDeleteCategory} />
      </section>

      <section className="settings-group">
        <h3 className="card-title">Apariencia y general</h3>
        <div className="field">
          <span>Moneda</span>
          <div className="chips">
            {CURRENCIES.map((c) => (
              <button type="button" key={c} className={`chip ${settings.currency === c ? 'on' : ''}`} aria-pressed={settings.currency === c} onClick={() => onChange({ currency: c })}>
                {c}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span>Colores</span>
          <div className="palette-grid" role="radiogroup" aria-label="Tema de colores">
            {PALETTES.map((p) => (
              <button
                type="button"
                key={p.id}
                role="radio"
                aria-checked={settings.palette === p.id}
                className={`palette-option ${settings.palette === p.id ? 'on' : ''}`}
                onClick={() => onChange({ palette: p.id })}
              >
                <span
                  className="palette-dot"
                  style={{ background: p[darkMode ? 'dark' : 'light'][0], '--dot-accent': p[darkMode ? 'dark' : 'light'][1] }}
                />
                {p.name}
              </button>
            ))}
          </div>
        </div>
        <Toggle
          checked={settings.countShared}
          onChange={(v) => onChange({ countShared: v })}
          label="Sumar mi parte de los gastos en común"
          description="Tu parte de cada gasto del grupo cuenta en tus gastos del mes y en tu presupuesto."
        />
        <div className="field">
          <span>Tamaño de letra</span>
          <div className="segmented">
            {TEXT_SIZES.map((t) => (
              <button type="button" key={t.value} className={settings.textSize === t.value ? 'on' : ''} aria-pressed={settings.textSize === t.value} onClick={() => onChange({ textSize: t.value })}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span>Modo</span>
          <div className="segmented">
            {THEMES.map((t) => (
              <button type="button" key={t.value} className={settings.theme === t.value ? 'on' : ''} aria-pressed={settings.theme === t.value} onClick={() => onChange({ theme: t.value })}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span>Recordatorios</span>
          {permission === 'granted' && <p className="hint">Activados. Te avisamos al abrir la app el día indicado.</p>}
          {permission === 'default' && (
            <button type="button" className="btn" onClick={enableNotifications}>
              <Bell size={18} /> Activar notificaciones
            </button>
          )}
          {permission === 'denied' && <p className="hint">Bloqueadas. Actívalas en los ajustes del navegador para esta app.</p>}
          {permission === 'unsupported' && (
            <p className="hint">Este navegador no admite notificaciones. En iPhone, primero añade la app a la pantalla de inicio.</p>
          )}
        </div>
        <div className="field">
          <span>Avisos con la app cerrada</span>
          <PushSection enabled={settings.pushEnabled} groups={groups} onEnable={onEnablePush} onDisable={onDisablePush} />
        </div>
        <div className="field">
          <span>Instalar en el teléfono</span>
          {installPrompt ? (
            <button type="button" className="btn" onClick={install}>
              <Smartphone size={18} /> Instalar Mi Gestor
            </button>
          ) : (
            <p className="hint">
              Android: menú ⋮ → <b>Instalar aplicación</b>. iPhone: botón Compartir → <b>Añadir a pantalla de inicio</b>.
            </p>
          )}
        </div>
      </section>

      <section className="settings-group" id="settings-share">
        <h3 className="card-title">
          <Share2 size={18} /> Compartir Mi Gestor
        </h3>
        <ShareApp />
      </section>

      <button
        type="button"
        className="btn danger ghost"
        onClick={() =>
          window.confirm('¿Borrar TODOS los datos de este teléfono? No se puede deshacer.') &&
          onReset().then(
            () => done('Datos borrados.'),
            () => done('No se pudieron borrar los datos.')
          )
        }
      >
        <Trash2 size={18} /> Borrar todos los datos
      </button>
    </div>
  );
}
