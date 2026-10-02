import { formatMoney, MAX_AMOUNT, parseAmount } from '../lib/format';

// Muestra cómo se guardará el monto cuando lleva puntos o comas (p. ej. «15,990» → $15.990), para evitar sorpresas.
export default function AmountHint({ value, currency }) {
  if (!/[.,]/.test(value)) return null;
  const amount = parseAmount(value);
  if (!(amount > 0)) return null;
  if (amount >= MAX_AMOUNT) return <p className="hint warn-text">El monto es demasiado grande.</p>;
  return (
    <p className="hint amount-hint">
      Se guardará: <b>{formatMoney(Math.round(amount * 100) / 100, currency)}</b>
    </p>
  );
}
