import { useState } from 'react';
import AmountHint from './AmountHint';
import { categoryEmoji } from '../lib/categories';
import { relativeDay } from '../lib/dates';
import { formatMoney, MAX_AMOUNT, parseAmount } from '../lib/format';

const keyOf = (item) => `${item.id}@${item.occurrence}`;

// «¿Cuánto tienes hoy?»: el saldo se escribe una vez (o cuando quieras corregirlo) y desde ahí la app suma y
// resta cada movimiento cuando llega su fecha. Lo programado para hoy se pregunta: ¿ya está en ese monto?
export default function WalletForm({ current, questions, currency, onSave, onClear, onCancel }) {
  const [value, setValue] = useState(current == null ? '' : String(Math.abs(current)));
  const [negative, setNegative] = useState(current != null && current < 0);
  const [answers, setAnswers] = useState(() => Object.fromEntries(questions.map((q) => [keyOf(q), !q.notYet?.some((n) => n.date === q.occurrence)])));
  const [error, setError] = useState('');

  const submit = (e) => {
    e.preventDefault();
    const text = value.trim();
    const minus = text.startsWith('-');
    const amount = parseAmount(text.replace(/^-/, ''));
    if (!text || !(amount >= 0)) return setError('Escribe cuánto tienes (puede ser 0).');
    if (amount >= MAX_AMOUNT) return setError('El monto es demasiado grande.');
    const signed = Math.round(amount * 100) / 100 * (negative || minus ? -1 : 1);
    onSave(
      signed === 0 ? 0 : signed,
      questions.map((q) => ({ id: q.id, occurrence: q.occurrence, done: answers[keyOf(q)] !== false }))
    );
  };

  return (
    <form className="form" onSubmit={submit}>
      <p className="hint">
        Mira tu cuenta (y lo que tengas en efectivo) y escribe cuánto tienes ahora. Desde aquí, la app suma y resta cada ingreso y
        gasto cuando llega su fecha.
      </p>
      <label className="field">
        <span>Tienes hoy</span>
        <div className="money-input">
          <span>{negative ? `−${currency}` : currency}</span>
          <input
            inputMode="decimal"
            placeholder="0"
            aria-label="Saldo de hoy"
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/[^\d.,-]/g, '').replace(/(?!^)-/g, ''))}
            autoFocus
          />
        </div>
        <AmountHint value={value.replace(/^-/, '')} currency={currency} />
      </label>
      <label className="toggle">
        <span className="row-main">
          <span className="row-title">Mi cuenta está en negativo</span>
          <span className="hint">Si usas sobregiro o línea de crédito y hoy debes plata.</span>
        </span>
        <input type="checkbox" role="switch" checked={negative} onChange={(e) => setNegative(e.target.checked)} />
      </label>

      {questions.length > 0 && (
        <div className="field">
          <span>¿Esto ya está en ese monto?</span>
          <div className="wallet-questions">
            {questions.map((q) => {
              const income = q.type === 'income';
              const done = answers[keyOf(q)] !== false;
              const label = q.description || q.category;
              return (
                <div key={keyOf(q)} className="wallet-question" role="group" aria-label={label}>
                  <span className="row-main">
                    <span className="row-title">
                      {categoryEmoji(q.category)} {label}
                    </span>
                    <span className="row-sub">
                      {income ? '+' : '−'}
                      {formatMoney(q.amount, currency)} · {relativeDay(q.occurrence)}
                    </span>
                  </span>
                  <div className="segmented">
                    <button type="button" className={done ? `on ${q.type}` : ''} aria-pressed={done} onClick={() => setAnswers((a) => ({ ...a, [keyOf(q)]: true }))}>
                      {income ? 'Ya llegó' : 'Ya se pagó'}
                    </button>
                    <button type="button" className={done ? '' : 'on'} aria-pressed={!done} onClick={() => setAnswers((a) => ({ ...a, [keyOf(q)]: false }))}>
                      Todavía no
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="hint">Lo que marques «Todavía no» se sumará o restará cuando llegue, y te preguntaré por eso.</p>
        </div>
      )}

      {error && <p className="error">{error}</p>}
      <div className="actions">
        {onClear && (
          <button
            type="button"
            className="btn ghost danger"
            onClick={() => window.confirm('¿Dejar de usar tu saldo? Inicio volverá a mostrar el balance del mes.') && onClear()}
          >
            Quitar saldo
          </button>
        )}
        <button type="button" className="btn ghost" onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className="btn primary grow">
          Guardar
        </button>
      </div>
    </form>
  );
}
