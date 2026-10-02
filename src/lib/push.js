// Avisos con la app cerrada (Web Push) a través de la función "mg-push" de tu Supabase.
// Los avisos nunca llevan datos: solo "Hay novedades en un grupo" o "Tienes un pago por vencer".
import { fromBase64, randomBytes } from './crypto';
import { addDays, parseKey, todayKey } from './dates';
import { occurrences } from './recurrence';
import { rpc, SyncError } from './shared';

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const newDeviceTag = () => Array.from(randomBytes(16), (b) => b.toString(16).padStart(2, '0')).join('');
const fromBase64Url = (text) => fromBase64(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4));

async function callFunction(server, body) {
  const headers = { apikey: server.key, 'Content-Type': 'application/json' };
  if (server.key.startsWith('eyJ')) headers.Authorization = `Bearer ${server.key}`;
  let res;
  try {
    res = await fetch(`${server.url}/functions/v1/mg-push`, { method: 'POST', headers, body: JSON.stringify(body), cache: 'no-store' });
  } catch {
    throw new SyncError('Sin conexión con el servidor.', 0);
  }
  if (res.status === 404) throw new SyncError('Falta crear la función «mg-push» en tu Supabase.', 404);
  if (res.status === 401 || res.status === 403) throw new SyncError('Desactiva «Verify JWT» en la función «mg-push» de Supabase.', res.status);
  if (!res.ok) throw new SyncError('La función de avisos respondió con un error. ¿Ejecutaste push.sql?', res.status);
  return res.json();
}

// Activa los avisos en este teléfono para todos los grupos.
export async function enablePush(groups, deviceTag) {
  if (!groups.length) throw new SyncError('Primero crea o únete a un grupo (pestaña Grupo).');
  if (Notification.permission === 'default') await Notification.requestPermission();
  if (Notification.permission !== 'granted') throw new SyncError('Permite las notificaciones de Mi Gestor en el teléfono.');
  const server = groups[0].server;
  const { publicKey } = await callFunction(server, { action: 'key' });
  const reg = await navigator.serviceWorker.ready;
  const old = await reg.pushManager.getSubscription();
  if (old) await old.unsubscribe();
  const sub = (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromBase64Url(publicKey) })).toJSON();
  for (const g of groups) {
    await rpc(g.server, 'mg_push_register', { p_group: g.id, p_endpoint: sub.endpoint, p_p256dh: sub.keys.p256dh, p_auth: sub.keys.auth, p_tag: deviceTag });
  }
  await rpc(server, 'mg_push_set_url', { p_url: server.url, p_key: server.key }).catch(() => {});
  return sub.endpoint;
}

// Registra los grupos nuevos con la suscripción que ya tiene el teléfono.
export async function registerGroups(groups, deviceTag) {
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription())?.toJSON();
  if (!sub) return;
  for (const g of groups) {
    await rpc(g.server, 'mg_push_register', { p_group: g.id, p_endpoint: sub.endpoint, p_p256dh: sub.keys.p256dh, p_auth: sub.keys.auth, p_tag: deviceTag });
  }
}

export async function disablePush(groups) {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  for (const server of new Map(groups.map((g) => [g.server.url, g.server])).values()) {
    await rpc(server, 'mg_push_unregister', { p_endpoint: sub.endpoint }).catch(() => {});
  }
  await sub.unsubscribe();
}

// Avisa a los demás teléfonos del grupo que hay novedades (sin decir cuáles).
// Devuelve false si el servidor no tiene la función de avisos (para no volver a intentarlo).
export const notifyGroup = (group, deviceTag) =>
  callFunction(group.server, { action: 'notify', group: group.id, tag: deviceTag }).then(
    () => true,
    (err) => (err.status === 404 ? false : undefined)
  );

// ¿Sigue viva la suscripción de este teléfono? (el sistema puede anularla o cambiarla).
export async function currentEndpoint() {
  const reg = await navigator.serviceWorker.ready;
  return (await reg.pushManager.getSubscription())?.endpoint ?? null;
}

// Horas de aviso (9:00 del día que corresponda) de los próximos 60 días.
export function reminderTimes(items, now = new Date()) {
  const today = parseKey(todayKey());
  const out = new Set();
  for (const m of items) {
    if (m.reminder == null) continue;
    for (const occ of occurrences(m, today, addDays(today, 60 + m.reminder))) {
      if (m.isPaid?.(occ)) continue;
      const day = addDays(parseKey(occ), -m.reminder);
      const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9, 0, 0);
      if (at > now) out.add(at.toISOString());
    }
  }
  return [...out].sort().slice(0, 60);
}

export const syncSchedule = (server, endpoint, times) => rpc(server, 'mg_push_schedule', { p_endpoint: endpoint, p_times: times });
