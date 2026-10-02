import { monthEnd, monthStart } from './dates';
import { expandRange, sumTotals } from './recurrence';
import { myShares } from './shared';

export const WARN_OPTIONS = [
  { value: 0, label: 'No' },
  { value: 80, label: '80 %' },
  { value: 90, label: '90 %' },
];

// Gasto del mes actual (incluye las repeticiones programadas y, si se indica, mi parte de los gastos en común).
export function monthSpent(movements, groups = [], now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth();
  const from = monthStart(y, m);
  const to = monthEnd(y, m);
  return sumTotals([...expandRange(movements, from, to), ...myShares(groups, from, to)]).expense;
}

// 0 = dentro del presupuesto, 1 = aviso previo, 2 = sobre el presupuesto.
export function budgetLevel(spent, budget, warnAt) {
  if (!budget) return 0;
  if (spent > budget) return 2;
  if (warnAt && spent >= (budget * warnAt) / 100) return 1;
  return 0;
}

// Devuelve el aviso a mostrar solo cuando un cambio hace subir de nivel (se cruza el umbral).
export function budgetAlert({ before, after, budgetBefore, budgetAfter, settings }) {
  if (!settings.budgetAlert || !budgetAfter) return null;
  const warnAt = settings.budgetWarnAt;
  const from = budgetLevel(before, budgetBefore, warnAt);
  const to = budgetLevel(after, budgetAfter, warnAt);
  if (to <= from) return null;
  return { level: to, spent: after, budget: budgetAfter };
}
