import { useEffect } from 'react';
import { AlertTriangle, TrendingUp } from 'lucide-react';
import { formatMoney } from '../lib/format';

const percent = (value) => `${Math.round(value).toLocaleString('es-CL')} %`;

export default function BudgetAlert({ alert, currency, onClose, onShow }) {
  const over = alert.level === 2;

  useEffect(() => {
    navigator.vibrate?.(over ? [200, 100, 200] : 150);
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [over, onClose]);

  const used = (alert.spent / alert.budget) * 100;

  return (
    <div className="sheet-backdrop alert-backdrop" onClick={onClose}>
      <div
        className={`budget-alert ${over ? 'over' : 'warn'}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="budget-alert-title"
        aria-describedby="budget-alert-text"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="alert-icon">{over ? <AlertTriangle size={30} /> : <TrendingUp size={30} />}</span>
        <h2 id="budget-alert-title">{over ? 'Estás por sobre tu presupuesto' : `Llevas el ${percent(used)} de tu presupuesto`}</h2>
        <p id="budget-alert-text">
          Este mes llevas <b>{formatMoney(alert.spent, currency)}</b> de <b>{formatMoney(alert.budget, currency)}</b> ({percent(used)}).
          <br />
          {over ? (
            <>
              Te pasaste por <b>{formatMoney(alert.spent - alert.budget, currency)}</b>.
            </>
          ) : (
            <>
              Te quedan <b>{formatMoney(alert.budget - alert.spent, currency)}</b> para el resto del mes.
            </>
          )}
        </p>
        <div className="actions">
          <button type="button" className="btn grow" onClick={onShow}>
            Ver presupuesto
          </button>
          <button type="button" className="btn primary grow" onClick={onClose} autoFocus>
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
