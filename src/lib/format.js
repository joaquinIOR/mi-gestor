// Montos máximos que se aceptan (lo mismo que acepta la copia de seguridad y el grupo).
export const MAX_AMOUNT = 1e12;

export function formatMoney(amount, symbol = '$') {
  // Se redondea a centavos antes de mostrar: evita "-$0" o "$10.000,00" por restos de las sumas.
  const cents = Math.round(amount * 100);
  const abs = Math.abs(cents) / 100;
  const decimals = cents % 100 === 0 ? 0 : 2;
  const value = abs.toLocaleString('es-CL', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return `${cents < 0 ? '-' : ''}${symbol}${value}`;
}

// crypto.randomUUID solo existe en contextos seguros (HTTPS); fuera de ellos se arma un UUID v4 con bytes
// aleatorios (con guiones, igual que lo devuelve el servidor, para que las entradas del grupo coincidan).
export const uid = () => {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

// Interpreta montos escritos a la chilena: "3.000" = tres mil, "3,50" = tres coma cincuenta.
// También "15,990" o "1,500,000" con comas de miles (como en algunos teclados y boletas).
export function parseAmount(text) {
  const value = String(text).trim();
  if (!value) return NaN;
  if (/^[1-9]\d{0,2}(,\d{3})+$/.test(value)) return Number(value.replace(/,/g, ''));
  if (value.includes(',')) return Number(value.replace(/\./g, '').replace(',', '.'));
  if (/^\d{1,3}(\.\d{3})+$/.test(value)) return Number(value.replace(/\./g, ''));
  return Number(value);
}
