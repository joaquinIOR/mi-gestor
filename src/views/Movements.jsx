import { useMemo, useState } from 'react';
import { Wallet } from 'lucide-react';
import MonthSwitcher from '../components/MonthSwitcher';
import MovementRow from '../components/MovementRow';
import { formatLong, monthEnd, monthStart } from '../lib/dates';
import { formatMoney } from '../lib/format';
import { expandRange, sumTotals } from '../lib/recurrence';

const FILTERS = [
  { value: 'all', label: 'Todos' },
  { value: 'expense', label: 'Gastos' },
  { value: 'income', label: 'Ingresos' },
];

export default function Movements({ movements, currency, cursor, onCursor, onEdit }) {
  const [filter, setFilter] = useState('all');

  const items = useMemo(
    () => expandRange(movements, monthStart(cursor.y, cursor.m), monthEnd(cursor.y, cursor.m)).reverse(),
    [movements, cursor]
  );
  const totals = sumTotals(items);
  const visible = filter === 'all' ? items : items.filter((i) => i.type === filter);

  const groups = [];
  for (const item of visible) {
    const last = groups[groups.length - 1];
    if (last?.date === item.occurrence) last.items.push(item);
    else groups.push({ date: item.occurrence, items: [item] });
  }

  return (
    <div className="stack">
      <MonthSwitcher cursor={cursor} onChange={onCursor} />

      <div className="totals">
        <div>
          <span className="muted">Ingresos</span>
          <strong className="income">{formatMoney(totals.income, currency)}</strong>
        </div>
        <div>
          <span className="muted">Gastos</span>
          <strong className="expense">{formatMoney(totals.expense, currency)}</strong>
        </div>
        <div>
          <span className="muted">Balance</span>
          <strong className={totals.balance < 0 ? 'expense' : ''}>{formatMoney(totals.balance, currency)}</strong>
        </div>
      </div>

      <div className="segmented">
        {FILTERS.map((f) => (
          <button type="button" key={f.value} className={filter === f.value ? 'on' : ''} onClick={() => setFilter(f.value)}>
            {f.label}
          </button>
        ))}
      </div>

      {groups.length ? (
        groups.map((group) => (
          <section key={group.date} className="card">
            <h3 className="day-title">{formatLong(group.date)}</h3>
            <div className="list">
              {group.items.map((item) => (
                <MovementRow key={`${item.id}@${item.occurrence}`} item={item} currency={currency} onClick={() => onEdit(item)} />
              ))}
            </div>
          </section>
        ))
      ) : (
        <div className="empty-state">
          <Wallet size={40} />
          <p>No hay movimientos este mes.</p>
          <p className="muted">Toca + para agregar un gasto o ingreso.</p>
        </div>
      )}
    </div>
  );
}
