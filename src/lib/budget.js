import { monthEnd, monthStart } from './dates';
import { expandRange, sumTotals } from './recurrence';

export const WARN_OPTIONS = [
  { value: 0, label: 'No' },
  { value: 80, label: '80 %' },
  { value: 90, label: '90 %' },
];

// Gasto del mes actual (incluye las repeticiones programadas de este mes).
export function monthSpent(movements, now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth();
  return sumTotals(expandRange(movements, monthStart(y, m), monthEnd(y, m))).expense;
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
