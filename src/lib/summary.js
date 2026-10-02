import { MONTHS, monthEnd, monthStart, todayKey } from './dates';
import { expandRange, frequencyLabel, sumTotals } from './recurrence';
import { myShares } from './shared';

// Movimientos (y, si corresponde, mi parte de los gastos en común) de un mes.
export function monthItems(movements, groups, y, m) {
  const from = monthStart(y, m);
  const to = monthEnd(y, m);
  return [...expandRange(movements, from, to), ...myShares(groups, from, to)];
}

// Totales de los últimos `count` meses terminando en (y, m).
export function lastMonths(movements, groups, y, m, count = 6) {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(y, m - (count - 1 - i), 1);
    const totals = sumTotals(monthItems(movements, groups, d.getFullYear(), d.getMonth()));
    // Los meses que aún no llegan son una proyección de lo que se repite.
    const future = d > new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    return { y: d.getFullYear(), m: d.getMonth(), label: MONTHS[d.getMonth()].slice(0, 3), name: MONTHS[d.getMonth()], future, ...totals };
  });
}

// Gasto por tipo este mes comparado con el anterior.
export function categoryComparison(movements, groups, y, m) {
  const sum = (items) => {
    const map = new Map();
    for (const i of items) if (i.type === 'expense') map.set(i.category, (map.get(i.category) ?? 0) + i.amount);
    return map;
  };
  const prev = new Date(y, m - 1, 1);
  const now = sum(monthItems(movements, groups, y, m));
  const before = sum(monthItems(movements, groups, prev.getFullYear(), prev.getMonth()));
  return [...new Set([...now.keys(), ...before.keys()])]
    .map((name) => ({ name, now: now.get(name) ?? 0, before: before.get(name) ?? 0 }))
    .sort((a, b) => b.now - a.now || b.before - a.before);
}

// --- Exportar a Excel (CSV con ";" y BOM, como lo abre Excel en español) ---

// Evita que Excel interprete un texto como fórmula (inyección CSV).
const cell = (value) => {
  // Los montos son números: van tal cual para que Excel pueda sumarlos.
  if (typeof value === 'number') return String(Math.round(value * 100) / 100).replace('.', ',');
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export function movementsCsv(movements, groups, months = 24) {
  const now = new Date();
  const rows = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    rows.push(...monthItems(movements, groups, d.getFullYear(), d.getMonth()));
  }
  rows.sort((a, b) => a.occurrence.localeCompare(b.occurrence));
  const header = ['Fecha', 'Tipo', 'Categoría', 'Descripción', 'Monto', 'Repetición', 'Tarjeta', 'Grupo'];
  const lines = rows.map((r) =>
    [
      r.occurrence,
      r.type === 'income' ? 'Ingreso' : 'Gasto',
      r.category,
      r.description,
      r.type === 'income' ? r.amount : -r.amount,
      frequencyLabel(r.frequency),
      r.card ?? '',
      r.shared ? `Mi parte en ${r.shared}` : '',
    ]
      .map(cell)
      .join(';')
  );
  return `\ufeff${[header.join(';'), ...lines].join('\r\n')}\r\n`;
}

export function downloadCsv(text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `mi-gestor-movimientos-${todayKey()}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
