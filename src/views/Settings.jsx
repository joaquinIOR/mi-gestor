import { useState } from 'react';
import { Bell, Download, Smartphone, Trash2, Upload } from 'lucide-react';
import { notificationsSupported } from '../lib/notify';

const CURRENCIES = ['$', '€', 'S/', 'Bs', 'Q', '₡', 'L'];
const THEMES = [
  { value: 'auto', label: 'Automático' },
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Oscuro' },
];

export default function Settings({ settings, onChange, onExport, onImport, onReset }) {
  const [permission, setPermission] = useState(() => (notificationsSupported() ? Notification.permission : 'unsupported'));
  const [installPrompt, setInstallPrompt] = useState(() => window.deferredInstallPrompt ?? null);
  const [status, setStatus] = useState('');

  const enableNotifications = async () => setPermission(await Notification.requestPermission());

  const install = async () => {
    installPrompt.prompt();
    await installPrompt.userChoice;
    window.deferredInstallPrompt = null;
    setInstallPrompt(null);
  };

  const run = async (action, done) => {
    setStatus('');
    try {
      await action();
      if (done) setStatus(done);
    } catch (err) {
      setStatus(err.message || 'Algo salió mal.');
    }
  };

  return (
    <div className="form">
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

      <div className="field">
        <span>Copia de seguridad</span>
        <p className="hint">Incluye movimientos, notas y documentos con fotos. Úsala para pasar tus datos a otro teléfono.</p>
        <div className="actions">
          <button type="button" className="btn grow" onClick={() => run(onExport, 'Copia descargada.')}>
            <Download size={18} /> Exportar
          </button>
          <label className="btn grow">
            <Upload size={18} /> Importar
            <input
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const file = e.target.files[0];
                e.target.value = '';
                if (file && window.confirm('Esto reemplaza todos los datos actuales. ¿Continuar?')) {
                  run(() => onImport(file), 'Datos restaurados.');
                }
              }}
            />
          </label>
        </div>
      </div>

      {status && <p className="hint">{status}</p>}

      <button
        type="button"
        className="btn danger ghost"
        onClick={() => window.confirm('¿Borrar TODOS los datos de este teléfono? No se puede deshacer.') && run(onReset, 'Datos borrados.')}
      >
        <Trash2 size={18} /> Borrar todos los datos
      </button>
    </div>
  );
}
