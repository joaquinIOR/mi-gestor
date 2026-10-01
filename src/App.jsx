import { useCallback, useEffect, useState } from 'react';
import { ArrowLeftRight, CalendarDays, House, IdCard, Plus, Settings as SettingsIcon, StickyNote } from 'lucide-react';
import MovementForm from './components/MovementForm';
import Sheet from './components/Sheet';
import { exportBackup, readBackup } from './lib/backup';
import { clearDocuments } from './lib/documentsDb';
import { notifyDueReminders } from './lib/notify';
import { useLocalState } from './lib/storage';
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

const DEFAULT_SETTINGS = { currency: '$', theme: 'auto' };
const EMPTY_CATEGORIES = { expense: [], income: [] };

export default function App() {
  const [tab, setTab] = useState('home');
  const [movements, setMovements] = useLocalState('miGestor.movements', []);
  const [notes, setNotes] = useLocalState('miGestor.notes', []);
  const [categories, setCategories] = useLocalState('miGestor.categories', EMPTY_CATEGORIES);
  const [storedSettings, setSettings] = useLocalState('miGestor.settings', DEFAULT_SETTINGS);
  const settings = { ...DEFAULT_SETTINGS, ...storedSettings };
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { y: now.getFullYear(), m: now.getMonth() };
  });
  const [editing, setEditing] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'auto') root.removeAttribute('data-theme');
    else root.dataset.theme = settings.theme;
  }, [settings.theme]);

  // Comprueba los recordatorios al abrir la app y cada vez que vuelve a primer plano.
  useEffect(() => {
    const check = () => {
      if (document.visibilityState === 'visible') notifyDueReminders(movements, settings.currency).catch(() => {});
    };
    check();
    document.addEventListener('visibilitychange', check);
    return () => document.removeEventListener('visibilitychange', check);
  }, [movements, settings.currency]);

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

  const importData = async (file) => {
    const data = await readBackup(file);
    setMovements(data.movements);
    setNotes(data.notes);
    setCategories(data.categories);
    if (data.settings) setSettings({ ...DEFAULT_SETTINGS, ...data.settings });
  };
  const resetAll = async () => {
    await clearDocuments();
    setMovements([]);
    setNotes([]);
    setCategories(EMPTY_CATEGORIES);
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
    documents: <Documents />,
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
        <button type="button" className="icon-btn" onClick={() => setSettingsOpen(true)} aria-label="Ajustes">
          <SettingsIcon size={22} />
        </button>
      </header>

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
            onExport={() => exportBackup({ movements, notes, categories, settings })}
            onImport={importData}
            onReset={resetAll}
          />
        </Sheet>
      )}
    </div>
  );
}
