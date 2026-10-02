// Gastos en común en tiempo real.
// Cada entrada se cifra en el teléfono con la clave del grupo (AES-GCM 256) antes de enviarse a Supabase.
// El servidor solo ve: un identificador de grupo al azar, un identificador de entrada y datos ilegibles.
import { fromBase64, randomBytes, toBase64 } from './crypto';
import { parseKey, toKey } from './dates';
import { isDateKey } from './validate';
import { MAX_AMOUNT, uid } from './format';

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

// Las claves antiguas de Supabase son JWT: la «service_role» da acceso total y nunca debe ir en la app.
function jwtRole(key) {
  if (!key.startsWith('eyJ')) return null;
  try {
    return JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role ?? null;
  } catch {
    return null;
  }
}

export function normalizeServer(url, key) {
  const clean = String(url ?? '').trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
  const allowLocal = import.meta.env.VITE_ALLOW_LOCAL_SYNC === '1';
  if (!SUPABASE_URL.test(clean) && !(allowLocal && LOCAL_URL.test(clean))) {
    throw new SyncError('La dirección debe ser la de tu proyecto: https://xxxx.supabase.co');
  }
  const cleanKey = String(key ?? '').trim();
  if (!/^(eyJ[\w-]+\.[\w-]+\.[\w-]+|sb_publishable_[\w-]+)$/.test(cleanKey) || jwtRole(cleanKey) === 'service_role') {
    throw new SyncError('La clave debe ser la «publishable» o «anon» de Supabase (nunca la secreta).');
  }
  return { url: clean, key: cleanKey };
}

const RPC_TIMEOUT_MS = 20000;

export async function rpc(server, fn, body) {
  const headers = { apikey: server.key, 'Content-Type': 'application/json' };
  if (server.key.startsWith('eyJ')) headers.Authorization = `Bearer ${server.key}`;
  let res;
  // Con señal débil la petición podría quedar colgada: se corta a los 20 s y se reintenta en la próxima vuelta.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
  try {
    res = await fetch(`${server.url}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(body), cache: 'no-store', signal: controller.signal });
  } catch {
    throw new SyncError('Sin conexión con el servidor.', 0);
  } finally {
    clearTimeout(timer);
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
    epoch: uid(),
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

// Unirse como integrante nuevo, o retomar el perfil que ya se tenía (por ejemplo, en un teléfono nuevo).
export function joinGroup(invite, me) {
  return { ...invite, me: me.id, epoch: uid(), cursor: null, entries: { [me.id]: me }, outbox: [me], lastSync: null, error: null };
}

export function rejoinGroup(invite, existing) {
  // Se parte con el propio perfil (la primera sincronización trae el resto).
  return { ...invite, me: existing.id, epoch: uid(), cursor: null, entries: { [existing.id]: { ...existing, _ts: null } }, outbox: [], lastSync: null, error: null };
}

// Integrantes que ya están en el servidor (para «¿Ya eras parte? Toca tu nombre»).
export async function remoteMembers(invite) {
  const group = { id: invite.id, key: invite.key };
  const rows = (await rpc(invite.server, 'mg_pull', { p_group: invite.id, p_since: '-infinity' })) ?? [];
  const out = [];
  for (const row of rows) {
    try {
      const entry = sanitizeSharedEntry(await decryptRow(group, row));
      if (entry?.kind === 'member' && !entry.deleted && entry.id === row.id) out.push(entry);
    } catch {
      // ilegible: se ignora
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

// --- Validación de lo que llega del servidor (aunque esté cifrado, se valida igual) ---

const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const isId = (v) => typeof v === 'string' && /^[\w-]{8,64}$/.test(v);

export function sanitizeSharedEntry(e) {
  if (!e || typeof e !== 'object' || !isId(e.id)) return null;
  const base = {
    id: e.id,
    updatedAt: Number.isFinite(e.updatedAt) ? e.updatedAt : 0,
    deleted: e.deleted === true,
    ...(isId(e.updatedBy) ? { updatedBy: e.updatedBy } : {}),
  };
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
  if (!(amount > 0 && amount < MAX_AMOUNT) || !isDateKey(e.date)) return null;
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
      // Para todas: también para quien se una después.
      everyone: e.everyone === true,
      ...(/^\d{4}-\d{2}$/.test(e.since) ? { since: e.since } : {}),
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
      return [{ id: g.id, key: g.key, name: str(g.name, 40) || 'Grupo', server: normalizeServer(g.server?.url, g.server?.key), me: g.me, epoch: uid(), cursor: null, entries, outbox, lastSync: null, error: null }];
    } catch {
      return [];
    }
  });
}

// --- Sincronización ---

// ¿Gana el cambio pendiente de este teléfono sobre la versión del servidor?
// Un borrado es definitivo; si no, gana el cambio más reciente.
export function localWins(local, remote) {
  if (!remote || remote._ts === local._base) return true;
  if (remote.deleted) return false;
  if (local.deleted) return true;
  return local.updatedAt > remote.updatedAt;
}

// Trae lo nuevo y después envía lo pendiente (así un cambio viejo, por ejemplo hecho sin señal o
// restaurado de una copia, no pisa uno más nuevo). Devuelve solo los cambios, para fusionarlos.
export async function syncGroup(group) {
  const since = group.cursor ? new Date(new Date(group.cursor).getTime() - PULL_OVERLAP_MS).toISOString() : '-infinity';
  const rows = (await rpc(group.server, 'mg_pull', { p_group: group.id, p_since: since })) ?? [];
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

  const remote = new Map(incoming.map((e) => [e.id, e]));
  const pushed = [];
  for (const entry of group.outbox) {
    const theirs = remote.get(entry.id);
    // Si alguien lo cambió después de que lo editamos aquí, se resuelve antes de enviar.
    if (localWins({ ...entry, _base: entry._base ?? group.entries[entry.id]?._ts ?? null }, theirs)) {
      const { _base, ...clean } = entry;
      await rpc(group.server, 'mg_push', await encryptEntry(group, clean));
    }
    pushed.push(`${entry.id}:${entry.updatedAt}`);
  }
  // La primera vuelta trae todo lo anterior: eso no se anuncia como novedad.
  return { id: group.id, epoch: group.epoch, pushed, incoming, cursor, firstSync: !group.cursor && !group.lastSync };
}

// Fusiona el resultado con la versión actual del grupo (que pudo cambiar mientras se sincronizaba).
export function applySync(group, result) {
  const outbox = group.outbox.filter((e) => !result.pushed.includes(`${e.id}:${e.updatedAt}`));
  const pending = new Map(outbox.map((e) => [e.id, e]));
  const entries = { ...group.entries };
  const news = [];
  for (const entry of result.incoming) {
    const local = pending.get(entry.id);
    if (local && localWins({ ...local, _base: local._base ?? entries[entry.id]?._ts ?? null }, entry)) continue;
    const before = entries[entry.id];
    // Un borrado es definitivo: si llega una versión sin borrar (alguien la cambió justo a la vez), se vuelve
    // a enviar el borrado para que todos los teléfonos terminen igual.
    if (before?.deleted && before._ts && !entry.deleted) {
      const { _ts, ...redo } = before;
      const again = { ...redo, updatedAt: Math.max(before.updatedAt, entry.updatedAt) + 1, updatedBy: group.me, _base: entry._ts };
      outbox.push(again);
      pending.set(entry.id, again);
      entries[entry.id] = { ...before, _ts: entry._ts };
      continue;
    }
    if (!before || before._ts !== entry._ts) {
      if (!before && entry.createdBy !== group.me && entry.id !== group.me) news.push(entry);
      // Cambios o borrados de otra persona en gastos y pagos (cambian los saldos): también se avisan.
      else if (before && before._ts && entry.updatedBy && entry.updatedBy !== group.me && ['expense', 'settle', 'bill'].includes(entry.kind) && (entry.deleted || entry.amount !== before.amount)) {
        news.push({ ...entry, change: entry.deleted ? 'deleted' : 'edited' });
      }
      if (local) pending.delete(entry.id);
      entries[entry.id] = entry;
    }
  }
  return {
    group: { ...group, entries, outbox: outbox.filter((e) => pending.has(e.id)), cursor: result.cursor, lastSync: Date.now(), error: null },
    news: result.firstSync ? [] : news,
  };
}

// Guarda un cambio local: se ve al instante y queda pendiente de enviar.
export function upsertLocal(group, entry) {
  // Nunca se encola algo sin identificador ni tipo (rompería la sincronización del grupo).
  if (!entry || typeof entry.id !== 'string' || !entry.kind) return group;
  const { _ts, _base, change: _change, ...clean } = entry;
  const next = { ...clean, updatedAt: Math.max(Date.now(), (group.entries[clean.id]?.updatedAt ?? 0) + 1), updatedBy: group.me };
  const base = group.outbox.find((e) => e.id === next.id)?._base ?? group.entries[next.id]?._ts ?? null;
  return {
    ...group,
    entries: { ...group.entries, [next.id]: { ...next, _ts: group.entries[next.id]?._ts ?? null } },
    outbox: [...group.outbox.filter((e) => e.id !== next.id), { ...next, _base: base }],
  };
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

// Partes exactas: en pesos enteros (o centavos si el monto los tiene). Lo que sobra al dividir se reparte
// de a 1 empezando por quien pagó, igual en todos los teléfonos. Ej.: $10.000 entre 3 → 3.334 + 3.333 + 3.333.
export function splitShares(amount, participants, paidBy) {
  const sorted = [...new Set(participants)].sort();
  if (!sorted.length) return {};
  const ids = sorted.includes(paidBy) ? [paidBy, ...sorted.filter((id) => id !== paidBy)] : sorted;
  const scale = Number.isInteger(amount) ? 1 : 100;
  const total = Math.round(amount * scale);
  const base = Math.floor(total / ids.length);
  let rest = total - base * ids.length;
  const out = {};
  for (const id of ids) {
    out[id] = (base + (rest > 0 ? 1 : 0)) / scale;
    if (rest > 0) rest -= 1;
  }
  return out;
}

const cents = (v) => Math.round(v * 100) / 100;
export const EPSILON = 0.005;

// En grupos en pesos (montos enteros) se tolera menos de $1: los gastos anotados con versiones anteriores
// se dividían con decimales y así un grupo que ya estaba a mano sigue a mano.
export function balanceTolerance(group) {
  const integer = Object.values(group.entries).every((e) => (e.kind !== 'expense' && e.kind !== 'settle') || e.deleted || Number.isInteger(e.amount));
  return integer ? 0.5 : EPSILON;
}

// Saldo de cada persona: positivo = le deben, negativo = debe.
export function balances(group) {
  const net = Object.fromEntries(members(group).map((m) => [m.id, 0]));
  for (const e of activity(group)) {
    if (e.kind === 'expense') {
      // Los gastos de versiones anteriores (sin updatedBy) mantienen su división de entonces.
      const shares = e.updatedBy
        ? splitShares(e.amount, e.participants, e.paidBy)
        : Object.fromEntries([...new Set(e.participants)].map((p) => [p, e.amount / e.participants.length]));
      net[e.paidBy] = (net[e.paidBy] ?? 0) + e.amount;
      for (const [p, share] of Object.entries(shares)) net[p] = (net[p] ?? 0) - share;
    } else {
      net[e.from] = (net[e.from] ?? 0) + e.amount;
      net[e.to] = (net[e.to] ?? 0) - e.amount;
    }
  }
  for (const id of Object.keys(net)) net[id] = cents(net[id]);
  return net;
}

// Propone el menor número de pagos para quedar a mano.
export function settlements(group) {
  const net = balances(group);
  const tol = balanceTolerance(group);
  const round = tol === EPSILON ? cents : Math.round;
  const debtors = Object.entries(net).filter(([, v]) => v < -tol).map(([id, v]) => ({ id, v: -v })).sort((a, b) => b.v - a.v);
  const creditors = Object.entries(net).filter(([, v]) => v > tol).map(([id, v]) => ({ id, v })).sort((a, b) => b.v - a.v);
  const out = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].v, creditors[j].v);
    if (round(amount) > 0) out.push({ from: debtors[i].id, to: creditors[j].id, amount: round(amount) });
    debtors[i].v = cents(debtors[i].v - amount);
    creditors[j].v = cents(creditors[j].v - amount);
    if (debtors[i].v < tol) i += 1;
    if (creditors[j].v < tol) j += 1;
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
        amount: splitShares(e.amount, e.participants, e.paidBy)[group.me],
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

// Pagos registrados de una cuenta en un mes ("YYYY-MM").
export const billPayments = (group, billId, period) =>
  Object.values(group.entries).filter((e) => e.kind === 'expense' && !e.deleted && e.billId === billId && e.period === period);
export const billPayment = (group, billId, period) => billPayments(group, billId, period)[0] ?? null;

// Entre quiénes se divide: «todas» incluye a quien se unió después; si no, solo quienes siguen en el grupo.
export function billParticipants(group, bill) {
  const ids = members(group).map((m) => m.id);
  if (bill.everyone) return ids;
  const still = bill.participants.filter((id) => ids.includes(id));
  return still.length ? still : ids;
}

const periodOf = (y, m) => toKey(new Date(y, m, 1)).slice(0, 7);

// El mes que toca pagar de una cuenta: el anterior si quedó impago y ya venció; si no, el actual.
// Si el actual ya está pagado y el próximo vence pronto, se puede adelantar.
export function billStatus(group, bill, today) {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7)) - 1;
  const current = today.slice(0, 7);
  const earliestPaid = Object.values(group.entries)
    .filter((e) => e.kind === 'expense' && !e.deleted && e.billId === bill.id)
    .reduce((min, e) => (!min || e.period < min ? e.period : min), null);
  const since = bill.since ?? earliestPaid ?? current;
  // La cuenta empieza el próximo mes: se muestra ese primer vencimiento.
  if (current < since) {
    const sy = Number(since.slice(0, 4));
    const sm = Number(since.slice(5, 7)) - 1;
    const due = billDueDate(bill, sy, sm);
    const paid = billPayment(group, bill.id, since);
    return { period: since, due, paid, late: false, payments: billPayments(group, bill.id, since).length, next: { period: since, due, paid, canPay: false } };
  }
  const prev = periodOf(y, m - 1);
  const prevDue = billDueDate(bill, y, m - 1);
  if (prev >= since && prevDue < today && !billPayment(group, bill.id, prev)) {
    return { period: prev, due: prevDue, paid: null, late: true, payments: 0 };
  }
  const due = billDueDate(bill, y, m);
  const payments = billPayments(group, bill.id, current);
  const paid = payments[0] ?? null;
  const next = periodOf(y, m + 1);
  const nextDue = billDueDate(bill, y, m + 1);
  const nextPaid = billPayment(group, bill.id, next);
  const daysToNext = Math.round((parseKey(nextDue) - parseKey(today)) / 86400000);
  return {
    period: current,
    due,
    paid,
    late: !paid && due < today,
    payments: payments.length,
    next: { period: next, due: nextDue, paid: nextPaid, canPay: !!paid && !nextPaid && daysToNext <= 15 },
  };
}

// Identificador fijo para el pago de una cuenta en un mes: si dos personas pagan la misma cuenta a la vez
// (o una sin señal), queda un solo pago y no se cuenta dos veces.
export async function billPaymentId(group, billId, period) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(`${group.id}:${billId}:${period}`)));
  const hex = Array.from(digest.slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
  const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  // Si ese pago se borró antes, se usa uno nuevo (un borrado es definitivo).
  return group.entries[id]?.deleted ? uid() : id;
}

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
        // Los meses antes de que existiera la cuenta no avisan.
        isPaid: (occurrence) => occurrence.slice(0, 7) < (b.since ?? '0000-00') || !!billPayment(group, b.id, occurrence.slice(0, 7)),
      }))
  );
}
