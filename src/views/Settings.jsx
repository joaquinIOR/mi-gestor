import { useState } from 'react';
import { Bell, Download, KeyRound, Lock, ShieldAlert, Smartphone, Trash2, Upload } from 'lucide-react';
import { allowBackgroundBriefly } from '../lib/autolock';
import { isEncryptedBackup, MIN_BACKUP_PASSWORD, openBackup, readBackupFile } from '../lib/backup';
import { notificationsSupported } from '../lib/notify';
import { AUTO_LOCK_OPTIONS, CURRENCIES } from '../lib/settings';
import { changeCode, codeWarning, MIN_CODE_LENGTH, WIPE_AFTER_FAILURES, WrongCodeError } from '../lib/vault';

const THEMES = [
  { value: 'auto', label: 'Automático' },
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

function ChangeCodeForm({ onDone }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (next.length < MIN_CODE_LENGTH) return setError(`El código nuevo debe tener al menos ${MIN_CODE_LENGTH} caracteres.`);
    if (next !== confirm) return setError('Los códigos nuevos no coinciden.');
    setBusy(true);
    try {
      await changeCode(current, next);
      onDone('Código cambiado.');
    } catch (err) {
      setError(err instanceof WrongCodeError ? 'El código actual no es correcto.' : 'No se pudo cambiar el código.');
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
    </form>
  );
}

function ExportForm({ onExport, onDone }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (password.length < MIN_BACKUP_PASSWORD) return setError(`Usa al menos ${MIN_BACKUP_PASSWORD} caracteres.`);
    if (password !== confirm) return setError('Las contraseñas no coinciden.');
    setBusy(true);
    try {
      await onExport(password);
      onDone('Copia cifrada descargada. Guarda la contraseña en un lugar seguro: sin ella no se puede abrir.');
    } catch {
      setError('No se pudo crear la copia.');
      setBusy(false);
    }
  };

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

function ImportForm({ onImport, onDone }) {
  const [backup, setBackup] = useState(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const restore = async (json, pass) => {
    if (!window.confirm('Esto reemplaza todos los datos actuales. ¿Continuar?')) return;
    setBusy(true);
    setError('');
    try {
      await onImport(await openBackup(json, pass));
      onDone('Datos restaurados.');
    } catch (err) {
      setError(err.message || 'No se pudo restaurar la copia.');
      setBusy(false);
    }
  };

  const pick = async (e) => {
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

export default function Settings({ settings, onChange, onExport, onImport, onReset, onLock }) {
  const [permission, setPermission] = useState(() => (notificationsSupported() ? Notification.permission : 'unsupported'));
  const [installPrompt, setInstallPrompt] = useState(() => window.deferredInstallPrompt ?? null);
  const [panel, setPanel] = useState(null);
  const [status, setStatus] = useState('');

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
  };

  return (
    <div className="form">
      <section className="settings-group">
        <h3 className="card-title">
          <ShieldAlert size={18} /> Seguridad
        </h3>
        <div className="field">
          <span>Bloquear automáticamente</span>
          <div className="segmented">
            {AUTO_LOCK_OPTIONS.map((o) => (
              <button type="button" key={o.value} className={settings.autoLock === o.value ? 'on' : ''} onClick={() => onChange({ autoLock: o.value })}>
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
        {panel === 'code' && <ChangeCodeForm onDone={done} />}
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
        <h3 className="card-title">Copia de seguridad cifrada</h3>
        <p className="hint">Incluye movimientos, notas y documentos con fotos. Úsala para no perder nada o pasar tus datos a otro teléfono.</p>
        <div className="actions">
          <button type="button" className="btn grow" onClick={() => toggle('export')}>
            <Download size={18} /> Exportar
          </button>
          <button type="button" className="btn grow" onClick={() => toggle('import')}>
            <Upload size={18} /> Importar
          </button>
        </div>
        {panel === 'export' && <ExportForm onExport={onExport} onDone={done} />}
        {panel === 'import' && <ImportForm onImport={onImport} onDone={done} />}
      </section>

      {status && <p className="status">{status}</p>}

      <section className="settings-group">
        <h3 className="card-title">General</h3>
        <div className="field">
          <span>Moneda</span>
          <div className="chips">
            {CURRENCIES.map((c) => (
              <button type="button" key={c} className={`chip ${settings.currency === c ? 'on' : ''}`} onClick={() => onChange({ currency: c })}>
                {c}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span>Tema</span>
          <div className="segmented">
            {THEMES.map((t) => (
              <button type="button" key={t.value} className={settings.theme === t.value ? 'on' : ''} onClick={() => onChange({ theme: t.value })}>
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
