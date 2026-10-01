import { useMemo } from 'react';
import { Bell, ChevronRight, IdCard, StickyNote, TrendingDown, TrendingUp } from 'lucide-react';
import MovementRow from '../components/MovementRow';
import { categoryEmoji } from '../lib/categories';
import { addDays, MONTHS, monthEnd, monthStart, parseKey, todayKey } from '../lib/dates';
import { formatMoney } from '../lib/format';
import { expandRange, sumTotals } from '../lib/recurrence';

export default function Home({ movements, notesCount, currency, onAdd, onEdit, onNavigate }) {
  const today = todayKey();
  const now = parseKey(today);
  const y = now.getFullYear();
  const m = now.getMonth();

  const monthItems = useMemo(() => expandRange(movements, monthStart(y, m), monthEnd(y, m)), [movements, y, m]);
  const totals = sumTotals(monthItems);

  const upcoming = useMemo(() => {
    const start = parseKey(today);
    return expandRange(movements.filter((x) => x.reminder != null), start, addDays(start, 7)).slice(0, 6);
  }, [movements, today]);

  const byCategory = useMemo(() => {
    const map = new Map();
    for (const item of monthItems) {
      if (item.type === 'expense') map.set(item.category, (map.get(item.category) ?? 0) + item.amount);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [monthItems]);
  const maxCategory = byCategory[0]?.[1] ?? 0;

  return (
    <div className="stack">
      <section className="card hero">
        <p className="muted">Balance de {MONTHS[m].toLowerCase()}</p>
        <p className={`big ${totals.balance < 0 ? 'expense' : ''}`}>{formatMoney(totals.balance, currency)}</p>
        <div className="split">
          <div>
            <span className="label income">
              <TrendingUp size={16} /> Ingresos
            </span>
            <strong>{formatMoney(totals.income, currency)}</strong>
          </div>
          <div>
            <span className="label expense">
              <TrendingDown size={16} /> Gastos
            </span>
            <strong>{formatMoney(totals.expense, currency)}</strong>
          </div>
        </div>
      </section>

      <div className="quick">
        <button type="button" className="quick-btn expense" onClick={() => onAdd({ type: 'expense' })}>
          <TrendingDown size={20} /> Gasto
        </button>
        <button type="button" className="quick-btn income" onClick={() => onAdd({ type: 'income' })}>
          <TrendingUp size={20} /> Ingreso
        </button>
      </div>

      <button type="button" className="card link-card" onClick={() => onNavigate('documents')}>
        <span className="link-icon docs">
          <IdCard size={22} />
        </span>
        <span className="row-main">
          <span className="row-title">Mis documentos</span>
          <span className="row-sub">Carnet, tarjetas, licencia…</span>
        </span>
        <ChevronRight size={20} className="muted" />
      </button>

      <button type="button" className="card link-card" onClick={() => onNavigate('notes')}>
        <span className="link-icon notes">
          <StickyNote size={22} />
        </span>
        <span className="row-main">
          <span className="row-title">Notas</span>
          <span className="row-sub">{notesCount === 1 ? '1 nota' : `${notesCount} notas`}</span>
        </span>
        <ChevronRight size={20} className="muted" />
      </button>

      <section className="card">
        <h3 className="card-title">
          <Bell size={18} /> Próximos recordatorios
        </h3>
        {upcoming.length ? (
          <div className="list">
            {upcoming.map((item) => (
              <MovementRow
                key={`${item.id}@${item.occurrence}`}
                item={item}
                currency={currency}
                showDate
                onClick={() => onEdit(item)}
              />
            ))}
          </div>
        ) : (
          <p className="empty">Nada en los próximos 7 días. Activa un recordatorio al crear un gasto o ingreso.</p>
        )}
      </section>

      <section className="card">
        <h3 className="card-title">Gastos por tipo este mes</h3>
        {byCategory.length ? (
          <div className="bars">
            {byCategory.map(([name, amount]) => (
              <div key={name} className="bar-row">
                <span className="bar-label">
                  {categoryEmoji(name)} {name}
                </span>
                <span className="bar-value">{formatMoney(amount, currency)}</span>
                <span className="bar-track">
                  <span className="bar-fill" style={{ width: `${(amount / maxCategory) * 100}%` }} />
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="empty">Aún no hay gastos este mes.</p>
        )}
      </section>
    </div>
  );
}
