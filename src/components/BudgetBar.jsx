import { useState } from 'react';
import { AlertTriangle, Pencil } from 'lucide-react';
import { categoryColor, categoryEmoji, categorySlot } from '../lib/categories';
import { formatMoney, parseAmount } from '../lib/format';

const percent = (value) => `${value.toLocaleString('es-CL', { maximumFractionDigits: value < 10 ? 1 : 0 })} %`;

function BudgetForm({ budget, income, currency, onSave, onCancel }) {
  const [value, setValue] = useState(budget ? String(budget) : '');
  const [error, setError] = useState('');

  const submit = (e) => {
    e.preventDefault();
    const amount = parseAmount(value);
    if (!(amount > 0 && amount < 1e12)) return setError('Escribe un monto mayor que 0.');
    onSave(Math.round(amount * 100) / 100);
  };

  return (
    <form className="subform" onSubmit={submit}>
      <label className="field">
        <span>Tope mensual (por ejemplo, tu sueldo)</span>
        <div className="money-input">
          <span>{currency}</span>
          <input
            inputMode="decimal"
            placeholder="400.000"
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/[^\d.,]/g, ''))}
            autoFocus
          />
        </div>
      </label>
      {income > 0 && (
        <button type="button" className="chip" onClick={() => setValue(String(income))}>
          Usar mis ingresos del mes ({formatMoney(income, currency)})
        </button>
      )}
      {error && <p className="error">{error}</p>}
      <div className="actions">
        {budget && (
          <button type="button" className="btn ghost danger" onClick={() => onSave(null)}>
            Quitar tope
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

// Barra de progreso del mes: el tope es el 100 % y cada tipo de gasto suma un tramo de su color.
export default function BudgetBar({ expenses, income, budget, monthLabel, currency, onSetBudget }) {
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState(null);

  const spent = expenses.reduce((sum, [, amount]) => sum + amount, 0);
  // Si te pasas del tope, la barra se reescala al gasto total y una marca indica dónde estaba el tope.
  const scale = Math.max(budget ?? 0, spent) || 1;
  const reference = budget ?? spent;
  const over = budget ? spent - budget : 0;

  // Orden fijo por color (no por monto), para que cada tipo esté siempre en el mismo sitio.
  const legend = [...expenses].sort((a, b) => (categorySlot(a[0]) || 99) - (categorySlot(b[0]) || 99) || b[1] - a[1]);
  const otherTotal = legend.filter(([name]) => !categorySlot(name)).reduce((sum, [, amount]) => sum + amount, 0);
  const segments = [
    ...legend.filter(([name]) => categorySlot(name)).map(([name, amount]) => ({ key: name, label: name, amount, color: categoryColor(name) })),
    ...(otherTotal ? [{ key: '__other', label: 'Otros', amount: otherTotal, color: 'var(--cat-other)' }] : []),
  ];
  const isSelected = (name) => selected === name || (selected === '__other' && !categorySlot(name));
  const selectedSegment = segments.find((s) => s.key === selected);

  return (
    <section className="card budget">
      <div className="budget-head">
        <div>
          <h3 className="card-title">{budget ? `Presupuesto de ${monthLabel}` : `Gastos de ${monthLabel}`}</h3>
          <p className="budget-figures">
            <strong>{formatMoney(spent, currency)}</strong>
            {budget ? <span className="muted"> de {formatMoney(budget, currency)}</span> : null}
          </p>
        </div>
        <button type="button" className="icon-btn" onClick={() => setEditing((v) => !v)} aria-label={budget ? 'Cambiar tope' : 'Definir tope'}>
          <Pencil size={18} />
        </button>
      </div>

      {editing && (
        <BudgetForm
          budget={budget}
          income={income}
          currency={currency}
          onCancel={() => setEditing(false)}
          onSave={(value) => {
            onSetBudget(value);
            setEditing(false);
          }}
        />
      )}

      <div
        className="budget-track"
        role="img"
        aria-label={budget ? `Gastado ${percent((spent / budget) * 100)} del tope` : `Gastos del mes por tipo`}
      >
        {segments.map((s) => (
          <button
            type="button"
            key={s.key}
            className={`budget-seg ${selected && selected !== s.key ? 'dim' : ''}`}
            style={{ width: `${(s.amount / scale) * 100}%`, background: s.color }}
            onClick={() => setSelected((cur) => (cur === s.key ? null : s.key))}
            aria-label={`${s.label}: ${formatMoney(s.amount, currency)}`}
          />
        ))}
        {over > 0 && <span className="budget-limit" style={{ left: `${(budget / scale) * 100}%` }} aria-hidden="true" />}
      </div>

      {selectedSegment ? (
        <p className="budget-detail">
          <i className="dot-lg" style={{ background: selectedSegment.color }} /> {selectedSegment.label}: <b>{formatMoney(selectedSegment.amount, currency)}</b> ·{' '}
          {percent((selectedSegment.amount / reference) * 100)} {budget ? 'del tope' : 'del gasto'}
        </p>
      ) : budget ? (
        over > 0 ? (
          <p className="budget-status over">
            <AlertTriangle size={16} /> Te pasaste por <b>{formatMoney(over, currency)}</b> ({percent((spent / budget) * 100)} del tope)
          </p>
        ) : (
          <p className="budget-status">
            Disponible: <b>{formatMoney(budget - spent, currency)}</b> · usado {percent((spent / budget) * 100)}
          </p>
        )
      ) : (
        <button type="button" className="btn small" onClick={() => setEditing(true)}>
          Define tu tope mensual (por ejemplo, tu sueldo)
        </button>
      )}

      {legend.length ? (
        <ul className="budget-legend">
          {legend.map(([name, amount]) => (
            <li key={name}>
              <button
                type="button"
                className={`legend-row ${selected && !isSelected(name) ? 'dim' : ''}`}
                onClick={() => setSelected((cur) => {
                  const key = categorySlot(name) ? name : '__other';
                  return cur === key ? null : key;
                })}
              >
                <i className="dot-lg" style={{ background: categoryColor(name) }} />
                <span className="legend-name">
                  {categoryEmoji(name)} {name}
                </span>
                <span className="legend-amount">{formatMoney(amount, currency)}</span>
                <span className="legend-pct">{percent((amount / reference) * 100)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty">Aún no hay gastos este mes.</p>
      )}
    </section>
  );
}
