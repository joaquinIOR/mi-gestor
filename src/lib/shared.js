// Gastos en común en tiempo real.
// Cada entrada se cifra en el teléfono con la clave del grupo (AES-GCM 256) antes de enviarse a Supabase.
// El servidor solo ve: un identificador de grupo al azar, un identificador de entrada y datos ilegibles.
import { fromBase64, randomBytes, toBase64 } from './crypto';
import { toKey } from './dates';
import { isDateKey } from './validate';
import { uid } from './format';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const MEMBER_COLORS = ['#2a78d6', '#e87ba4', '#1baf7a', '#eda100', '#4a3aa7', '#eb6834'];
const PULL_OVERLAP_MS = 15000;

export class SyncError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

// --- Servidor ---

const SUPABASE_URL = /^https:\/\/[a-z0-9-]+\.supabase\.co$/;
const LOCAL_URL = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/;

export function normalizeServer(url, key) {
  const clean = String(url ?? '').trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
  const allowLocal = import.meta.env.VITE_ALLOW_LOCAL_SYNC === '1';
  if (!SUPABASE_URL.test(clean) && !(allowLocal && LOCAL_URL.test(clean))) {
    throw new SyncError('La dirección debe ser la de tu proyecto: https://xxxx.supabase.co');
  }
  const cleanKey = String(key ?? '').trim();
  if (!/^(eyJ[\w-]+\.[\w-]+\.[\w-]+|sb_publishable_[\w-]+)$/.test(cleanKey)) {
    throw new SyncError('La clave debe ser la «publishable» o «anon» de Supabase (nunca la secreta).');
  }
  return { url: clean, key: cleanKey };
}

export async function rpc(server, fn, body) {
  const headers = { apikey: server.key, 'Content-Type': 'application/json' };
  if (server.key.startsWith('eyJ')) headers.Authorization = `Bearer ${server.key}`;
  let res;
  try {
    res = await fetch(`${server.url}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(body), cache: 'no-store' });
  } catch {
    throw new SyncError('Sin conexión con el servidor.', 0);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status === 404 || /PGRST202|function/i.test(text)) throw new SyncError('Falta preparar el servidor: ejecuta el SQL de configuración en Supabase.', res.status);
    if (res.status === 401 || res.status === 403) throw new SyncError('La clave del servidor no es válida.', res.status);
    throw new SyncError('El servidor respondió con un error.', res.status);
  }
  // Las funciones que no devuelven nada responden vacío (204).
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export async function testServer(server) {
  await rpc(server, 'mg_pull', { p_group: newGroupId(), p_since: new Date().toISOString() });
}

// --- Claves ---

const keyCache = new Map();
const newGroupId = () => Array.from(randomBytes(32), (b) => b.toString(16).padStart(2, '0')).join('');

async function groupKey(group) {
  if (!keyCache.has(group.id)) {
    keyCache.set(group.id, crypto.subtle.importKey('raw', fromBase64(group.key), 'AES-GCM', false, ['encrypt', 'decrypt']));
  }
  return keyCache.get(group.id);
}

async function encryptEntry(group, entry) {
  const iv = randomBytes(12);
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(`${group.id}:${entry.id}`) },
    await groupKey(group),
    encoder.encode(JSON.stringify(entry))
  );
  return { p_id: entry.id, p_group: group.id, p_iv: toBase64(iv), p_data: toBase64(data) };
}

async function decryptRow(group, row) {
  const data = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(row.iv), additionalData: encoder.encode(`${group.id}:${row.id}`) },
    await groupKey(group),
    fromBase64(row.data)
  );
  return JSON.parse(decoder.decode(data));
}

// --- Grupos e invitaciones ---

export function createGroup({ name, server, me }) {
  return {
    id: newGroupId(),
    key: toBase64(randomBytes(32)),
    name: name.trim().slice(0, 40) || 'Mi grupo',
    server,
    me: me.id,
    cursor: null,
    entries: { [me.id]: me },
    outbox: [me],
    lastSync: null,
    error: null,
  };
}

export function newMember(name, color) {
  return { id: uid(), kind: 'member', name: name.trim().slice(0, 30), color, updatedAt: Date.now() };
}

const toBase64Url = (text) => toBase64(encoder.encode(text)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromBase64Url = (text) => decoder.decode(fromBase64(text.replace(/-/g, '+').replace(/_/g, '/')));

// El enlace lleva la clave del grupo después de "#": esa parte nunca se envía a ningún servidor.
export function inviteLink(group) {
  const payload = { v: 1, n: group.name, g: group.id, k: group.key, u: group.server.url, p: group.server.key };
  return `${window.location.origin}${import.meta.env.BASE_URL}#join=${toBase64Url(JSON.stringify(payload))}`;
}

export function parseInvite(text) {
  const match = /#join=([\w-]+)/.exec(String(text ?? '').trim()) ?? /^([\w-]{40,})$/.exec(String(text ?? '').trim());
  if (!match) throw new SyncError('La invitación no es válida.');
  let payload;
  try {
    payload = JSON.parse(fromBase64Url(match[1]));
  } catch {
    throw new SyncError('La invitación está incompleta o dañada.');
  }
  if (payload?.v !== 1 || !/^[0-9a-f]{64}$/.test(payload.g) || typeof payload.k !== 'string' || fromBase64(payload.k).length !== 32) {
    throw new SyncError('La invitación no es válida.');
  }
  return { name: String(payload.n ?? 'Grupo').slice(0, 40), id: payload.g, key: payload.k, server: normalizeServer(payload.u, payload.p) };
}

export function joinGroup(invite, me) {
  return { ...invite, me: me.id, cursor: null, entries: { [me.id]: me }, outbox: [me], lastSync: null, error: null };
}

// --- Validación de lo que llega del servidor (aunque esté cifrado, se valida igual) ---

const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const isId = (v) => typeof v === 'string' && /^[\w-]{8,64}$/.test(v);

export function sanitizeSharedEntry(e) {
  if (!e || typeof e !== 'object' || !isId(e.id)) return null;
  const base = { id: e.id, updatedAt: Number.isFinite(e.updatedAt) ? e.updatedAt : 0, deleted: e.deleted === true };
  if (e.kind === 'member') {
    const name = str(e.name, 30).trim();
    if (!name) return null;
    return { ...base, kind: 'member', name, color: MEMBER_COLORS.includes(e.color) ? e.color : MEMBER_COLORS[0] };
  }
  if (e.kind === 'item') {
    const text = str(e.text, 60).trim();
    if (!text) return null;
    return { ...base, kind: 'item', text, checked: e.checked === true, checkedBy: isId(e.checkedBy) ? e.checkedBy : null, createdBy: isId(e.createdBy) ? e.createdBy : null };
  }
  const amount = Number(e.amount);
  if (!(amount > 0 && amount < 1e12) || !isDateKey(e.date)) return null;
  if (e.kind === 'bill') {
    const name = str(e.name, 40).trim();
    const participants = Array.isArray(e.participants) ? [...new Set(e.participants.filter(isId))].slice(0, 20) : [];
    if (!name || !participants.length) return null;
    return {
      ...base,
      kind: 'bill',
      name,
      amount: Math.round(amount * 100) / 100,
      category: str(e.category, 24).trim() || 'Servicios',
      date: e.date,
      reminder: Number.isInteger(e.reminder) && e.reminder >= 0 && e.reminder <= 60 ? e.reminder : null,
      participants,
      createdBy: isId(e.createdBy) ? e.createdBy : null,
    };
  }
  if (e.kind === 'expense') {
    const participants = Array.isArray(e.participants) ? [...new Set(e.participants.filter(isId))].slice(0, 20) : [];
    if (!isId(e.paidBy) || !participants.length) return null;
    return {
      ...base,
      kind: 'expense',
      amount: Math.round(amount * 100) / 100,
      description: str(e.description, 60).trim(),
      category: str(e.category, 24).trim() || 'Otros',
      date: e.date,
      paidBy: e.paidBy,
      participants,
      createdBy: isId(e.createdBy) ? e.createdBy : e.paidBy,
      ...(isId(e.billId) && /^\d{4}-\d{2}$/.test(e.period) ? { billId: e.billId, period: e.period } : {}),
    };
  }
  if (e.kind === 'settle') {
    if (!isId(e.from) || !isId(e.to) || e.from === e.to) return null;
    return { ...base, kind: 'settle', amount: Math.round(amount * 100) / 100, date: e.date, from: e.from, to: e.to, createdBy: isId(e.createdBy) ? e.createdBy : e.from };
  }
  return null;
}

export function sanitizeGroups(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 10).flatMap((g) => {
    try {
      if (!g || !/^[0-9a-f]{64}$/.test(g.id) || fromBase64(g.key).length !== 32 || !isId(g.me)) return [];
      const entries = {};
      for (const e of Object.values(g.entries ?? {})) {
        const clean = sanitizeSharedEntry(e);
        if (clean) entries[clean.id] = { ...clean, _ts: typeof e._ts === 'string' ? e._ts : null };
      }
      const outbox = (Array.isArray(g.outbox) ? g.outbox : []).map(sanitizeSharedEntry).filter(Boolean);
      return [{ id: g.id, key: g.key, name: str(g.name, 40) || 'Grupo', server: normalizeServer(g.server?.url, g.server?.key), me: g.me, cursor: null, entries, outbox, lastSync: null, error: null }];
    } catch {
      return [];
    }
  });
}

// --- Sincronización ---

// Envía lo pendiente y trae lo nuevo. Devuelve solo los cambios, para fusionarlos con el estado actual.
export async function syncGroup(group) {
  const pushed = [];
  for (const entry of group.outbox) {
    await rpc(group.server, 'mg_push', await encryptEntry(group, entry));
    pushed.push(`${entry.id}:${entry.updatedAt}`);
  }

  const since = group.cursor ? new Date(new Date(group.cursor).getTime() - PULL_OVERLAP_MS).toISOString() : '-infinity';
  const rows = await rpc(group.server, 'mg_pull', { p_group: group.id, p_since: since });
  const incoming = [];
  let cursor = group.cursor;
  for (const row of rows) {
    if (!cursor || row.updated_at > cursor) cursor = row.updated_at;
    try {
      const entry = sanitizeSharedEntry(await decryptRow(group, row));
      if (entry && entry.id === row.id) incoming.push({ ...entry, _ts: row.updated_at });
    } catch {
      // Entrada que no se puede descifrar (manipulada o de otra clave): se ignora.
    }
  }
  return { id: group.id, pushed, incoming, cursor, firstSync: !group.cursor };
}

// Fusiona el resultado con la versión actual del grupo (que pudo cambiar mientras se sincronizaba).
export function applySync(group, result) {
  const outbox = group.outbox.filter((e) => !result.pushed.includes(`${e.id}:${e.updatedAt}`));
  const pending = new Map(outbox.map((e) => [e.id, e]));
  const entries = { ...group.entries };
  const news = [];
  for (const entry of result.incoming) {
    const local = pending.get(entry.id);
    if (local && local.updatedAt > entry.updatedAt) continue;
    const before = entries[entry.id];
    if (!before || before._ts !== entry._ts) {
      if (!before && entry.createdBy !== group.me && entry.id !== group.me) news.push(entry);
      entries[entry.id] = entry;
    }
  }
  return {
    group: { ...group, entries, outbox, cursor: result.cursor, lastSync: Date.now(), error: null },
    news: result.firstSync ? [] : news,
  };
}

// Guarda un cambio local: se ve al instante y queda pendiente de enviar.
export function upsertLocal(group, entry) {
  const next = { ...entry, updatedAt: Date.now() };
  return { ...group, entries: { ...group.entries, [next.id]: { ...next, _ts: group.entries[next.id]?._ts ?? null } }, outbox: [...group.outbox.filter((e) => e.id !== next.id), next] };
}

// --- Cálculos ---

export const members = (group) =>
  Object.values(group.entries)
    .filter((e) => e.kind === 'member' && !e.deleted)
    .sort((a, b) => a.name.localeCompare(b.name));

export const activity = (group) =>
  Object.values(group.entries)
    .filter((e) => (e.kind === 'expense' || e.kind === 'settle') && !e.deleted)
    .sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt);

// Saldo de cada persona: positivo = le deben, negativo = debe.
export function balances(group) {
  const net = Object.fromEntries(members(group).map((m) => [m.id, 0]));
  for (const e of activity(group)) {
    if (e.kind === 'expense') {
      const share = e.amount / e.participants.length;
      net[e.paidBy] = (net[e.paidBy] ?? 0) + e.amount;
      for (const p of e.participants) net[p] = (net[p] ?? 0) - share;
    } else {
      net[e.from] = (net[e.from] ?? 0) + e.amount;
      net[e.to] = (net[e.to] ?? 0) - e.amount;
    }
  }
  return net;
}

// Propone el menor número de pagos para quedar a mano.
export function settlements(group) {
  const net = balances(group);
  const debtors = Object.entries(net).filter(([, v]) => v < -0.5).map(([id, v]) => ({ id, v: -v })).sort((a, b) => b.v - a.v);
  const creditors = Object.entries(net).filter(([, v]) => v > 0.5).map(([id, v]) => ({ id, v })).sort((a, b) => b.v - a.v);
  const out = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].v, creditors[j].v);
    out.push({ from: debtors[i].id, to: creditors[j].id, amount: Math.round(amount) });
    debtors[i].v -= amount;
    creditors[j].v -= amount;
    if (debtors[i].v < 0.5) i += 1;
    if (creditors[j].v < 0.5) j += 1;
  }
  return out;
}

// Mi parte de los gastos en común entre dos fechas, como movimientos de solo lectura.
export function myShares(groups, from, to) {
  const lo = toKey(from);
  const hi = toKey(to);
  return groups.flatMap((group) =>
    Object.values(group.entries)
      .filter((e) => e.kind === 'expense' && !e.deleted && e.participants.includes(group.me) && e.date >= lo && e.date <= hi)
      .map((e) => ({
        id: `${group.id}:${e.id}`,
        type: 'expense',
        amount: Math.round((e.amount / e.participants.length) * 100) / 100,
        category: e.category,
        description: e.description || e.category,
        date: e.date,
        occurrence: e.date,
        frequency: 'once',
        reminder: null,
        shared: group.name,
        groupId: group.id,
      }))
  );
}

// --- Lista de compras ---
export const shoppingItems = (group) =>
  Object.values(group.entries)
    .filter((e) => e.kind === 'item' && !e.deleted)
    .sort((a, b) => Number(a.checked) - Number(b.checked) || a.updatedAt - b.updatedAt);

// --- Cuentas fijas de la casa (mensuales) ---
export const billsOf = (group) =>
  Object.values(group.entries)
    .filter((e) => e.kind === 'bill' && !e.deleted)
    .sort((a, b) => Number(a.date.slice(8)) - Number(b.date.slice(8)));

// Pago registrado de una cuenta en un mes ("YYYY-MM"), si lo hay.
export const billPayment = (group, billId, period) =>
  Object.values(group.entries).find((e) => e.kind === 'expense' && !e.deleted && e.billId === billId && e.period === period) ?? null;

// Fecha de vencimiento de la cuenta en un mes concreto (mismo día; si el mes es más corto, el último día).
export function billDueDate(bill, y, m) {
  const day = Number(bill.date.slice(8));
  const last = new Date(y, m + 1, 0).getDate();
  return toKey(new Date(y, m, Math.min(day, last)));
}

// Cuentas pendientes como movimientos con aviso (para "Próximos recordatorios" y las notificaciones).
export function billReminders(groups) {
  return groups.flatMap((group) =>
    billsOf(group)
      .filter((b) => b.reminder != null)
      .map((b) => ({
        id: `bill:${group.id}:${b.id}`,
        type: 'expense',
        amount: b.amount,
        category: b.category,
        description: b.name,
        date: b.date,
        frequency: 'monthly',
        until: null,
        reminder: b.reminder,
        bill: group.name,
        groupId: group.id,
        isPaid: (occurrence) => !!billPayment(group, b.id, occurrence.slice(0, 7)),
      }))
  );
}
