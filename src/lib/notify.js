import { addDays, parseKey, todayKey } from './dates';
import { formatMoney, uid } from './format';
import { occurrences } from './recurrence';

const SENT_KEY = 'miGestor.notified';

export const notificationsSupported = () => typeof window !== 'undefined' && 'Notification' in window;

// Movimientos cuyo aviso ya debería verse: la fecha cae entre hoy y hoy + días de antelación.
export function dueReminders(movements) {
  const today = parseKey(todayKey());
  return movements
    .filter((m) => m.reminder != null)
    .flatMap((m) => occurrences(m, today, addDays(today, m.reminder)).map((occurrence) => ({ ...m, occurrence })))
    .filter((m) => !m.isPaid?.(m.occurrence))
    .sort((a, b) => a.occurrence.localeCompare(b.occurrence))
    // Un aviso por movimiento (el más próximo), no uno por cada repetición.
    .filter((m, i, list) => list.findIndex((o) => o.id === m.id) === i);
}

function whenText(occurrence, today) {
  const days = Math.round((parseKey(occurrence) - parseKey(today)) / 86400000);
  if (days === 0) return 'hoy';
  if (days === 1) return 'mañana';
  if (days === 7) return 'en 1 semana';
  if (days === 14) return 'en 2 semanas';
  return `en ${days} días`;
}

// Versiones anteriores guardaban la lista sin cifrar en localStorage: se lee una vez y se borra.
function readLegacySent() {
  try {
    return JSON.parse(localStorage.getItem(SENT_KEY))?.items ?? {};
  } catch {
    return {};
  }
}

async function readSent(store, today) {
  const items = { ...readLegacySent(), ...(await store.loadNotified().catch(() => ({}))) };
  // Se olvidan los avisos de fechas ya pasadas.
  return Object.fromEntries(Object.entries(items).filter(([, date]) => typeof date === 'string' && date >= today));
}

// Cada aviso se muestra una sola vez, aunque abras la app varios días antes de la fecha (se comprueba al abrir la app).
// Por privacidad, sin `details` la notificación no muestra montos ni descripciones en la pantalla bloqueada.
// Se ejecutan de a una (la app puede pedirlo varias veces seguidas) para no repetir avisos.
let queue = Promise.resolve();
export function notifyDueReminders(movements, currency, details, store) {
  queue = queue.catch(() => {}).then(() => notifyNow(movements, currency, details, store));
  return queue;
}

async function notifyNow(movements, currency, details, store) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return;

  const today = todayKey();
  const sent = await readSent(store, today);
  const pending = dueReminders(movements).filter((m) => !sent[`${m.id}@${m.occurrence}`]);
  if (pending.length) {
    const registration = await navigator.serviceWorker?.getRegistration();
    for (const m of pending) {
      const when = whenText(m.occurrence, today);
      const title = m.doc
        ? `Documento por vencer ${when}`
        : m.bill
          ? `Cuenta de la casa ${when}`
          : m.card
            ? `Pago de tarjeta ${when}`
            : m.type === 'income'
              ? `Ingreso ${when}`
              : `Pago ${when}`;
      const options = {
        body: details && !m.doc ? `${m.card || m.description || m.category} · ${formatMoney(m.amount, currency)}` : 'Abre Mi Gestor para ver el detalle.',
        icon: 'icons/icon-192.png',
        tag: `${m.bill ? 'cuenta' : m.doc ? 'documento' : 'aviso'}-${m.occurrence}-${uid()}`,
      };
      if (registration) await registration.showNotification(title, options);
      else new Notification(title, options);
      sent[`${m.id}@${m.occurrence}`] = m.occurrence;
    }
  }
  await store.saveNotified(sent);
  localStorage.removeItem(SENT_KEY);
}
