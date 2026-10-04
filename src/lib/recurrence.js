import { addDays, daysInMonth, parseKey, toKey } from './dates';

export const FREQUENCIES = [
  { value: 'once', label: 'Una vez' },
  { value: 'daily', label: 'Diario' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'monthly', label: 'Mensual' },
  { value: 'yearly', label: 'Anual' },
];

export const REMINDERS = [
  { value: 'none', label: 'Sin aviso' },
  { value: '0', label: 'El mismo día' },
  { value: '1', label: '1 día antes' },
  { value: '3', label: '3 días antes' },
  { value: '7', label: '1 semana antes' },
  { value: '14', label: '2 semanas antes' },
  { value: 'custom', label: 'Otro (elige los días)…' },
];

export const MAX_REMINDER_DAYS = 60;

export function reminderLabel(days) {
  if (days == null) return '';
  if (days === 0) return 'el mismo día';
  if (days === 7) return '1 semana antes';
  if (days === 14) return '2 semanas antes';
  return days === 1 ? '1 día antes' : `${days} días antes`;
}

export const frequencyLabel = (value) => FREQUENCIES.find((f) => f.value === value)?.label ?? value;

// Fechas (claves 'YYYY-MM-DD') en las que ocurre un movimiento dentro de [from, to].
// Una repetición movida con «Cambiar fecha» (`moves`: {from, to}) aparece en su fecha nueva.
export function occurrences(item, from, to) {
  const base = baseOccurrences(item, from, to);
  if (!item.moves?.length) return base;
  const lo = toKey(from);
  const hi = toKey(to);
  const movedAway = new Set(item.moves.map((mv) => mv.from));
  const movedHere = item.moves
    .filter((mv) => mv.to >= lo && mv.to <= hi && baseOccurrences(item, parseKey(mv.from), parseKey(mv.from)).length > 0)
    .map((mv) => mv.to);
  return [...new Set([...base.filter((d) => !movedAway.has(d)), ...movedHere])].sort();
}

// ¿Ocurre el movimiento ese día?
export const occursOn = (item, key) => occurrences(item, parseKey(key), parseKey(key)).length > 0;

function baseOccurrences(item, from, to) {
  const start = parseKey(item.date);
  const end = item.until ? parseKey(item.until) : null;

  if (item.frequency === 'once' || !item.frequency) {
    return start >= from && start <= to ? [item.date] : [];
  }

  const lo = start > from ? start : from;
  const hi = end && end < to ? end : to;
  if (lo > hi) return [];

  const out = [];
  if (item.frequency === 'daily') {
    for (let d = lo; d <= hi; d = addDays(d, 1)) out.push(toKey(d));
  } else if (item.frequency === 'weekly') {
    const elapsed = Math.round((lo - start) / 86400000);
    for (let d = addDays(lo, (7 - (elapsed % 7)) % 7); d <= hi; d = addDays(d, 7)) out.push(toKey(d));
  } else if (item.frequency === 'monthly') {
    // Si el mes no tiene ese día (p. ej. 31), se usa el último día del mes. `day` guarda el día original
    // cuando una serie sigue desde una repetición (por ejemplo, un sueldo del 30 que se cambió desde febrero).
    const day = item.day ?? start.getDate();
    let y = lo.getFullYear();
    let m = lo.getMonth();
    for (;;) {
      const d = new Date(y, m, Math.min(day, daysInMonth(y, m)));
      if (d > hi) break;
      if (d >= lo) out.push(toKey(d));
      m += 1;
      if (m > 11) { m = 0; y += 1; }
    }
  } else if (item.frequency === 'yearly') {
    // Cada año el mismo día (un 29 de febrero cae el 28 en los años que no son bisiestos).
    const mo = start.getMonth();
    const day = item.day ?? start.getDate();
    for (let y = lo.getFullYear(); ; y += 1) {
      const d = new Date(y, mo, Math.min(day, daysInMonth(y, mo)));
      if (d > hi) break;
      if (d >= lo) out.push(toKey(d));
    }
  }
  return out;
}

// Compra en cuotas: la fecha de la última cuota (n pagos mensuales desde `date`).
export function lastInstallment(date, count) {
  const start = parseKey(date);
  return occurrences({ date, frequency: 'monthly' }, start, new Date(start.getFullYear(), start.getMonth() + count, 31))[count - 1];
}

// «Pago k de n» de una serie mensual con fecha final (por ejemplo, las cuotas).
export function installmentOf(item) {
  if (item.frequency !== 'monthly' || !item.until || !item.occurrence) return null;
  const all = occurrences(item, parseKey(item.date), parseKey(item.until));
  const k = all.indexOf(item.occurrence) + 1;
  return k > 0 && all.length > 1 && all.length <= 60 ? { k, n: all.length } : null;
}

// Repeticiones marcadas como «Ya lo pagué»: dejan de avisar.
export const withPaid = (movements) =>
  movements.map((m) => (m.paidDates?.length ? { ...m, isPaid: (occ) => m.paidDates.includes(occ) } : m));

// Cambiar o terminar una serie «desde una fecha» sin tocar lo que ya pasó: la serie original termina el día
// anterior y, si hay cambios, sigue una serie nueva desde esa fecha.
export function endSeriesBefore(item, occurrence) {
  return { ...item, until: toKey(addDays(parseKey(occurrence), -1)) };
}

// Todas las apariciones de los movimientos en el rango, ordenadas por fecha.
export function expandRange(items, from, to) {
  return items
    .flatMap((item) => occurrences(item, from, to).map((occurrence) => ({ ...item, occurrence })))
    .sort((a, b) => a.occurrence.localeCompare(b.occurrence));
}

export function sumTotals(list) {
  let income = 0;
  let expense = 0;
  for (const item of list) {
    if (item.type === 'income') income += item.amount;
    else expense += item.amount;
  }
  const r = (x) => Math.round(x * 100) / 100;
  return { income: r(income), expense: r(expense), balance: r(income - expense) };
}
