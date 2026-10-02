import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeftRight, CalendarDays, HardDriveDownload, House, IdCard, KeyRound, Lock, Plus, Settings as SettingsIcon, StickyNote, Users } from 'lucide-react';
import BudgetAlert from './components/BudgetAlert';
import MovementForm from './components/MovementForm';
import Sheet from './components/Sheet';
import { backgroundAllowed } from './lib/autolock';
import { exportBackup } from './lib/backup';
import { budgetAlert, monthSpent } from './lib/budget';
import { formatMoney } from './lib/format';
import { notifyDueReminders } from './lib/notify';
import { backupDue, requestPersistence, snoozeUntil } from './lib/persist';
import { hasRecovery } from './lib/vault';
import { applySync, syncGroup, upsertLocal } from './lib/shared';
import { DEFAULT_SETTINGS } from './lib/settings';
import { EMPTY_STATE } from './lib/store';
import CalendarView from './views/CalendarView';
import Documents from './views/Documents';
import Group from './views/Group';
import Home from './views/Home';
import Movements from './views/Movements';
import Notes from './views/Notes';
import Settings from './views/Settings';

const TABS = [
  { id: 'home', label: 'Inicio', icon: House },
  { id: 'movements', label: 'Historial', title: 'Movimientos', icon: ArrowLeftRight },
  { id: 'calendar', label: 'Calendario', icon: CalendarDays },
  { id: 'group', label: 'Grupo', title: 'Gastos en común', icon: Users },
  { id: 'documents', label: 'Docs', title: 'Documentos', icon: IdCard },
  { id: 'notes', label: 'Notas', icon: StickyNote },
];

const MIN_IDLE_MS = 60 * 1000;
const SYNC_EVERY_MS = 4000;

export default function App({ session, settings, setSettings, quick, invite, onInviteHandled, onLock }) {
  const { store } = session;
  const [tab, setTab] = useState(invite ? 'group' : 'home');
  const [movements, setMovements] = useState(session.state.movements ?? []);
  const [notes, setNotes] = useState(session.state.notes ?? []);
  const [categories, setCategories] = useState(session.state.categories ?? EMPTY_STATE.categories);
  const [budget, setBudget] = useState(session.state.budget ?? null);
  const [groups, setGroups] = useState(session.state.groups ?? []);
  const [syncInfo, setSyncInfo] = useState({});
  const [toast, setToast] = useState(null);
  const [saveError, setSaveError] = useState(false);
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { y: now.getFullYear(), m: now.getMonth() };
  });
  const [editing, setEditing] = useState(() => (quick ? { type: quick.type, express: true } : null));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsPanel, setSettingsPanel] = useState(null);
  const [alert, setAlert] = useState(null);
  const [persistence, setPersistence] = useState(null);
  const [recoveryReady, setRecoveryReady] = useState(hasRecovery);
  const [now] = useState(() => Date.now());

  // Pide al teléfono que no borre los datos de la app.
  useEffect(() => {
    requestPersistence().then(setPersistence);
  }, []);
  // Abre el formulario rápido si llega una petición mientras la app está desbloqueada.
  const [seenQuick, setSeenQuick] = useState(quick);
  if (quick && quick !== seenQuick) {
    setSeenQuick(quick);
    setSettingsOpen(false);
    setEditing({ type: quick.type, express: true });
  }

  // Cada cambio se guarda cifrado.
  useEffect(() => {
    store
      .saveState({ movements, notes, categories, budget, groups })
      .then(() => setSaveError(false))
      .catch(() => setSaveError(true));
  }, [store, movements, notes, categories, budget, groups]);

  // --- Gastos en común: sincronización cifrada con el servidor ---
  const groupsRef = useRef(groups);
  const syncing = useRef(false);
  useEffect(() => {
    groupsRef.current = groups;
  }, [groups]);

  const runSync = useCallback(async () => {
    if (syncing.current || document.visibilityState !== 'visible') return;
    syncing.current = true;
    try {
      for (const snapshot of groupsRef.current) {
        try {
          const result = await syncGroup(snapshot);
          const current = groupsRef.current.find((g) => g.id === result.id);
          if (!current) continue;
          const { group: merged, news } = applySync(current, result);
          const changed = result.pushed.length || result.cursor !== current.cursor || news.length;
          if (changed || result.incoming.length) setGroups((gs) => gs.map((g) => (g.id === result.id ? applySync(g, result).group : g)));
          setSyncInfo((info) => ({ ...info, [result.id]: { at: Date.now(), error: null } }));
          const latest = news[news.length - 1];
          if (latest) {
            const who = merged.entries[latest.createdBy ?? latest.id]?.name ?? latest.name ?? 'Alguien';
            const text =
              latest.kind === 'member'
                ? `${latest.name} se unió a «${current.name}»`
                : latest.kind === 'settle'
                  ? `${who} registró un pago de ${formatMoney(latest.amount, settings.currency)}`
                  : `${who} agregó «${latest.description || latest.category}» · ${formatMoney(latest.amount, settings.currency)}`;
            setToast({ text, at: Date.now() });
            navigator.vibrate?.(60);
          }
        } catch (err) {
          setSyncInfo((info) => ({ ...info, [snapshot.id]: { at: info[snapshot.id]?.at ?? null, error: err.message } }));
        }
      }
    } finally {
      syncing.current = false;
    }
  }, [settings.currency]);

  useEffect(() => {
    if (!groups.length) return;
    runSync();
    const timer = setInterval(runSync, SYNC_EVERY_MS);
    document.addEventListener('visibilitychange', runSync);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', runSync);
    };
  }, [groups.length, runSync]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(timer);
  }, [toast]);

  const addGroup = (group) => {
    setGroups((gs) => [...gs.filter((g) => g.id !== group.id), group]);
    onInviteHandled();
  };
  const saveSharedEntry = (groupId, entry) => {
    setGroups((gs) => gs.map((g) => (g.id === groupId ? upsertLocal(g, entry) : g)));
    setTimeout(runSync, 50);
  };
  const leaveGroup = (groupId) => setGroups((gs) => gs.filter((g) => g.id !== groupId));

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

  // Avisa si el cambio hace cruzar el presupuesto del mes (o el aviso previo).
  const checkBudget = (nextMovements, nextBudget = budget) => {
    const found = budgetAlert({
      before: monthSpent(movements),
      after: monthSpent(nextMovements),
      budgetBefore: budget,
      budgetAfter: nextBudget,
      settings,
    });
    if (found) setAlert(found);
  };

  const saveMovement = (movement) => {
    const next = movements.some((m) => m.id === movement.id)
      ? movements.map((m) => (m.id === movement.id ? movement : m))
      : [...movements, movement];
    setMovements(next);
    setEditing(null);
    checkBudget(next);
  };
  const deleteMovement = (id) => {
    setMovements((list) => list.filter((m) => m.id !== id));
    setEditing(null);
  };
  const changeBudget = (value) => {
    setBudget(value);
    checkBudget(movements, value);
  };
  const closeAlert = useCallback(() => setAlert(null), []);
  const addCategory = (type, name) => setCategories((c) => ({ ...c, [type]: [...(c[type] ?? []), name] }));

  const closeEditor = useCallback(() => setEditing(null), []);
  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
    setRecoveryReady(hasRecovery());
  }, []);
  const openSettings = (panel = null) => {
    setSettingsPanel(panel);
    setSettingsOpen(true);
  };
  const backup = backupDue(settings, now, movements.length + notes.length >= 3);
  const changeCursor = (y, m) => setCursor({ y, m });

  const importData = async (data) => {
    await store.clearDocuments();
    for (const doc of data.documents) await store.saveDocument(doc);
    setMovements(data.movements);
    setNotes(data.notes);
    setCategories(data.categories);
    setBudget(data.budget);
    setGroups(data.groups);
  };
  const resetAll = async () => {
    await store.clearDocuments();
    setMovements([]);
    setNotes([]);
    setCategories(EMPTY_STATE.categories);
    setBudget(null);
    setGroups([]);
  };

  const views = {
    home: (
      <Home
        movements={movements}
        notesCount={notes.length}
        currency={settings.currency}
        budget={budget}
        onSetBudget={changeBudget}
        settings={settings}
        onSettings={(patch) => setSettings((s) => ({ ...DEFAULT_SETTINGS, ...s, ...patch }))}
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
    group: (
      <Group
        groups={groups}
        syncInfo={syncInfo}
        invite={invite}
        currency={settings.currency}
        categories={categories}
        onAddGroup={addGroup}
        onSaveEntry={saveSharedEntry}
        onLeave={leaveGroup}
        onSyncNow={runSync}
      />
    ),
    notes: <Notes notes={notes} setNotes={setNotes} />,
  };

  const current = TABS.find((t) => t.id === tab);

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <p className="eyebrow">Mi Gestor</p>
          <h1>{current.title ?? current.label}</h1>
        </div>
        <div className="topbar-actions">
          <button type="button" className="icon-btn" onClick={onLock} aria-label="Bloquear">
            <Lock size={20} />
          </button>
          <button type="button" className="icon-btn" onClick={() => openSettings()} aria-label="Ajustes">
            <SettingsIcon size={22} />
          </button>
        </div>
      </header>

      {saveError && <p className="error banner">No se pudieron guardar los últimos cambios. Revisa el espacio del teléfono.</p>}

      {tab === 'home' && !recoveryReady && (
        <div className="notice warn">
          <KeyRound size={22} />
          <div className="notice-text">
            <b>Crea tu código de recuperación</b>
            <p>Si olvidas tu código, es la única forma de no perder tus datos.</p>
          </div>
          <button type="button" className="btn small primary" onClick={() => openSettings('recovery')}>
            Crear
          </button>
        </div>
      )}
      {tab === 'home' && backup && (
        <div className="notice">
          <HardDriveDownload size={22} />
          <div className="notice-text">
            <b>Haz una copia de seguridad</b>
            <p>{backup.never ? 'Aún no tienes ninguna copia.' : `Tu última copia fue hace ${backup.days} días.`}</p>
          </div>
          <div className="notice-actions">
            <button type="button" className="btn small primary" onClick={() => openSettings('export')}>
              Hacer copia
            </button>
            <button type="button" className="btn small ghost" onClick={() => setSettings((s) => ({ ...DEFAULT_SETTINGS, ...s, backupSnoozeUntil: snoozeUntil(Date.now()) }))}>
              Más tarde
            </button>
          </div>
        </div>
      )}

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
        <Sheet
          title={editing.id ? 'Editar movimiento' : editing.cardPayment ? 'Pago de tarjeta' : editing.express ? (editing.type === 'income' ? 'Ingreso rápido' : 'Gasto rápido') : 'Nuevo movimiento'}
          onClose={closeEditor}
        >
          <MovementForm
            key={editing.id ?? `${editing.type}-${editing.express}-${editing.cardPayment}-${editing.date}`}
            initial={editing}
            categories={categories}
            currency={settings.currency}
            onAddCategory={addCategory}
            onSave={saveMovement}
            onDelete={deleteMovement}
          />
        </Sheet>
      )}

      {toast && (
        <div className="toast" role="status" onClick={() => { setToast(null); setTab('group'); }}>
          <Users size={18} /> {toast.text}
        </div>
      )}

      {alert && (
        <BudgetAlert
          alert={alert}
          currency={settings.currency}
          onClose={closeAlert}
          onShow={() => {
            setAlert(null);
            setTab('home');
            requestAnimationFrame(() => document.querySelector('.budget')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
          }}
        />
      )}

      {settingsOpen && (
        <Sheet title="Ajustes" onClose={closeSettings}>
          <Settings
            settings={settings}
            onChange={(patch) => setSettings((s) => ({ ...DEFAULT_SETTINGS, ...s, ...patch }))}
            onExport={async (password) => {
              await exportBackup(store, { movements, notes, categories, budget, groups }, password);
              setSettings((s) => ({ ...DEFAULT_SETTINGS, ...s, lastBackupAt: Date.now(), backupSnoozeUntil: 0 }));
            }}
            initialPanel={settingsPanel}
            persistence={persistence}
            onImport={importData}
            onReset={resetAll}
            onLock={onLock}
          />
        </Sheet>
      )}
    </div>
  );
}
