export function formatMoney(amount, symbol = '$') {
  const abs = Math.abs(amount);
  const decimals = Number.isInteger(abs) ? 0 : 2;
  const value = abs.toLocaleString('es', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return `${amount < 0 ? '-' : ''}${symbol}${value}`;
}

// crypto.randomUUID solo existe en contextos seguros (HTTPS); en la red local se usa un respaldo.
export const uid = () =>
  typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2);
