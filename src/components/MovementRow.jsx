import { Bell, CreditCard, House, IdCard, Repeat, Users } from 'lucide-react';
import { categoryEmoji } from '../lib/categories';
import { relativeDay, todayKey } from '../lib/dates';
import { formatMoney } from '../lib/format';
import { frequencyLabel, installmentOf } from '../lib/recurrence';

export default function MovementRow({ item, currency, onClick, showDate = false }) {
  const today = todayKey();
  // En las listas del mes, lo que aún no ocurre (por ejemplo, el sueldo del día 30) se marca como «Programado».
  const future = !showDate && !!item.occurrence && item.occurrence > today && !item.bill;
  const when = showDate ? `${relativeDay(item.occurrence)}${item.occurrence.slice(0, 4) !== today.slice(0, 4) ? ` ${item.occurrence.slice(0, 4)}` : ''}` : null;
  const installment = installmentOf(item);
  const sub = [item.card && item.description !== `Pago ${item.card}` ? item.card : null, item.description ? item.category : null, when].filter(Boolean);
  return (
    <button type="button" className={`row${future ? ' future' : ''}`} onClick={onClick}>
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
          {future && <span className="badge">Programado</span>}
          {installment ? (
            <span className="badge">
              <Repeat size={11} /> Pago {installment.k} de {installment.n}
            </span>
          ) : (
            item.frequency !== 'once' &&
            !item.bill && (
              <span className="badge">
                <Repeat size={11} /> {frequencyLabel(item.frequency)}
              </span>
            )
          )}
          {item.card && <CreditCard size={12} aria-label="Pago de tarjeta" />}
          {item.reminder != null && <Bell size={12} aria-label="Con recordatorio" />}
        </span>
      </span>
      {item.doc ? (
        <span className="badge">
          <IdCard size={11} /> Documento
        </span>
      ) : (
        <span className={`amount ${item.type}`}>
          {item.type === 'expense' ? '−' : '+'}
          {formatMoney(item.amount, currency)}
        </span>
      )}
    </button>
  );
}
