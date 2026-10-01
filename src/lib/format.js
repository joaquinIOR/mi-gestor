export function formatMoney(amount, symbol = '$') {
  const abs = Math.abs(amount);
  const decimals = Number.isInteger(abs) ? 0 : 2;
  const value = abs.toLocaleString('es-CL', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return `${amount < 0 ? '-' : ''}${symbol}${value}`;
}

// crypto.randomUUID solo existe en contextos seguros (HTTPS); fuera de ellos se usan bytes aleatorios.
export const uid = () =>
  typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');

// Interpreta montos escritos a la chilena: "3.000" = tres mil, "3,50" = tres coma cincuenta.
export function parseAmount(text) {
  const value = String(text).trim();
  if (!value) return NaN;
  if (value.includes(',')) return Number(value.replace(/\./g, '').replace(',', '.'));
  if (/^\d{1,3}(\.\d{3})+$/.test(value)) return Number(value.replace(/\./g, ''));
  return Number(value);
}
