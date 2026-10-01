import { useCallback, useEffect, useState } from 'react';
import { ArrowLeftRight, CalendarDays, House, IdCard, Lock, Plus, Settings as SettingsIcon, StickyNote } from 'lucide-react';
import MovementForm from './components/MovementForm';
import Sheet from './components/Sheet';
import { backgroundAllowed } from './lib/autolock';
import { exportBackup } from './lib/backup';
import { notifyDueReminders } from './lib/notify';
import { DEFAULT_SETTINGS } from './lib/settings';
import { EMPTY_STATE } from './lib/store';
import CalendarView from './views/CalendarView';
import Documents from './views/Documents';
import Home from './views/Home';
import Movements from './views/Movements';
import Notes from './views/Notes';
import Settings from './views/Settings';

const TABS = [
  { id: 'home', label: 'Inicio', icon: House },
  { id: 'movements', label: 'Movimientos', icon: ArrowLeftRight },
  { id: 'calendar', label: 'Calendario', icon: CalendarDays },
  { id: 'documents', label: 'Documentos', icon: IdCard },
  { id: 'notes', label: 'Notas', icon: StickyNote },
];

const MIN_IDLE_MS = 60 * 1000;

export default function App({ session, settings, setSettings, onLock }) {
  const { store } = session;
  const [tab, setTab] = useState('home');
  const [movements, setMovements] = useState(session.state.movements ?? []);
  const [notes, setNotes] = useState(session.state.notes ?? []);
  const [categories, setCategories] = useState(session.state.categories ?? EMPTY_STATE.categories);
  const [saveError, setSaveError] = useState(false);
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { y: now.getFullYear(), m: now.getMonth() };
  });
  const [editing, setEditing] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Cada cambio se guarda cifrado.
  useEffect(() => {
    store
      .saveState({ movements, notes, categories })
      .then(() => setSaveError(false))
      .catch(() => setSaveError(true));
  }, [store, movements, notes, categories]);

  // Comprueba los recordatorios al abrir la app y cada vez que vuelve a primer plano.
  useEffect(() => {
    const check = () => {
      if (document.visibilityState === 'visible') {
        notifyDueReminders(movements, settings.currency, settings.notificationDetails).catch(() => {});
      }
    };
    check();
    document.addEventListener('visibilitychange', check);
    return () => document.removeEventListener('visibilitychange', check);
  }, [movements, settings.currency, settings.notificationDetails]);

  // Bloqueo automático: por inactividad y al volver de segundo plano.
  useEffect(() => {
    const limit = settings.autoLock * 60 * 1000;
    let lastActivity = Date.now();
    let hiddenAt = null;
    const touch = () => {
      lastActivity = Date.now();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        if (backgroundAllowed()) return;
        hiddenAt = Date.now();
        if (limit === 0) onLock();
      } else if (hiddenAt !== null && Date.now() - hiddenAt >= limit) {
        onLock();
      } else {
        hiddenAt = null;
        touch();
      }
    };
    const timer = setInterval(() => {
      if (Date.now() - lastActivity >= Math.max(limit, MIN_IDLE_MS) && !backgroundAllowed()) onLock();
    }, 10000);
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(timer);
      events.forEach((e) => window.removeEventListener(e, touch));
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [settings.autoLock, onLock]);

  const saveMovement = (movement) => {
    setMovements((list) =>
      list.some((m) => m.id === movement.id) ? list.map((m) => (m.id === movement.id ? movement : m)) : [...list, movement]
    );
    setEditing(null);
  };
  const deleteMovement = (id) => {
    setMovements((list) => list.filter((m) => m.id !== id));
    setEditing(null);
  };
  const addCategory = (type, name) => setCategories((c) => ({ ...c, [type]: [...(c[type] ?? []), name] }));

  const closeEditor = useCallback(() => setEditing(null), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const changeCursor = (y, m) => setCursor({ y, m });

  const importData = async (data) => {
    await store.clearDocuments();
    for (const doc of data.documents) await store.saveDocument(doc);
    setMovements(data.movements);
    setNotes(data.notes);
    setCategories(data.categories);
  };
  const resetAll = async () => {
    await store.clearDocuments();
    setMovements([]);
    setNotes([]);
    setCategories(EMPTY_STATE.categories);
  };

  const views = {
    home: (
      <Home
        movements={movements}
        notesCount={notes.length}
        currency={settings.currency}
        onAdd={setEditing}
        onEdit={setEditing}
        onNavigate={setTab}
      />
    ),
    movements: (
      <Movements movements={movements} currency={settings.currency} cursor={cursor} onCursor={changeCursor} onEdit={setEditing} />
    ),
    calendar: (
      <CalendarView
        movements={movements}
        currency={settings.currency}
        cursor={cursor}
        onCursor={changeCursor}
        onEdit={setEditing}
        onAdd={setEditing}
      />
    ),
    documents: <Documents store={store} />,
    notes: <Notes notes={notes} setNotes={setNotes} />,
  };

  const current = TABS.find((t) => t.id === tab);

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <p className="eyebrow">Mi Gestor</p>
          <h1>{current.label}</h1>
        </div>
        <div className="topbar-actions">
          <button type="button" className="icon-btn" onClick={onLock} aria-label="Bloquear">
            <Lock size={20} />
          </button>
          <button type="button" className="icon-btn" onClick={() => setSettingsOpen(true)} aria-label="Ajustes">
            <SettingsIcon size={22} />
          </button>
        </div>
      </header>

      {saveError && <p className="error banner">No se pudieron guardar los últimos cambios. Revisa el espacio del teléfono.</p>}

      <main className="content">{views[tab]}</main>

      {(tab === 'home' || tab === 'movements') && (
        <button type="button" className="fab" onClick={() => setEditing({})} aria-label="Nuevo gasto o ingreso">
          <Plus size={28} />
        </button>
      )}

      <nav className="tabbar">
        {TABS.map((t) => (
          <button
            type="button"
            key={t.id}
            className={tab === t.id ? 'on' : ''}
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? 'page' : undefined}
          >
            <t.icon size={22} />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>

      {editing && (
        <Sheet title={editing.id ? 'Editar movimiento' : 'Nuevo movimiento'} onClose={closeEditor}>
          <MovementForm
            initial={editing}
            categories={categories}
            currency={settings.currency}
            onAddCategory={addCategory}
            onSave={saveMovement}
            onDelete={deleteMovement}
          />
        </Sheet>
      )}

      {settingsOpen && (
        <Sheet title="Ajustes" onClose={closeSettings}>
          <Settings
            settings={settings}
            onChange={(patch) => setSettings((s) => ({ ...DEFAULT_SETTINGS, ...s, ...patch }))}
            onExport={(password) => exportBackup(store, { movements, notes, categories }, password)}
            onImport={importData}
            onReset={resetAll}
            onLock={onLock}
          />
        </Sheet>
      )}
    </div>
  );
}
