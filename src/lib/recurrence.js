import { addDays, daysInMonth, parseKey, toKey } from './dates';

export const FREQUENCIES = [
  { value: 'once', label: 'Una vez' },
  { value: 'daily', label: 'Diario' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'monthly', label: 'Mensual' },
];

export const REMINDERS = [
  { value: 'none', label: 'Sin aviso' },
  { value: '0', label: 'El mismo día' },
  { value: '1', label: '1 día antes' },
  { value: '3', label: '3 días antes' },
];

export const frequencyLabel = (value) => FREQUENCIES.find((f) => f.value === value)?.label ?? value;

// Fechas (claves 'YYYY-MM-DD') en las que ocurre un movimiento dentro de [from, to].
export function occurrences(item, from, to) {
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
    // Si el mes no tiene ese día (p. ej. 31), se usa el último día del mes.
    const day = start.getDate();
    let y = lo.getFullYear();
    let m = lo.getMonth();
    for (;;) {
      const d = new Date(y, m, Math.min(day, daysInMonth(y, m)));
      if (d > hi) break;
      if (d >= lo) out.push(toKey(d));
      m += 1;
      if (m > 11) { m = 0; y += 1; }
    }
  }
  return out;
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
  return { income, expense, balance: income - expense };
}
