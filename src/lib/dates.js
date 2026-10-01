export const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
export const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

const pad = (n) => String(n).padStart(2, '0');

// Las fechas se guardan como 'YYYY-MM-DD' en hora local para evitar desfases de zona horaria.
export const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseKey = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const todayKey = () => toKey(new Date());
export const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
export const monthStart = (y, m) => new Date(y, m, 1);
export const monthEnd = (y, m) => new Date(y, m + 1, 0);

export const formatLong = (key) =>
  parseKey(key).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
export const formatShort = (key) =>
  parseKey(key).toLocaleDateString('es', { day: 'numeric', month: 'short' });

export function relativeDay(key) {
  const diff = Math.round((parseKey(key) - parseKey(todayKey())) / 86400000);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Mañana';
  if (diff === -1) return 'Ayer';
  return formatShort(key);
}
