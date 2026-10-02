import { useMemo, useState } from 'react';
import { Search, Wallet, X } from 'lucide-react';
import MonthlySummary from '../components/MonthlySummary';
import MonthSwitcher from '../components/MonthSwitcher';
import MovementRow from '../components/MovementRow';
import { formatLong, monthEnd, monthStart } from '../lib/dates';
import { formatMoney } from '../lib/format';
import { expandRange, sumTotals } from '../lib/recurrence';
import { myShares } from '../lib/shared';

const FILTERS = [
  { value: 'all', label: 'Todos' },
  { value: 'expense', label: 'Gastos' },
  { value: 'income', label: 'Ingresos' },
];

export default function Movements({ movements, groups, countShared, currency, cursor, onCursor, onEdit, onOpenGroup }) {
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  // La búsqueda recorre todos los meses (descripción, tipo y tarjeta).
  const results = useMemo(
    () =>
      q
        ? movements
            .filter((m) => `${m.description} ${m.category} ${m.card ?? ''}`.toLowerCase().includes(q))
            .map((m) => ({ ...m, occurrence: m.date }))
            .sort((a, b) => b.date.localeCompare(a.date))
        : [],
    [movements, q]
  );

  const items = useMemo(
    () =>
      [
        ...expandRange(movements, monthStart(cursor.y, cursor.m), monthEnd(cursor.y, cursor.m)),
        ...(countShared ? myShares(groups, monthStart(cursor.y, cursor.m), monthEnd(cursor.y, cursor.m)) : []),
      ]
        .sort((a, b) => a.occurrence.localeCompare(b.occurrence))
        .reverse(),
    [movements, groups, countShared, cursor]
  );
  const totals = sumTotals(items);
  const visible = filter === 'all' ? items : items.filter((i) => i.type === filter);

  const days = [];
  for (const item of visible) {
    const last = days[days.length - 1];
    if (last?.date === item.occurrence) last.items.push(item);
    else days.push({ date: item.occurrence, items: [item] });
  }

  const searchBox = (
    <div className="search">
      <Search size={18} />
      <input placeholder="Buscar en todos los meses" value={query} onChange={(e) => setQuery(e.target.value)} />
      {query && (
        <button type="button" className="icon-btn small" onClick={() => setQuery('')} aria-label="Borrar búsqueda">
          <X size={16} />
        </button>
      )}
    </div>
  );

  if (q) {
    return (
      <div className="stack">
        {searchBox}
        <p className="hint">{results.length === 1 ? '1 resultado' : `${results.length} resultados`}</p>
        {results.length ? (
          <section className="card">
            <div className="list">
              {results.map((item) => (
                <MovementRow key={item.id} item={item} currency={currency} showDate onClick={() => onEdit(item)} />
              ))}
            </div>
          </section>
        ) : (
          <div className="empty-state">
            <Search size={40} />
            <p>No hay movimientos con «{query.trim()}».</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="stack">
      {searchBox}
      <MonthSwitcher cursor={cursor} onChange={onCursor} />
      <MonthlySummary key={`${cursor.y}-${cursor.m}`} movements={movements} groups={countShared ? groups : []} cursor={cursor} currency={currency} />

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

      {days.length ? (
        days.map((group) => (
          <section key={group.date} className="card">
            <h3 className="day-title">{formatLong(group.date)}</h3>
            <div className="list">
              {group.items.map((item) => (
                <MovementRow
                  key={`${item.id}@${item.occurrence}`}
                  item={item}
                  currency={currency}
                  onClick={() => (item.shared ? onOpenGroup() : onEdit(item))}
                />
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
