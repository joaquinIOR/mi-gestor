// Saldo real: cuánto tienes hoy. Partes de lo que escribiste una vez («Tienes hoy») y la app suma y resta
// cada movimiento cuando llega su fecha. Lo programado se pregunta ese día («¿Ya te llegó?» / «¿Ya se cobró?»):
// cuenta salvo que respondas «Todavía no».
//
// wallet = { amount, date, setAt, excluded, seen }
//   excluded: lo que estaba pendiente al escribir el saldo (no está en ese monto; cuenta cuando se confirme).
//   seen: lo que ya estaba en ese monto aunque sea de ese día o posterior (lo de hoy, lo pagado por adelantado).
import { addDays, monthEnd, parseKey, toKey } from './dates';
import { occurrences, occursOn } from './recurrence';

const MAX_MARKS = 24;
const MAX_MOVES = 60;
const MAX_KEYS = 500;

export const occKey = (id, occ) => `${id}@${occ}`;
const round = (x) => Math.round(x * 100) / 100;
const sign = (type) => (type === 'income' ? 1 : -1);

export const isPaid = (m, occ) => !!m.paidDates?.includes(occ);
export const isNotYet = (m, occ) => !!m.notYet?.some((n) => n.date === occ);
// ¿Ya ocurrió? Lo de hoy o antes cuenta, salvo que respondieras «Todavía no». Lo que marcaste como pagado
// cuenta aunque su fecha sea posterior (lo pagaste antes).
export const happened = (m, occ, today) => isPaid(m, occ) || (occ <= today && !isNotYet(m, occ));
// Solo se pregunta por lo que se programó antes de su fecha: lo que anotas el mismo día (o después) ya ocurrió.
export const needsConfirm = (m, occ) => occ > toKey(new Date(m.createdAt ?? 0));
// Para las listas del mes: mi parte en común cuenta en su fecha; lo propio, cuando ocurrió.
export const isDone = (item, today) => (item.shared ? item.occurrence <= today : happened(item, item.occurrence, today));

// Lo que entra o sale de mi bolsillo en los grupos: lo que pagué yo (completo) y los pagos entre integrantes.
export function groupCash(groups) {
  return groups.flatMap((g) =>
    Object.values(g.entries).flatMap((e) => {
      if (e.deleted) return [];
      const base = { key: `g:${g.id}:${e.id}`, amount: e.amount, date: e.date };
      if (e.kind === 'expense' && e.paidBy === g.me) return [{ ...base, type: 'expense' }];
      if (e.kind === 'settle' && e.from === g.me) return [{ ...base, type: 'expense' }];
      if (e.kind === 'settle' && e.to === g.me) return [{ ...base, type: 'income' }];
      return [];
    })
  );
}

function byMovement(keys) {
  const map = new Map();
  for (const key of keys) {
    const at = key.lastIndexOf('@');
    if (at < 1) continue;
    const id = key.slice(0, at);
    map.set(id, [...(map.get(id) ?? []), key.slice(at + 1)]);
  }
  return map;
}

// Saldo de hoy, lo que falta recibir y pagar este mes (más lo que respondiste «Todavía no») y cómo terminaría el mes.
export function cashSummary({ movements, groups = [], wallet, today }) {
  const t = parseKey(today);
  const endKey = toKey(monthEnd(t.getFullYear(), t.getMonth()));
  const excluded = new Set(wallet.excluded);
  const seen = new Set(wallet.seen);
  const pendingBefore = byMovement(wallet.excluded);
  let balance = wallet.amount;
  let toReceive = 0;
  let toPay = 0;
  const pending = (type, amount) => {
    if (type === 'income') toReceive += amount;
    else toPay += amount;
  };

  for (const m of movements) {
    const hi = (m.paidDates ?? []).reduce((a, d) => (d > a ? d : a), endKey);
    const dates = new Set(occurrences(m, parseKey(wallet.date), parseKey(hi)));
    for (const d of [...(pendingBefore.get(m.id) ?? []), ...(m.notYet ?? []).map((n) => n.date)]) {
      if (d < wallet.date && occursOn(m, d)) dates.add(d);
    }
    for (const occ of dates) {
      const did = happened(m, occ, today);
      const key = occKey(m.id, occ);
      if (did) {
        if (occ < wallet.date ? excluded.has(key) : !seen.has(key)) balance += sign(m.type) * m.amount;
      } else if (occ <= endKey) {
        pending(m.type, m.amount);
      }
    }
  }

  for (const c of groupCash(groups)) {
    if (c.date < wallet.date) continue;
    if (c.date <= today) {
      if (!seen.has(c.key)) balance += sign(c.type) * c.amount;
    } else if (c.date <= endKey) {
      pending(c.type, c.amount);
    }
  }

  return { balance: round(balance), toReceive: round(toReceive), toPay: round(toPay), endOfMonth: round(balance + toReceive - toPay) };
}

// Lo que hay que confirmar: lo programado de los últimos 7 días (desde que escribiste el saldo) que nadie
// confirmó, y lo que respondiste «Todavía no» antes de hoy.
export function pendingConfirmations({ movements, wallet, today }) {
  if (!wallet) return [];
  const t = parseKey(today);
  const weekAgo = toKey(addDays(t, -6));
  const lo = wallet.date > weekAgo ? wallet.date : weekAgo;
  const seen = new Set(wallet.seen);
  const out = [];
  for (const m of movements) {
    for (const occ of occurrences(m, parseKey(lo), t)) {
      if (isPaid(m, occ) || isNotYet(m, occ) || !needsConfirm(m, occ) || seen.has(occKey(m.id, occ))) continue;
      out.push({ ...m, occurrence: occ, again: false });
    }
    for (const n of m.notYet ?? []) {
      if (n.asked < today && n.date <= today && !isPaid(m, n.date) && occursOn(m, n.date)) out.push({ ...m, occurrence: n.date, again: true });
    }
  }
  return out.sort((a, b) => a.occurrence.localeCompare(b.occurrence) || a.id.localeCompare(b.id));
}

// Al escribir el saldo: lo programado para hoy y lo pendiente de antes («¿Esto ya está en tu saldo?»).
export function walletQuestions({ movements, today }) {
  const t = parseKey(today);
  const out = [];
  for (const m of movements) {
    for (const occ of occurrences(m, t, t)) {
      if (!isPaid(m, occ) && needsConfirm(m, occ)) out.push({ ...m, occurrence: occ });
    }
    for (const n of m.notYet ?? []) {
      if (n.date < today && !isPaid(m, n.date) && occursOn(m, n.date)) out.push({ ...m, occurrence: n.date });
    }
  }
  return out.sort((a, b) => a.occurrence.localeCompare(b.occurrence) || a.id.localeCompare(b.id));
}

// Qué ya está (o todavía no está) en el monto que escribiste hoy.
export function walletSnapshot({ movements, groups = [], today }) {
  const t = parseKey(today);
  const seen = [];
  const excluded = [];
  for (const m of movements) {
    for (const occ of occurrences(m, t, t)) if (happened(m, occ, today)) seen.push(occKey(m.id, occ));
    for (const d of m.paidDates ?? []) if (d > today && occursOn(m, d)) seen.push(occKey(m.id, d));
    for (const n of m.notYet ?? []) if (n.date <= today && occursOn(m, n.date)) excluded.push(occKey(m.id, n.date));
  }
  for (const c of groupCash(groups)) if (c.date === today) seen.push(c.key);
  return { excluded: excluded.slice(0, MAX_KEYS), seen: seen.slice(0, MAX_KEYS) };
}

// Horas para el aviso del teléfono (20:00 del día en que hay algo que confirmar), de los próximos 60 días.
export function confirmTimes({ movements, wallet, today, now = new Date() }) {
  if (!wallet) return [];
  const t = parseKey(today);
  const seen = new Set(wallet.seen);
  const at = (key) => {
    const d = parseKey(key);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 20, 0, 0);
  };
  const out = new Set();
  for (const m of movements) {
    for (const occ of occurrences(m, t, addDays(t, 60))) {
      if (isPaid(m, occ) || isNotYet(m, occ) || !needsConfirm(m, occ) || seen.has(occKey(m.id, occ))) continue;
      if (at(occ) > now) out.add(at(occ).toISOString());
    }
    for (const n of m.notYet ?? []) {
      if (isPaid(m, n.date)) continue;
      const next = n.asked < today && at(today) > now ? at(today) : at(toKey(addDays(t, 1)));
      out.add(next.toISOString());
    }
  }
  return [...out].sort();
}

// --- Respuestas ---

const withList = (m, field, list) => {
  const { [field]: _old, ...rest } = m;
  return list.length ? { ...rest, [field]: list } : rest;
};
const dropNotYet = (m, occ) => withList(m, 'notYet', (m.notYet ?? []).filter((n) => n.date !== occ));

// «Sí, llegó» / «Sí, se pagó».
export const confirmOccurrence = (m, occ) =>
  ({ ...dropNotYet(m, occ), paidDates: [...new Set([...(m.paidDates ?? []), occ])].slice(-MAX_MARKS) });

// «Todavía no»: deja de contar y se vuelve a preguntar mañana.
export const postponeOccurrence = (m, occ, today) =>
  ({ ...m, notYet: [...(m.notYet ?? []).filter((n) => n.date !== occ), { date: occ, asked: today }].slice(-MAX_MARKS) });

// «Cambiar fecha»: un movimiento de una vez cambia su fecha; en una serie se mueve solo esa repetición.
export function moveOccurrence(m, occ, to) {
  const base = dropNotYet(m, occ);
  if (m.frequency === 'once' || !m.frequency) return { ...base, date: to };
  const moves = m.moves ?? [];
  const existing = moves.find((mv) => mv.to === occ);
  const from = existing ? existing.from : occ;
  const others = moves.filter((mv) => mv !== existing);
  return withList(base, 'moves', (from === to ? others : [...others, { from, to }]).slice(-MAX_MOVES));
}
