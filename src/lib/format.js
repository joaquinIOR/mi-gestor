export function formatMoney(amount, symbol = '$') {
  const abs = Math.abs(amount);
  const decimals = Number.isInteger(abs) ? 0 : 2;
  const value = abs.toLocaleString('es', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return `${amount < 0 ? '-' : ''}${symbol}${value}`;
}

// crypto.randomUUID solo existe en contextos seguros (HTTPS); fuera de ellos se usan bytes aleatorios.
export const uid = () =>
  typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
