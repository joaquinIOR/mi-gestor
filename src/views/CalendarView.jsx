import { useMemo, useState } from 'react';
import { Bell, CreditCard, Plus } from 'lucide-react';
import MonthSwitcher from '../components/MonthSwitcher';
import MovementRow from '../components/MovementRow';
import { daysInMonth, formatLong, monthEnd, monthStart, parseKey, todayKey, toKey, WEEKDAYS } from '../lib/dates';
import { formatMoney } from '../lib/format';
import { expandRange, reminderLabel, sumTotals } from '../lib/recurrence';
import { myShares } from '../lib/shared';

export default function CalendarView({ movements, groups = [], currency, cursor, onCursor, onEdit, onAdd, onOpenGroup }) {
  const today = todayKey();
  // Si se abre en otro mes (el Historial y el Calendario comparten el mes), se elige el día 1 de ese mes.
  const [selected, setSelected] = useState(() => {
    const now = parseKey(today);
    return now.getFullYear() === cursor.y && now.getMonth() === cursor.m ? today : toKey(new Date(cursor.y, cursor.m, 1));
  });
  const { y, m } = cursor;

  const byDay = useMemo(() => {
    const map = {};
    // Incluye tu parte de los gastos en común (si así lo elegiste en Ajustes).
    for (const item of [...expandRange(movements, monthStart(y, m), monthEnd(y, m)), ...myShares(groups, monthStart(y, m), monthEnd(y, m))]) {
      (map[item.occurrence] ??= []).push(item);
    }
    return map;
  }, [movements, groups, y, m]);

  const dayItems = useMemo(() => {
    const d = parseKey(selected);
    return [...expandRange(movements, d, d), ...myShares(groups, d, d)];
  }, [movements, groups, selected]);
  const dayTotals = sumTotals(dayItems);
  const cardPayments = Object.values(byDay)
    .flat()
    .filter((i) => i.card)
    .sort((a, b) => a.occurrence.localeCompare(b.occurrence));

  const changeMonth = (ny, nm) => {
    onCursor(ny, nm);
    const now = parseKey(today);
    setSelected(now.getFullYear() === ny && now.getMonth() === nm ? today : toKey(new Date(ny, nm, 1)));
  };

  const lead = (new Date(y, m, 1).getDay() + 6) % 7; // semanas empiezan en lunes
  const cells = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth(y, m) }, (_, i) => toKey(new Date(y, m, i + 1)))];

  return (
    <div className="stack">
      <section className="card calendar">
        <MonthSwitcher cursor={cursor} onChange={changeMonth} />
        <div className="cal-grid">
          {WEEKDAYS.map((d) => (
            <span key={d} className="cal-weekday">
              {d}
            </span>
          ))}
          {cells.map((key, i) => {
            if (!key) return <span key={`blank-${i}`} />;
            const items = byDay[key] ?? [];
            const classes = ['cal-day', key === today && 'today', key === selected && 'selected'].filter(Boolean).join(' ');
            // Para lectores de pantalla: la fecha y qué hay ese día (los puntos de colores no se leen).
            const count = (n, one, many) => (n ? `${n} ${n === 1 ? one : many}` : null);
            const label = [
              `${formatLong(key)}${key === today ? ' (hoy)' : ''}`,
              count(items.filter((x) => x.type === 'income').length, 'ingreso', 'ingresos'),
              count(items.filter((x) => x.type === 'expense' && !x.card).length, 'gasto', 'gastos'),
              count(items.filter((x) => x.card).length, 'pago de tarjeta', 'pagos de tarjeta'),
            ]
              .filter(Boolean)
              .join(', ');
            return (
              <button type="button" key={key} className={classes} onClick={() => setSelected(key)} aria-label={label} aria-pressed={key === selected}>
                <span>{parseKey(key).getDate()}</span>
                <span className="dots">
                  {items.some((x) => x.type === 'income') && <i className="dot income" />}
                  {items.some((x) => x.type === 'expense' && !x.card) && <i className="dot expense" />}
                  {items.some((x) => x.card) && <i className="dot cardpay" />}
                </span>
              </button>
            );
          })}
        </div>
        <div className="cal-legend" aria-hidden="true">
          <span><i className="dot income" /> Ingreso</span>
          <span><i className="dot expense" /> Gasto</span>
          <span><i className="dot cardpay" /> Pago de tarjeta</span>
        </div>
      </section>

      <section className="card">
        <div className="day-head">
          <h3 className="day-title">{formatLong(selected)}</h3>
          <div className="day-actions">
            <button
              type="button"
              className="btn small"
              onClick={() =>
                onAdd({ date: selected, type: 'expense', category: 'Deudas', frequency: 'monthly', reminder: 3, cardPayment: true })
              }
            >
              <CreditCard size={16} /> Pago de tarjeta
            </button>
            <button type="button" className="btn small primary" onClick={() => onAdd({ date: selected })}>
              <Plus size={16} /> Agregar
            </button>
          </div>
        </div>
        {dayItems.length ? (
          <>
            <div className="list">
              {dayItems.map((item) => (
                <MovementRow key={item.id} item={item} currency={currency} onClick={() => (item.shared ? onOpenGroup?.() : onEdit(item))} />
              ))}
            </div>
            <p className="day-total">
              Balance del día: <strong className={dayTotals.balance < 0 ? 'expense' : 'income'}>{formatMoney(dayTotals.balance, currency)}</strong>
            </p>
          </>
        ) : (
          <p className="empty">Sin movimientos este día.</p>
        )}
      </section>

      <section className="card">
        <h3 className="card-title">
          <CreditCard size={18} /> Pagos de tarjeta del mes
        </h3>
        {cardPayments.length ? (
          <div className="list">
            {cardPayments.map((item) => (
              <button type="button" key={`${item.id}@${item.occurrence}`} className="row" onClick={() => onEdit(item)}>
                <span className="row-icon card-icon" aria-hidden="true">
                  <CreditCard size={18} />
                </span>
                <span className="row-main">
                  <span className="row-title">{item.card}</span>
                  <span className="row-sub">
                    {formatLong(item.occurrence)}
                    {item.reminder != null && (
                      <span className="badge">
                        <Bell size={11} /> {reminderLabel(item.reminder)}
                      </span>
                    )}
                  </span>
                </span>
                <span className="amount expense">{formatMoney(item.amount, currency)}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="empty">No hay pagos de tarjeta este mes. Elige un día y toca «Pago de tarjeta».</p>
        )}
      </section>
    </div>
  );
}
