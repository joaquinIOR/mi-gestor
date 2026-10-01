import { addDays, parseKey, todayKey } from './dates';
import { formatMoney } from './format';
import { occurrences } from './recurrence';

const SENT_KEY = 'miGestor.notified';

export const notificationsSupported = () => typeof window !== 'undefined' && 'Notification' in window;

// Avisos pendientes de hoy: movimientos con recordatorio cuya fecha es hoy + días de antelación.
export function dueReminders(movements) {
  const today = parseKey(todayKey());
  return movements
    .filter((m) => m.reminder != null)
    .flatMap((m) => {
      const target = addDays(today, m.reminder);
      return occurrences(m, target, target).map((occurrence) => ({ ...m, occurrence }));
    });
}

// Muestra los recordatorios de hoy una sola vez por día (se comprueba al abrir la app).
// Por privacidad, sin `details` la notificación no muestra montos ni descripciones en la pantalla bloqueada.
export async function notifyDueReminders(movements, currency, details = false) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return;

  const today = todayKey();
  let sent;
  try {
    sent = JSON.parse(localStorage.getItem(SENT_KEY)) ?? {};
  } catch {
    sent = {};
  }
  if (sent.date !== today) sent = { date: today, ids: [] };

  const pending = dueReminders(movements).filter((m) => !sent.ids.includes(`${m.id}@${m.occurrence}`));
  if (!pending.length) return;

  const registration = await navigator.serviceWorker?.getRegistration();
  for (const m of pending) {
    const when = m.occurrence === today ? 'hoy' : `el ${parseKey(m.occurrence).toLocaleDateString('es', { day: 'numeric', month: 'short' })}`;
    const title = m.type === 'income' ? `Ingreso ${when}` : `Pago ${when}`;
    const options = {
      body: details ? `${m.description || m.category} · ${formatMoney(m.amount, currency)}` : 'Abre Mi Gestor para ver el detalle.',
      icon: 'icons/icon-192.png',
      tag: `${m.id}@${m.occurrence}`,
    };
    if (registration) await registration.showNotification(title, options);
    else new Notification(title, options);
    sent.ids.push(`${m.id}@${m.occurrence}`);
  }
  localStorage.setItem(SENT_KEY, JSON.stringify(sent));
}
