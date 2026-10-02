import { parseKey, todayKey } from './dates';
import { MAX_AMOUNT, uid } from './format';
import { isDateKey } from './validate';

export const GOAL_EMOJIS = ['🎯', '✈️', '🏠', '🚗', '🎓', '💻', '🎁', '🏥', '🐶', '💍'];

export const goalSaved = (goal) => Math.max(0, goal.entries.reduce((sum, e) => sum + e.amount, 0));

export const goalExpired = (goal, today = todayKey()) => !!goal.deadline && goal.deadline < today;

// Cuánto habría que ahorrar cada mes para llegar a la fecha (si la tiene).
export function monthlyNeeded(goal, today = todayKey()) {
  if (!goal.deadline) return null;
  const left = goal.target - goalSaved(goal);
  if (left <= 0) return 0;
  const now = parseKey(today);
  const end = parseKey(goal.deadline);
  const months = (end.getFullYear() - now.getFullYear()) * 12 + (end.getMonth() - now.getMonth()) + (end.getDate() >= now.getDate() ? 0 : -1);
  return months >= 1 ? left / months : left;
}

export function sanitizeGoals(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 50).flatMap((g) => {
    if (!g || typeof g !== 'object') return [];
    const name = typeof g.name === 'string' ? g.name.trim().slice(0, 40) : '';
    const target = Number(g.target);
    if (!name || !(target > 0 && target < MAX_AMOUNT)) return [];
    const entries = (Array.isArray(g.entries) ? g.entries : []).slice(0, 2000).flatMap((e) => {
      const amount = Number(e?.amount);
      return Number.isFinite(amount) && amount !== 0 && Math.abs(amount) < MAX_AMOUNT && isDateKey(e.date)
        ? [{ id: uid(), date: e.date, amount: Math.round(amount * 100) / 100 }]
        : [];
    });
    return [
      {
        id: uid(),
        name,
        emoji: GOAL_EMOJIS.includes(g.emoji) ? g.emoji : GOAL_EMOJIS[0],
        target: Math.round(target * 100) / 100,
        deadline: isDateKey(g.deadline) ? g.deadline : null,
        entries,
        createdAt: Number.isFinite(g.createdAt) ? g.createdAt : Date.now(),
      },
    ];
  });
}
