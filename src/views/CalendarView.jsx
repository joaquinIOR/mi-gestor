import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import MonthSwitcher from '../components/MonthSwitcher';
import MovementRow from '../components/MovementRow';
import { daysInMonth, formatLong, monthEnd, monthStart, parseKey, todayKey, toKey, WEEKDAYS } from '../lib/dates';
import { formatMoney } from '../lib/format';
import { expandRange, sumTotals } from '../lib/recurrence';

export default function CalendarView({ movements, currency, cursor, onCursor, onEdit, onAdd }) {
  const today = todayKey();
  const [selected, setSelected] = useState(today);
  const { y, m } = cursor;

  const byDay = useMemo(() => {
    const map = {};
    for (const item of expandRange(movements, monthStart(y, m), monthEnd(y, m))) {
      (map[item.occurrence] ??= []).push(item);
    }
    return map;
  }, [movements, y, m]);

  const dayItems = useMemo(() => {
    const d = parseKey(selected);
    return expandRange(movements, d, d);
  }, [movements, selected]);
  const dayTotals = sumTotals(dayItems);

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
            return (
              <button type="button" key={key} className={classes} onClick={() => setSelected(key)} aria-label={formatLong(key)}>
                <span>{parseKey(key).getDate()}</span>
                <span className="dots">
                  {items.some((x) => x.type === 'income') && <i className="dot income" />}
                  {items.some((x) => x.type === 'expense') && <i className="dot expense" />}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="card">
        <div className="day-head">
          <h3 className="day-title">{formatLong(selected)}</h3>
          <button type="button" className="btn small primary" onClick={() => onAdd({ date: selected })}>
            <Plus size={16} /> Agregar
          </button>
        </div>
        {dayItems.length ? (
          <>
            <div className="list">
              {dayItems.map((item) => (
                <MovementRow key={item.id} item={item} currency={currency} onClick={() => onEdit(item)} />
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
    </div>
  );
}
