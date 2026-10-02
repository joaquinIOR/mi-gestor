// Acceso rápido para registrar gastos o ingresos: atajos del icono (?quick=...) y notificación fija.
export const QUICK_TYPES = ['expense', 'income'];
const TAG = 'quick-access';

export function quickFromUrl() {
  const type = new URLSearchParams(window.location.search).get('quick');
  return QUICK_TYPES.includes(type) ? type : null;
}

export function clearQuickFromUrl() {
  if (window.location.search || window.location.hash) window.history.replaceState(null, '', window.location.pathname);
}

// Invitación a un grupo: llega en el "#" del enlace (esa parte nunca se envía a ningún servidor).
export const inviteFromUrl = () => (window.location.hash.startsWith('#join=') ? window.location.hash : null);

async function registration() {
  if (!('serviceWorker' in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration()) ?? null;
}

// No contiene ningún dato personal: solo dos botones.
export async function showQuickAccess() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return false;
  const reg = await registration();
  if (!reg) return false;
  await reg.showNotification('Mi Gestor', {
    body: 'Acceso rápido: registra un gasto o un ingreso.',
    tag: TAG,
    requireInteraction: true,
    silent: true,
    icon: 'icons/icon-192.png',
    badge: 'icons/badge-96.png',
    actions: [
      { action: 'expense', title: '− Gasto' },
      { action: 'income', title: '+ Ingreso' },
    ],
    data: { quickAccess: true },
  });
  return true;
}

export async function hideQuickAccess() {
  const reg = await registration();
  if (!reg) return;
  (await reg.getNotifications({ tag: TAG })).forEach((n) => n.close());
}
