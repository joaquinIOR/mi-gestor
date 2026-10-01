import { addDays, parseKey, todayKey } from './dates';
import { formatMoney } from './format';
import { occurrences } from './recurrence';

const SENT_KEY = 'miGestor.notified';

export const notificationsSupported = () => typeof window !== 'undefined' && 'Notification' in window;

// Movimientos cuyo aviso ya debería verse: la fecha cae entre hoy y hoy + días de antelación.
export function dueReminders(movements) {
  const today = parseKey(todayKey());
  return movements
    .filter((m) => m.reminder != null)
    .flatMap((m) => occurrences(m, today, addDays(today, m.reminder)).map((occurrence) => ({ ...m, occurrence })));
}

function whenText(occurrence, today) {
  const days = Math.round((parseKey(occurrence) - parseKey(today)) / 86400000);
  if (days === 0) return 'hoy';
  if (days === 1) return 'mañana';
  if (days === 7) return 'en 1 semana';
  if (days === 14) return 'en 2 semanas';
  return `en ${days} días`;
}

function readSent(today) {
  try {
    const sent = JSON.parse(localStorage.getItem(SENT_KEY));
    // Se olvidan los avisos de fechas ya pasadas.
    return Object.fromEntries(Object.entries(sent?.items ?? {}).filter(([, date]) => date >= today));
  } catch {
    return {};
  }
}

// Cada aviso se muestra una sola vez, aunque abras la app varios días antes de la fecha (se comprueba al abrir la app).
// Por privacidad, sin `details` la notificación no muestra montos ni descripciones en la pantalla bloqueada.
export async function notifyDueReminders(movements, currency, details = false) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return;

  const today = todayKey();
  const sent = readSent(today);
  const pending = dueReminders(movements).filter((m) => !sent[`${m.id}@${m.occurrence}`]);
  if (pending.length) {
    const registration = await navigator.serviceWorker?.getRegistration();
    for (const m of pending) {
      const when = whenText(m.occurrence, today);
      const title = m.card ? `Pago de tarjeta ${when}` : m.type === 'income' ? `Ingreso ${when}` : `Pago ${when}`;
      const options = {
        body: details ? `${m.card || m.description || m.category} · ${formatMoney(m.amount, currency)}` : 'Abre Mi Gestor para ver el detalle.',
        icon: 'icons/icon-192.png',
        tag: `${m.id}@${m.occurrence}`,
      };
      if (registration) await registration.showNotification(title, options);
      else new Notification(title, options);
      sent[`${m.id}@${m.occurrence}`] = m.occurrence;
    }
  }
  localStorage.setItem(SENT_KEY, JSON.stringify({ items: sent }));
}
