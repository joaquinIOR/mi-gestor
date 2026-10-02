import { ChevronLeft, ChevronRight } from 'lucide-react';
import { MONTHS } from '../lib/dates';

export default function MonthSwitcher({ cursor, onChange }) {
  const shift = (delta) => {
    const d = new Date(cursor.y, cursor.m + delta, 1);
    onChange(d.getFullYear(), d.getMonth());
  };
  const now = new Date();
  const isNow = cursor.y === now.getFullYear() && cursor.m === now.getMonth();
  return (
    <div className="month-switcher">
      <button type="button" className="icon-btn" onClick={() => shift(-1)} aria-label="Mes anterior">
        <ChevronLeft size={20} />
      </button>
      <span>
        {MONTHS[cursor.m]} {cursor.y}
        {!isNow && (
          <button type="button" className="btn ghost small today-btn" onClick={() => onChange(now.getFullYear(), now.getMonth())}>
            Hoy
          </button>
        )}
      </span>
      <button type="button" className="icon-btn" onClick={() => shift(1)} aria-label="Mes siguiente">
        <ChevronRight size={20} />
      </button>
    </div>
  );
}
