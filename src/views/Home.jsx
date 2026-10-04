import { useMemo, useState } from 'react';
import { Bell, ChevronRight, CircleHelp, IdCard, Pencil, StickyNote, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import BudgetBar from '../components/BudgetBar';
import { GoalsCard } from '../components/Goals';
import MovementRow from '../components/MovementRow';
import Sheet from '../components/Sheet';
import WalletForm from '../components/WalletForm';
import { cashSummary, isDone, pendingConfirmations, walletQuestions } from '../lib/cash';
import { addDays, MONTHS, monthEnd, monthStart, parseKey, toKey, todayKey } from '../lib/dates';
import { formatMoney } from '../lib/format';
import { expandRange, occursOn, sumTotals, withPaid } from '../lib/recurrence';
import { billReminders, myShares } from '../lib/shared';

// «Por recibir · Por pagar» y cómo terminaría el mes.
function HeroPlan({ toReceive, toPay, endOfMonth, month, currency }) {
  if (!(toReceive > 0) && !(toPay > 0)) return <p className="hero-line">Nada más programado para {month}.</p>;
  return (
    <>
      <p className="hero-line">
        {toReceive > 0 && (
          <span>
            Por recibir <b>+{formatMoney(toReceive, currency)}</b>
          </span>
        )}
        {toReceive > 0 && toPay > 0 && ' · '}
        {toPay > 0 && (
          <span>
            Por pagar <b>−{formatMoney(toPay, currency)}</b>
          </span>
        )}
      </p>
      <p className="hero-line soft">
        A fin de {month}: <b>{formatMoney(endOfMonth, currency)}</b>
      </p>
    </>
  );
}

// «¿Ya te llegó?» / «¿Ya se cobró?» para una repetición programada.
function ConfirmRow({ item, currency, ask, onAnswer, onEdit }) {
  const [moving, setMoving] = useState(false);
  const [date, setDate] = useState('');
  const [error, setError] = useState('');
  const income = item.type === 'income';
  const label = item.description || item.category;
  const tomorrow = toKey(addDays(parseKey(todayKey()), 1));

  const move = (e) => {
    e.preventDefault();
    if (!date || date < tomorrow) return setError('Elige una fecha desde mañana.');
    if (item.frequency !== 'once' && occursOn(item, date)) return setError('Ese día ya tiene este mismo movimiento.');
    onAnswer(item, 'move', date);
  };

  return (
    <div className="confirm-row" role="group" aria-label={label}>
      <MovementRow item={item} currency={currency} showDate onClick={() => onEdit(item)} />
      {moving ? (
        <form className="confirm-move" onSubmit={move}>
          <label className="field">
            <span>¿Cuándo {income ? 'llegará' : 'se cobrará'}?</span>
            <input type="date" value={date} min={tomorrow} onChange={(e) => setDate(e.target.value)} autoFocus />
          </label>
          {error && <p className="error">{error}</p>}
          <div className="confirm-actions">
            <button type="button" className="btn small ghost" onClick={() => setMoving(false)}>
              Cancelar
            </button>
            <button type="submit" className="btn small primary">
              Guardar fecha
            </button>
          </div>
        </form>
      ) : (
        <div className="confirm-actions">
          {ask && <span className="confirm-q">{income ? '¿Ya te llegó?' : '¿Ya se cobró?'}</span>}
          <button type="button" className="btn small primary" onClick={() => onAnswer(item, 'yes')}>
            {income ? 'Sí, llegó' : 'Sí, se pagó'}
          </button>
          <button type="button" className="btn small ghost" onClick={() => onAnswer(item, 'no')}>
            Todavía no
          </button>
          <button type="button" className="btn small ghost" onClick={() => setMoving(true)}>
            Cambiar fecha
          </button>
        </div>
      )}
    </div>
  );
}

export default function Home({ movements, groups, goals, onOpenGoals, notesCount, currency, budget, onSetBudget, settings, onSettings, onAdd, onEdit, onMarkPaid, wallet, onSaveWallet, onClearWallet, onAnswer, docReminders = [], onNavigate }) {
  const today = todayKey();
  const now = parseKey(today);
  const y = now.getFullYear();
  const m = now.getMonth();

  const month = MONTHS[m].toLowerCase();
  const [walletOpen, setWalletOpen] = useState(false);

  const countShared = settings.countShared;
  const monthItems = useMemo(
    () => [...expandRange(movements, monthStart(y, m), monthEnd(y, m)), ...(countShared ? myShares(groups, monthStart(y, m), monthEnd(y, m)) : [])],
    [movements, groups, countShared, y, m]
  );
  // Lo del mes que ya ocurrió (hasta hoy) y lo que falta (programado o «Todavía no»).
  const [doneItems, laterItems] = useMemo(
    () => [monthItems.filter((i) => isDone(i, today)), monthItems.filter((i) => !isDone(i, today))],
    [monthItems, today]
  );
  const sharedTotal = doneItems.filter((i) => i.shared).reduce((sum, i) => sum + i.amount, 0);
  const totals = sumTotals(doneItems);
  const later = sumTotals(laterItems);

  // Saldo real: desde lo que escribiste, con lo que sale de tu bolsillo en los grupos.
  const cash = useMemo(
    () => (wallet ? cashSummary({ movements, groups: countShared ? groups : [], wallet, today }) : null),
    [movements, groups, countShared, wallet, today]
  );
  const confirmations = useMemo(() => pendingConfirmations({ movements, wallet, today }), [movements, wallet, today]);
  const questions = useMemo(() => (walletOpen ? walletQuestions({ movements, today }) : []), [walletOpen, movements, today]);

  const upcoming = useMemo(() => {
    const start = parseKey(today);
    // Cada movimiento aparece cuando entra en su propio plazo de aviso (mínimo una semana).
    return [...withPaid(movements), ...billReminders(groups), ...docReminders]
      .filter((x) => x.reminder != null)
      .flatMap((x) => expandRange([x], start, addDays(start, Math.max(7, x.reminder))))
      .filter((x) => !x.isPaid?.(x.occurrence))
      .sort((a, b) => a.occurrence.localeCompare(b.occurrence))
      // Solo la próxima vez de cada uno, para que un gasto diario no tape los demás pagos.
      .filter((x, i, list) => list.findIndex((o) => o.id === x.id) === i)
      .slice(0, 6);
  }, [movements, groups, docReminders, today]);

  const byCategory = useMemo(() => {
    const map = new Map();
    for (const item of doneItems) {
      if (item.type === 'expense') map.set(item.category, (map.get(item.category) ?? 0) + item.amount);
    }
    return [...map.entries()];
  }, [doneItems]);

  return (
    <div className="stack">
      <section className="card hero">
        {cash ? (
          <>
            <div className="hero-top">
              <p className="muted">Tienes hoy</p>
              <button type="button" className="hero-edit" onClick={() => setWalletOpen(true)} aria-label="Ajustar saldo">
                <Pencil size={14} /> Ajustar
              </button>
            </div>
            <p className={`big ${cash.balance < 0 ? 'expense' : ''}`}>{formatMoney(cash.balance, currency)}</p>
            <HeroPlan toReceive={cash.toReceive} toPay={cash.toPay} endOfMonth={cash.endOfMonth} month={month} currency={currency} />
          </>
        ) : (
          <>
            <p className="muted">Balance de {month} hasta hoy</p>
            <p className={`big ${totals.balance < 0 ? 'expense' : ''}`}>{formatMoney(totals.balance, currency)}</p>
            <HeroPlan toReceive={later.income} toPay={later.expense} endOfMonth={totals.balance + later.balance} month={month} currency={currency} />
            <button type="button" className="hero-cta" onClick={() => setWalletOpen(true)}>
              <Wallet size={18} />
              <span>
                <b>¿Cuánto tienes hoy?</b>
                <small>Escríbelo una vez y verás tu saldo real cada día.</small>
              </span>
              <ChevronRight size={18} />
            </button>
          </>
        )}
        <div className="split">
          <div>
            <span className="label income">
              <TrendingUp size={16} /> Ingresos
            </span>
            <strong>{formatMoney(totals.income, currency)}</strong>
            <small className="hero-note">hasta hoy</small>
          </div>
          <div>
            <span className="label expense">
              <TrendingDown size={16} /> Gastos
            </span>
            <strong>{formatMoney(totals.expense, currency)}</strong>
            <small className="hero-note">
              hasta hoy{sharedTotal > 0 && ` · incluye ${formatMoney(sharedTotal, currency)} de tu parte en común`}
            </small>
          </div>
        </div>
      </section>

      {confirmations.length > 0 && (
        <section className="card confirm-card" aria-labelledby="confirm-title">
          <h3 className="card-title" id="confirm-title">
            <CircleHelp size={18} />{' '}
            {confirmations.length > 1 ? '¿Ya ocurrieron?' : confirmations[0].type === 'income' ? '¿Ya te llegó?' : '¿Ya se cobró?'}
          </h3>
          <p className="hint">Mientras no respondas, cuenta en tu saldo como si hubiera ocurrido.</p>
          <div className="list">
            {confirmations.map((item) => (
              <ConfirmRow key={`${item.id}@${item.occurrence}`} item={item} currency={currency} ask={confirmations.length > 1} onAnswer={onAnswer} onEdit={onEdit} />
            ))}
          </div>
          {confirmations.length > 1 && (
            <button type="button" className="btn small" onClick={() => confirmations.forEach((item) => onAnswer(item, 'yes'))}>
              Sí, todo ocurrió
            </button>
          )}
        </section>
      )}

      <BudgetBar
        expenses={byCategory}
        scheduled={later.expense}
        income={totals.income + later.income}
        budget={budget}
        monthLabel={month}
        currency={currency}
        onSetBudget={onSetBudget}
        settings={settings}
        onSettings={onSettings}
      />

      <div className="quick">
        <button type="button" className="quick-btn expense" onClick={() => onAdd({ type: 'expense' })}>
          <TrendingDown size={20} /> Gasto
        </button>
        <button type="button" className="quick-btn income" onClick={() => onAdd({ type: 'income' })}>
          <TrendingUp size={20} /> Ingreso
        </button>
      </div>

      <GoalsCard goals={goals} currency={currency} onOpen={onOpenGoals} />

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
              <div key={`${item.id}@${item.occurrence}`} className="upcoming-row">
                <MovementRow
                  item={item}
                  currency={currency}
                  showDate
                  onClick={() => (item.bill ? onNavigate('group', 'casa') : item.doc ? onNavigate('documents') : onEdit(item))}
                />
                {item.type === 'expense' && !item.bill && !item.doc && (
                  <button type="button" className="btn small ghost paid-btn" onClick={() => onMarkPaid(item.id, item.occurrence)} aria-label={`Ya pagué ${item.description || item.category}`}>
                    Ya lo pagué
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="empty">Nada próximo. Activa un recordatorio al crear un gasto o ingreso.</p>
        )}
      </section>

      {walletOpen && (
        <Sheet title={wallet ? 'Ajustar saldo' : '¿Cuánto tienes hoy?'} onClose={() => setWalletOpen(false)}>
          <WalletForm
            current={cash?.balance ?? null}
            questions={questions}
            currency={currency}
            onCancel={() => setWalletOpen(false)}
            onSave={(amount, answers) => {
              onSaveWallet(amount, answers);
              setWalletOpen(false);
            }}
            onClear={
              wallet
                ? () => {
                    onClearWallet();
                    setWalletOpen(false);
                  }
                : null
            }
          />
        </Sheet>
      )}

    </div>
  );
}
