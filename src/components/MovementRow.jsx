import { Bell, CreditCard, House, Repeat, Users } from 'lucide-react';
import { categoryEmoji } from '../lib/categories';
import { relativeDay } from '../lib/dates';
import { formatMoney } from '../lib/format';
import { frequencyLabel } from '../lib/recurrence';

export default function MovementRow({ item, currency, onClick, showDate = false }) {
  const sub = [item.card && item.description !== `Pago ${item.card}` ? item.card : null, item.description ? item.category : null, showDate ? relativeDay(item.occurrence) : null].filter(Boolean);
  return (
    <button type="button" className="row" onClick={onClick}>
      <span className={`row-icon ${item.type}`} aria-hidden="true">
        {categoryEmoji(item.category)}
      </span>
      <span className="row-main">
        <span className="row-title">{item.description || item.category}</span>
        <span className="row-sub">
          {sub.join(' · ')}
          {item.shared && (
            <span className="badge">
              <Users size={11} /> Tu parte · {item.shared}
            </span>
          )}
          {item.bill && (
            <span className="badge">
              <House size={11} /> Cuenta de {item.bill}
            </span>
          )}
          {item.frequency !== 'once' && !item.bill && (
            <span className="badge">
              <Repeat size={11} /> {frequencyLabel(item.frequency)}
            </span>
          )}
          {item.card && <CreditCard size={12} aria-label="Pago de tarjeta" />}
          {item.reminder != null && <Bell size={12} aria-label="Con recordatorio" />}
        </span>
      </span>
      <span className={`amount ${item.type}`}>
        {item.type === 'expense' ? '−' : '+'}
        {formatMoney(item.amount, currency)}
      </span>
    </button>
  );
}
