import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeftRight, CalendarDays, Check, HardDriveDownload, House, IdCard, KeyRound, Lock, Plus, RefreshCw, Settings as SettingsIcon, Smartphone, StickyNote, Users } from 'lucide-react';
import BudgetAlert from './components/BudgetAlert';
import Goals from './components/Goals';
import MovementForm from './components/MovementForm';
import Sheet from './components/Sheet';
import { autoLockHeld, backgroundAllowed, endBackgroundAllowance, graceUntil } from './lib/autolock';
import { reloadApp, useBackClose } from './lib/back';
import { exportBackup } from './lib/backup';
import { budgetAlert, monthSpent } from './lib/budget';
import { categoryList } from './lib/categories';
import { formatMoney } from './lib/format';
import { withPaid } from './lib/recurrence';
import { todayKey } from './lib/dates';
import { notifyDueReminders } from './lib/notify';
import { backupDue, isInstalled, isIOS, requestPersistence, snoozeUntil } from './lib/persist';
import { currentEndpoint, disablePush, enablePush, newDeviceTag, notifyGroup, pushSupported, registerGroups, reminderTimes, syncSchedule } from './lib/push';
import { hasRecovery } from './lib/vault';
import { applySync, billReminders, rpc, syncGroup, upsertLocal } from './lib/shared';
import { DEFAULT_SETTINGS, portableSettings } from './lib/settings';
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
  { id: 'movements', label: 'Historial', icon: ArrowLeftRight },
  { id: 'calendar', label: 'Calendario', short: 'Agenda', icon: CalendarDays },
  { id: 'group', label: 'Grupo', title: 'Gastos en común', icon: Users },
  { id: 'documents', label: 'Docs', title: 'Documentos', icon: IdCard },
  { id: 'notes', label: 'Notas', icon: StickyNote },
];

const MIN_IDLE_MS = 60 * 1000;
const SYNC_EVERY_MS = 4000;

export default function App({ session, settings, setSettings, quick, invite, onInviteHandled, onLock, updateReady }) {
  const { store } = session;
  const [tab, setTab] = useState(invite ? 'group' : 'home');
  // Sección del grupo (Gastos, Cuentas fijas, Compras): se recuerda al cambiar de pestaña.
  const [groupSection, setGroupSection] = useState('gastos');
  const goTo = (target, section) => {
    if (section) setGroupSection(section);
    setTab(target);
  };
  const [movements, setMovements] = useState(session.state.movements ?? []);
  const [notes, setNotes] = useState(session.state.notes ?? []);
  const [categories, setCategories] = useState(session.state.categories ?? EMPTY_STATE.categories);
  const [budget, setBudget] = useState(session.state.budget ?? null);
  const [groups, setGroups] = useState(session.state.groups ?? []);
  const [goals, setGoals] = useState(session.state.goals ?? []);
  const [goalsOpen, setGoalsOpen] = useState(false);
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

  // Cada pestaña empieza arriba.
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [tab]);

  // «Atrás» desde otra pestaña vuelve a Inicio (y desde Inicio sale de la app, como siempre).
  useBackClose(() => setTab('home'), tab !== 'home', { base: true });

  // Vencimientos de documentos (carnet, licencia…): se avisan 30 días antes, como un recordatorio más.
  const [docMeta, setDocMeta] = useState([]);
  const loadDocMeta = useCallback(() => store.listDocumentMeta().then(setDocMeta).catch(() => {}), [store]);
  useEffect(() => {
    loadDocMeta();
  }, [loadDocMeta]);
  const docReminders = useMemo(
    () =>
      docMeta
        .filter((d) => d.expiry)
        .map((d) => ({ id: `doc:${d.id}`, type: 'expense', amount: 0, category: 'Documentos', description: d.name, date: d.expiry, frequency: 'once', until: null, reminder: 30, doc: true })),
    [docMeta]
  );

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

  // Si la app está abierta en otra ventana y allí se guarda algo, esta queda desactualizada: se bloquea
  // (al desbloquear, carga lo último) en vez de pisar esos cambios.
  const stale = useRef(false);
  const channel = useRef(null);
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return undefined;
    const ch = new BroadcastChannel('mi-gestor-estado');
    channel.current = ch;
    // Se bloquea enseguida: así nadie sigue escribiendo en una ventana con datos viejos.
    ch.onmessage = (e) => {
      if (e.data?.type !== 'saved') return;
      stale.current = true;
      onLock({ quiet: true });
    };
    const onVisible = () => stale.current && document.visibilityState === 'visible' && onLock({ quiet: true });
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      ch.close();
      channel.current = null;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [onLock]);

  // Cada cambio se guarda cifrado. Si falla (por ejemplo, sin espacio), se reintenta y se avisa.
  const latestState = useRef(null);
  const saveFailed = useRef(false);
  const persist = useCallback(
    () =>
      store.saveState(latestState.current).then(
        () => {
          saveFailed.current = false;
          setSaveError(false);
          channel.current?.postMessage({ type: 'saved' });
        },
        () => {
          saveFailed.current = true;
          setSaveError(true);
        }
      ),
    [store]
  );
  useEffect(() => {
    if (stale.current) return onLock({ quiet: true });
    latestState.current = { movements, notes, categories, budget, groups, goals };
    persist();
  }, [persist, onLock, movements, notes, categories, budget, groups, goals]);
  useEffect(() => {
    if (!saveError) return undefined;
    const timer = setInterval(persist, 5000);
    return () => clearInterval(timer);
  }, [saveError, persist]);
  // Último intento al bloquear o cerrar, si quedó algo sin guardar.
  useEffect(() => () => saveFailed.current && store.saveState(latestState.current).catch(() => {}), [store]);

  // --- Gastos en común: sincronización cifrada con el servidor ---
  const groupsRef = useRef(groups);
  const syncing = useRef(false);
  const settingsRef = useRef(settings);
  const lastNotify = useRef({});
  const pushReachable = useRef({});
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);
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
          // Si el grupo se reemplazó mientras tanto (restaurar una copia, volver a unirse), se descarta.
          const current = groupsRef.current.find((g) => g.id === result.id && g.epoch === result.epoch);
          if (!current) continue;
          const { group: merged, news } = applySync(current, result);
          // Solo se guarda (y se vuelve a cifrar) si hubo cambios de verdad.
          const changed =
            result.pushed.length > 0 || result.cursor !== current.cursor || result.incoming.some((e) => current.entries[e.id]?._ts !== e._ts);
          if (changed) {
            setGroups((gs) => gs.map((g) => (g.id === result.id && g.epoch === result.epoch ? applySync(g, result).group : g)));
          }
          // Avisa a los otros teléfonos del grupo (como máximo una vez cada 20 s), aunque este teléfono no
          // tenga los avisos activados. Cambios de perfil y marcar productos de la lista no avisan.
          const sent = snapshot.outbox.filter((e) => result.pushed.includes(`${e.id}:${e.updatedAt}`));
          const worthNotifying = sent.some((e) => (e.kind === 'item' ? !snapshot.entries[e.id]?._ts : e.kind !== 'member'));
          if (worthNotifying && pushReachable.current[current.server.url] !== false && Date.now() - (lastNotify.current[result.id] ?? 0) > 20000) {
            lastNotify.current[result.id] = Date.now();
            notifyGroup(current, settingsRef.current.deviceTag ?? newDeviceTag()).then((ok) => {
              if (ok === false) pushReachable.current[current.server.url] = false;
            });
          }
          setSyncInfo((info) => ({ ...info, [result.id]: { at: Date.now(), error: null } }));
          const latest = news[news.length - 1];
          if (latest) {
            const who = merged.entries[latest.change ? latest.updatedBy : latest.createdBy ?? latest.id]?.name ?? latest.name ?? 'Alguien';
            const label = latest.kind === 'bill' ? latest.name : latest.kind === 'settle' ? 'un pago' : `«${latest.description || latest.category}»`;
            const text = latest.change
              ? `${who} ${latest.change === 'deleted' ? 'eliminó' : 'cambió'} ${latest.kind === 'bill' ? `la cuenta «${label}»` : label} en «${current.name}»`
              : latest.kind === 'member'
                ? `${latest.name} se unió a «${current.name}»`
                : latest.kind === 'item'
                  ? `${who} agregó «${latest.text}» a la lista de compras`
                  : latest.kind === 'bill'
                    ? `${who} agregó la cuenta «${latest.name}»`
                    : latest.billId
                      ? `${who} pagó la cuenta «${latest.description}» · ${formatMoney(latest.amount, settings.currency)}`
                      : latest.kind === 'settle'
                  ? `${who} registró un pago de ${formatMoney(latest.amount, settings.currency)}`
                  : `${who} agregó «${latest.description || latest.category}» · ${formatMoney(latest.amount, settings.currency)}`;
            const section = latest.kind === 'item' ? 'lista' : latest.kind === 'bill' || latest.billId ? 'casa' : 'gastos';
            setToast({ text, section, at: Date.now() });
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
    const timer = setTimeout(() => setToast(null), toast.action ? 6000 : toast.section ? 4500 : 2500);
    return () => clearTimeout(timer);
  }, [toast]);

  // Nunca reemplaza un grupo que ya está en este teléfono (se perderían cambios sin enviar).
  const addGroup = (group) => {
    if (groupsRef.current.some((g) => g.id === group.id)) {
      onInviteHandled();
      return;
    }
    setGroups((gs) => (gs.some((g) => g.id === group.id) ? gs : [...gs, group]));
    onInviteHandled();
    if (settings.pushEnabled) registerGroups([group], settings.deviceTag).catch(() => {});
  };

  // Avisos con la app cerrada.
  const patchSettings = (patch) => setSettings((s) => ({ ...DEFAULT_SETTINGS, ...s, ...patch }));
  const turnOnPush = async () => {
    const deviceTag = settings.deviceTag ?? newDeviceTag();
    const endpoint = await enablePush(groups, deviceTag);
    patchSettings({ pushEnabled: true, pushEndpoint: endpoint, deviceTag });
  };
  const turnOffPush = async () => {
    await disablePush(groups).catch(() => {});
    patchSettings({ pushEnabled: false, pushEndpoint: null });
  };
  // Cada teléfono tiene una etiqueta al azar: así el servidor no le avisa de sus propios cambios.
  useEffect(() => {
    if (!settings.deviceTag) patchSettings({ deviceTag: newDeviceTag() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.deviceTag]);

  // Si el teléfono anuló la suscripción (permiso quitado, datos borrados), se repara sola o se apaga.
  useEffect(() => {
    if (!settings.pushEnabled || !pushSupported() || !groups.length) return;
    let alive = true;
    currentEndpoint()
      .then(async (endpoint) => {
        if (!alive || endpoint === settings.pushEndpoint) return;
        if (Notification.permission === 'granted') {
          const fresh = await enablePush(groupsRef.current, settings.deviceTag ?? newDeviceTag());
          if (alive) patchSettings({ pushEndpoint: fresh });
        } else if (alive) {
          patchSettings({ pushEnabled: false, pushEndpoint: null });
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
    // Solo al abrir la app y al cambiar la configuración de avisos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.pushEnabled, settings.pushEndpoint, groups.length > 0]);
  const scheduleKey = useRef('');
  useEffect(() => {
    if (!settings.pushEnabled || !settings.pushEndpoint || !groups.length) return;
    const timer = setTimeout(() => {
      const times = reminderTimes([...withPaid(movements), ...billReminders(groups), ...docReminders]);
      const key = JSON.stringify([settings.pushEndpoint, groups[0].server.url, times]);
      if (key === scheduleKey.current) return;
      syncSchedule(groups[0].server, settings.pushEndpoint, times)
        .then(() => {
          scheduleKey.current = key;
        })
        .catch(() => {});
    }, 2000);
    return () => clearTimeout(timer);
  }, [movements, groups, docReminders, settings.pushEnabled, settings.pushEndpoint]);
  const saveSharedEntry = (groupId, entry) => {
    setGroups((gs) => gs.map((g) => (g.id === groupId ? upsertLocal(g, entry) : g)));
    if (entry.kind === 'expense') checkBudget(movements, budget, groups.map((g) => (g.id === groupId ? upsertLocal(g, entry) : g)));
    setTimeout(runSync, 50);
  };
  // Salir: primero se avisa al grupo (te quita de la lista y envía lo pendiente), después se borra de aquí.
  const leaveGroup = async (groupId) => {
    const group = groupsRef.current.find((g) => g.id === groupId);
    if (!group) return;
    const me = group.entries[group.me];
    try {
      await syncGroup(me ? upsertLocal(group, { ...me, deleted: true }) : group);
    } catch {
      const pending = group.outbox.length;
      const lost = pending ? ` ${pending === 1 ? 'Hay 1 cambio sin enviar que se perderá' : `Hay ${pending} cambios sin enviar que se perderán`}, y` : '';
      if (!window.confirm(`No hay conexión con el grupo.${lost} las demás personas te seguirán viendo como integrante. ¿Salir igual?`)) return;
    }
    const rest = groupsRef.current.filter((g) => g.id !== groupId);
    // Avisos: este teléfono deja de recibir los de ese grupo (y se vuelven a enviar sus recordatorios a los demás).
    if (settings.pushEnabled && settings.pushEndpoint) {
      await rpc(group.server, 'mg_push_unregister', { p_endpoint: settings.pushEndpoint }).catch(() => {});
      if (rest.length) await registerGroups(rest, settings.deviceTag).catch(() => {});
      else await turnOffPush();
      scheduleKey.current = '';
    }
    setGroups((gs) => gs.filter((g) => g.id !== groupId));
  };

  // Comprueba los recordatorios al abrir la app y cada vez que vuelve a primer plano.
  useEffect(() => {
    const check = () => {
      if (document.visibilityState === 'visible') {
        notifyDueReminders([...withPaid(movements), ...billReminders(groups), ...docReminders], settings.currency, settings.notificationDetails, store).catch(() => {});
      }
    };
    check();
    document.addEventListener('visibilitychange', check);
    return () => document.removeEventListener('visibilitychange', check);
  }, [store, movements, groups, docReminders, settings.currency, settings.notificationDetails]);

  // Bloqueo automático: por inactividad y al volver de segundo plano.
  useEffect(() => {
    const limit = settings.autoLock * 60 * 1000;
    let lastActivity = Date.now();
    let hiddenAt = null;
    let graceEnd = 0;
    const touch = () => {
      lastActivity = Date.now();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
        // Si se está eligiendo una foto o un archivo, el tiempo fuera cuenta solo después de la gracia.
        graceEnd = backgroundAllowed() ? graceUntil() : 0;
        if (limit === 0 && !graceEnd && !autoLockHeld()) onLock();
        return;
      }
      const now = Date.now();
      const awaySince = hiddenAt === null ? null : Math.max(hiddenAt, graceEnd);
      endBackgroundAllowance();
      hiddenAt = null;
      graceEnd = 0;
      if (awaySince !== null && now > awaySince && now - awaySince >= limit && !autoLockHeld()) onLock();
      else touch();
    };
    const timer = setInterval(() => {
      if (Date.now() - lastActivity >= Math.max(limit, MIN_IDLE_MS) && !backgroundAllowed() && !autoLockHeld()) onLock();
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
  const sharedForBudget = (list) => (settings.countShared ? list : []);
  const checkBudget = (nextMovements, nextBudget = budget, nextGroups = groups) => {
    const found = budgetAlert({
      before: monthSpent(movements, sharedForBudget(groups)),
      after: monthSpent(nextMovements, sharedForBudget(nextGroups)),
      budgetBefore: budget,
      budgetAfter: nextBudget,
      settings,
    });
    if (found) setAlert(found);
  };

  const saveMovement = (movement) => {
    const existed = movements.some((m) => m.id === movement.id);
    const next = existed ? movements.map((m) => (m.id === movement.id ? movement : m)) : [...movements, movement];
    setMovements(next);
    setEditing(null);
    checkBudget(next);
    // Confirmación breve (sin tapar nada): así se sabe que quedó guardado.
    setToast({ text: existed ? 'Cambios guardados' : `${movement.type === 'income' ? 'Ingreso' : 'Gasto'} guardado · ${formatMoney(movement.amount, settings.currency)}`, at: Date.now() });
    navigator.vibrate?.(30);
  };
  // «Desde esta fecha»: la serie original termina el día anterior y sigue una nueva con los cambios.
  const splitMovement = (old, next) => {
    const list = [...movements.map((m) => (m.id === old.id ? old : m)), next];
    setMovements(list);
    setEditing(null);
    checkBudget(list);
  };
  // «Ya lo pagué»: esa repetición deja de aparecer en los recordatorios.
  const markPaid = (id, occurrence) =>
    setMovements((list) => list.map((m) => (m.id === id ? { ...m, paidDates: [...new Set([...(m.paidDates ?? []), occurrence])].slice(-24) } : m)));
  // Borrar se puede deshacer durante unos segundos.
  const deleteMovement = (id) => {
    const removed = movements.find((m) => m.id === id);
    setMovements((list) => list.filter((m) => m.id !== id));
    setEditing(null);
    if (removed) {
      setToast({
        text: `Eliminado: ${removed.description || removed.category}`,
        at: Date.now(),
        action: { label: 'Deshacer', run: () => setMovements((list) => (list.some((m) => m.id === id) ? list : [...list, removed])) },
      });
    }
  };
  const changeBudget = (value) => {
    setBudget(value);
    checkBudget(movements, value);
  };
  const closeAlert = useCallback(() => setAlert(null), []);
  const addCategory = (type, name) => setCategories((c) => ({ ...c, [type]: [...(c[type] ?? []), name] }));
  // Renombrar un tipo propio también actualiza los movimientos que lo usan.
  // Devuelve el nombre del tipo que ya existe si hay choque (sí se permite cambiar solo mayúsculas).
  const renameCategory = (type, from, to) => {
    const clash = categoryList(type, categories).find((c) => c.name !== from && c.name.toLowerCase() === to.toLowerCase());
    if (clash) return clash.name;
    setCategories((c) => ({ ...c, [type]: (c[type] ?? []).map((n) => (n === from ? to : n)) }));
    setMovements((list) => list.map((m) => (m.type === type && m.category === from ? { ...m, category: to } : m)));
    return null;
  };
  const deleteCategory = (type, name) => {
    const fallback = type === 'income' ? 'Otros ingresos' : 'Otros';
    setCategories((c) => ({ ...c, [type]: (c[type] ?? []).filter((n) => n !== name) }));
    setMovements((list) => list.map((m) => (m.type === type && m.category === name ? { ...m, category: fallback } : m)));
  };

  const closeEditor = useCallback(() => setEditing(null), []);
  const closeGoals = useCallback(() => setGoalsOpen(false), []);
  const closeSettings = useCallback(() => {
    // Un código de recuperación nuevo en pantalla todavía no está activo: se pregunta antes de cerrar.
    if (autoLockHeld() && !window.confirm('Tu código de recuperación nuevo aún no está guardado: si cierras ahora, seguirá sirviendo el anterior. ¿Cerrar igual?')) {
      return false;
    }
    setSettingsOpen(false);
    setRecoveryReady(hasRecovery());
    return true;
  }, []);
  const openSettings = (panel = null) => {
    setSettingsPanel(panel);
    setSettingsOpen(true);
  };
  const backup = backupDue(settings, now, movements.length + notes.length >= 3 || docMeta.length > 0 || goals.length > 0);
  const changeCursor = (y, m) => setCursor({ y, m });

  // Restaurar: todo se guarda en una sola operación (si algo falla, no cambia nada) y recién después se muestra.
  const [dataVersion, setDataVersion] = useState(0);
  const importData = async (data) => {
    const next = { movements: data.movements, notes: data.notes, categories: data.categories, budget: data.budget, groups: data.groups, goals: data.goals };
    await store.replaceAll(next, data.documents);
    setMovements(next.movements);
    setNotes(next.notes);
    setCategories(next.categories);
    setBudget(next.budget);
    setGroups(next.groups);
    setGoals(next.goals);
    setSettings((s) => ({ ...DEFAULT_SETTINGS, ...s, ...data.settings, ...(data.createdAt ? { lastBackupAt: data.createdAt, backupSnoozeUntil: 0 } : {}) }));
    setDataVersion((v) => v + 1);
    loadDocMeta();
  };
  const resetAll = async () => {
    if (settings.pushEnabled) await turnOffPush();
    await store.clearDocuments();
    setMovements([]);
    setNotes([]);
    setCategories(EMPTY_STATE.categories);
    setBudget(null);
    setGroups([]);
    setGoals([]);
    setDataVersion((v) => v + 1);
    loadDocMeta();
  };

  const views = {
    home: (
      <Home
        movements={movements}
        groups={groups}
        goals={goals}
        onOpenGoals={() => setGoalsOpen(true)}
        notesCount={notes.length}
        currency={settings.currency}
        budget={budget}
        onSetBudget={changeBudget}
        settings={settings}
        onSettings={(patch) => setSettings((s) => ({ ...DEFAULT_SETTINGS, ...s, ...patch }))}
        onAdd={setEditing}
        onEdit={setEditing}
        onMarkPaid={markPaid}
        docReminders={docReminders}
        onNavigate={goTo}
      />
    ),
    movements: (
      <Movements
        movements={movements}
        groups={groups}
        countShared={settings.countShared}
        currency={settings.currency}
        cursor={cursor}
        onCursor={changeCursor}
        onEdit={setEditing}
        onOpenGroup={() => goTo('group', 'gastos')}
      />
    ),
    calendar: (
      <CalendarView
        movements={movements}
        groups={settings.countShared ? groups : []}
        onOpenGroup={() => goTo('group', 'gastos')}
        currency={settings.currency}
        cursor={cursor}
        onCursor={changeCursor}
        onEdit={setEditing}
        onAdd={setEditing}
      />
    ),
    documents: <Documents key={dataVersion} store={store} onChanged={loadDocMeta} />,
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
        onInviteHandled={onInviteHandled}
        section={groupSection}
        onSection={setGroupSection}
        onToast={(t) => setToast({ ...t, at: Date.now() })}
      />
    ),
    notes: <Notes notes={notes} setNotes={setNotes} />,
  };

  const current = TABS.find((t) => t.id === tab);
  const showFab = tab === 'home' || tab === 'movements';

  return (
    <div className={showFab ? 'app with-fab' : 'app'}>
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

      {saveError && <p className="error banner">No se pudieron guardar los últimos cambios. Reintentando… Revisa el espacio del teléfono y no cierres la app.</p>}
      {updateReady && (
        <div className="notice update-notice" role="status">
          <RefreshCw size={20} />
          <div className="notice-text">
            <b>Hay una versión nueva de Mi Gestor</b>
            <p>Tus datos ya están guardados. Al actualizar te pedirá el código.</p>
          </div>
          <button type="button" className="btn small primary" onClick={reloadApp}>
            Actualizar
          </button>
        </div>
      )}

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

      {tab === 'home' && !isInstalled() && persistence && persistence !== 'granted' && !(settings.installSnoozeUntil > now) && (
        <div className="notice install">
          <Smartphone size={22} />
          <div className="notice-text">
            <b>Instala Mi Gestor en tu pantalla de inicio</b>
            <p>
              {isIOS()
                ? 'En Safari, el iPhone puede borrar los datos de páginas que no usas por unos días. Haz una copia, instala la app (Compartir → Añadir a pantalla de inicio) y restáurala ahí.'
                : 'Así abre como una app, sin barra del navegador, y el teléfono cuida mejor tus datos.'}
            </p>
          </div>
          <div className="notice-actions">
            {isIOS() ? (
              <button type="button" className="btn small primary" onClick={() => openSettings('export')}>
                Hacer copia
              </button>
            ) : (
              window.deferredInstallPrompt && (
                <button
                  type="button"
                  className="btn small primary"
                  onClick={async () => {
                    window.deferredInstallPrompt.prompt();
                    await window.deferredInstallPrompt.userChoice.catch(() => {});
                    window.deferredInstallPrompt = null;
                  }}
                >
                  Instalar
                </button>
              )
            )}
            <button type="button" className="btn small ghost" onClick={() => setSettings((s) => ({ ...DEFAULT_SETTINGS, ...s, installSnoozeUntil: snoozeUntil(Date.now(), 30) }))}>
              Ahora no
            </button>
          </div>
        </div>
      )}

      <main className="content">{views[tab]}</main>

      {showFab && (
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
            aria-label={t.label}
          >
            <t.icon size={22} aria-hidden="true" />
            <span className={`tab-full${t.short ? ' has-short' : ''}`} aria-hidden="true">
              {t.label}
            </span>
            {t.short && (
              <span className="tab-short" aria-hidden="true">
                {t.short}
              </span>
            )}
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
            pushEnabled={settings.pushEnabled}
            movements={movements}
            onAddCategory={addCategory}
            onSave={saveMovement}
            onSplit={splitMovement}
            onDelete={deleteMovement}
            onDuplicate={(m) => setEditing({ type: m.type, amount: m.amount, category: m.category, description: m.description, card: m.card, date: todayKey(), frequency: 'once' })}
          />
        </Sheet>
      )}

      {toast && (
        <div className={`toast${toast.section ? '' : ' bottom'}`} role="status">
          <button
            type="button"
            className="toast-main"
            onClick={() => {
              setToast(null);
              if (toast.section) goTo('group', toast.section);
            }}
          >
            {toast.section ? <Users size={18} /> : <Check size={18} />} {toast.text}
          </button>
          {toast.action && (
            <button
              type="button"
              className="btn small toast-action"
              onClick={() => {
                toast.action.run();
                setToast(null);
              }}
            >
              {toast.action.label}
            </button>
          )}
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

      {goalsOpen && (
        <Sheet title="Metas de ahorro" onClose={closeGoals} guard={false}>
          <Goals
            goals={goals}
            currency={settings.currency}
            onSave={(goal) => setGoals((list) => (list.some((g) => g.id === goal.id) ? list.map((g) => (g.id === goal.id ? goal : g)) : [...list, goal]))}
            onDelete={(id) => setGoals((list) => list.filter((g) => g.id !== id))}
          />
        </Sheet>
      )}

      {settingsOpen && (
        <Sheet title="Ajustes" onClose={closeSettings} guard={false}>
          <Settings
            settings={settings}
            onChange={(patch) => setSettings((s) => ({ ...DEFAULT_SETTINGS, ...s, ...patch }))}
            onExport={(password) => exportBackup(store, { movements, notes, categories, budget, groups, goals, settings: portableSettings(settings) }, password)}
            onBackupSaved={() => setSettings((s) => ({ ...DEFAULT_SETTINGS, ...s, lastBackupAt: Date.now(), backupSnoozeUntil: 0 }))}
            currentCounts={{ movements: movements.length, notes: notes.length, documents: docMeta.length }}
            initialPanel={settingsPanel}
            categories={categories}
            onRenameCategory={renameCategory}
            onDeleteCategory={deleteCategory}
            persistence={persistence}
            onImport={importData}
            onReset={resetAll}
            groups={groups}
            onEnablePush={turnOnPush}
            onDisablePush={turnOffPush}
            onLock={onLock}
          />
        </Sheet>
      )}
    </div>
  );
}
