import { useState } from 'react';
import { ChevronLeft, Minus, Pencil, Plus, Target, Trash2, X } from 'lucide-react';
import AmountHint from './AmountHint';
import { addDays, formatShort, parseKey, toKey, todayKey } from '../lib/dates';
import { formatMoney, MAX_AMOUNT, parseAmount, uid } from '../lib/format';
import { GOAL_EMOJIS, goalExpired, goalSaved, monthlyNeeded } from '../lib/goals';

const longDate = (key) => parseKey(key).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' });

const pct = (goal) => Math.min(100, (goalSaved(goal) / goal.target) * 100);

function Progress({ goal }) {
  const value = pct(goal);
  return (
    <div className="goal-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)} aria-label={`Progreso de ${goal.name}`}>
      <span style={{ width: `${value}%` }} />
    </div>
  );
}

function GoalForm({ initial, currency, onSave, onCancel, onDelete }) {
  const [name, setName] = useState(initial.name ?? '');
  const [emoji, setEmoji] = useState(initial.emoji ?? GOAL_EMOJIS[0]);
  const [target, setTarget] = useState(initial.target != null ? String(initial.target) : '');
  const [deadline, setDeadline] = useState(initial.deadline ?? '');
  const [error, setError] = useState('');

  const submit = (e) => {
    e.preventDefault();
    const value = parseAmount(target);
    if (!name.trim()) return setError('Ponle un nombre a la meta.');
    if (!(value > 0)) return setError('Escribe cuánto quieres juntar.');
    if (value >= MAX_AMOUNT) return setError('El monto es demasiado grande.');
    if (deadline && deadline !== initial.deadline && deadline <= todayKey()) return setError('La fecha debe ser futura.');
    onSave({
      id: initial.id ?? uid(),
      name: name.trim().slice(0, 40),
      emoji,
      target: Math.round(value * 100) / 100,
      deadline: deadline || null,
      entries: initial.entries ?? [],
      createdAt: initial.createdAt ?? Date.now(),
    });
  };

  return (
    <form className="form" onSubmit={submit}>
      <label className="field">
        <span>Nombre</span>
        <input placeholder="Ej.: Vacaciones, notebook, fondo de emergencia…" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} autoFocus={!initial.id} />
      </label>
      <div className="field">
        <span>Ícono</span>
        <div className="chips">
          {GOAL_EMOJIS.map((em) => (
            <button type="button" key={em} className={`chip emoji-chip ${emoji === em ? 'on' : ''}`} aria-pressed={emoji === em} onClick={() => setEmoji(em)} aria-label={`Ícono ${em}`}>
              {em}
            </button>
          ))}
        </div>
      </div>
      <label className="field">
        <span>¿Cuánto quieres juntar?</span>
        <div className="money-input">
          <span>{currency}</span>
          <input inputMode="decimal" placeholder="0" value={target} onChange={(e) => setTarget(e.target.value.replace(/[^\d.,]/g, ''))} />
        </div>
        <AmountHint value={target} currency={currency} />
      </label>
      <label className="field">
        <span>¿Para cuándo? (opcional)</span>
        <input type="date" value={deadline} min={toKey(addDays(new Date(), 1))} onChange={(e) => setDeadline(e.target.value)} />
      </label>
      {error && <p className="error">{error}</p>}
      <div className="actions">
        {initial.id && (
          <button type="button" className="btn danger ghost" onClick={() => window.confirm(`¿Borrar la meta «${initial.name}»?`) && onDelete(initial.id)}>
            <Trash2 size={18} /> Borrar
          </button>
        )}
        <button type="button" className="btn ghost" onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className="btn primary grow">
          Guardar
        </button>
      </div>
    </form>
  );
}

function MoveForm({ goal, mode, currency, onSave, onCancel }) {
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const saved = goalSaved(goal);
  const submit = (e) => {
    e.preventDefault();
    const value = parseAmount(amount);
    if (!(value > 0)) return setError('Escribe un monto mayor que 0.');
    if (value >= MAX_AMOUNT) return setError('El monto es demasiado grande.');
    if (mode === 'out' && value > saved) return setError(`Solo tienes ${formatMoney(saved, currency)} en esta meta.`);
    const rounded = Math.round(value * 100) / 100;
    onSave({ id: uid(), date: todayKey(), amount: mode === 'out' ? -rounded : rounded });
  };
  return (
    <form className="subform" onSubmit={submit}>
      <div className="money-input">
        <span>{currency}</span>
        <input inputMode="decimal" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))} autoFocus aria-label={mode === 'out' ? 'Monto a retirar' : 'Monto a aportar'} />
      </div>
      <AmountHint value={amount} currency={currency} />
      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button type="button" className="btn ghost" onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className="btn primary grow">
          {mode === 'out' ? 'Retirar' : 'Aportar'}
        </button>
      </div>
    </form>
  );
}

function GoalDetail({ goal, currency, onBack, onChange, onDelete }) {
  const [mode, setMode] = useState(null);
  const [editing, setEditing] = useState(false);
  const saved = goalSaved(goal);
  const left = Math.max(0, goal.target - saved);
  const monthly = monthlyNeeded(goal);
  const expired = goalExpired(goal);
  const removeEntry = (entry) => {
    const text = `${entry.amount < 0 ? 'retiro' : 'aporte'} de ${formatMoney(Math.abs(entry.amount), currency)} del ${formatShort(entry.date)}`;
    if (window.confirm(`¿Borrar el ${text}?`)) onChange({ ...goal, entries: goal.entries.filter((e) => e.id !== entry.id) });
  };

  if (editing) {
    return (
      <GoalForm
        initial={goal}
        currency={currency}
        onCancel={() => setEditing(false)}
        onDelete={onDelete}
        onSave={(g) => {
          onChange(g);
          setEditing(false);
        }}
      />
    );
  }

  return (
    <div className="form">
      <button type="button" className="btn ghost small back" onClick={onBack}>
        <ChevronLeft size={16} /> Todas las metas
      </button>
      <div className="goal-hero">
        <span className="goal-emoji" aria-hidden="true">
          {goal.emoji}
        </span>
        <div>
          <h3>{goal.name}</h3>
          <p className="muted">
            {formatMoney(saved, currency)} de {formatMoney(goal.target, currency)} · {Math.floor(pct(goal))} %
          </p>
        </div>
        <button type="button" className="icon-btn" onClick={() => setEditing(true)} aria-label="Editar meta">
          <Pencil size={18} />
        </button>
      </div>
      <Progress goal={goal} />
      <p className="hint">
        {left === 0
          ? '🎉 ¡Meta cumplida!'
          : expired
            ? `Faltan ${formatMoney(left, currency)}. La fecha (${longDate(goal.deadline)}) ya pasó: toca ✏️ para poner una nueva.`
            : monthly != null
              ? `Faltan ${formatMoney(left, currency)}. Para llegar el ${longDate(goal.deadline)}, ahorra unos ${formatMoney(Math.ceil(monthly), currency)} al mes.`
              : `Faltan ${formatMoney(left, currency)}.`}
      </p>
      {mode ? (
        <MoveForm
          goal={goal}
          mode={mode}
          currency={currency}
          onCancel={() => setMode(null)}
          onSave={(entry) => {
            onChange({ ...goal, entries: [...goal.entries, entry] });
            setMode(null);
          }}
        />
      ) : (
        <div className="actions">
          <button type="button" className="btn grow" onClick={() => setMode('out')} disabled={saved <= 0}>
            <Minus size={18} /> Retirar
          </button>
          <button type="button" className="btn primary grow" onClick={() => setMode('in')}>
            <Plus size={18} /> Aportar
          </button>
        </div>
      )}
      {goal.entries.length > 0 && (
        <div className="field">
          <span>Movimientos</span>
          <ul className="goal-history">
            {[...goal.entries].reverse().map((e) => (
              <li key={e.id}>
                <span>{formatShort(e.date)}</span>
                <b className={e.amount < 0 ? 'expense' : 'income'}>
                  {e.amount < 0 ? '−' : '+'}
                  {formatMoney(Math.abs(e.amount), currency)}
                </b>
                <button type="button" className="icon-btn small" aria-label={`Borrar ${e.amount < 0 ? 'retiro' : 'aporte'} del ${formatShort(e.date)}`} onClick={() => removeEntry(e)}>
                  <X size={16} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function GoalsCard({ goals, currency, onOpen }) {
  const total = goals.reduce((sum, g) => sum + goalSaved(g), 0);
  const first = goals[0];
  return (
    <button type="button" className="card link-card goals-card" onClick={onOpen}>
      <span className="link-icon goals">
        <Target size={22} />
      </span>
      <span className="row-main">
        <span className="row-title">Metas de ahorro</span>
        <span className="row-sub">
          {goals.length ? `${goals.length === 1 ? '1 meta' : `${goals.length} metas`} · ${formatMoney(total, currency)} ahorrados` : 'Junta para lo que quieras'}
        </span>
        {first && <Progress goal={first} />}
      </span>
    </button>
  );
}

export default function Goals({ goals, currency, onSave, onDelete }) {
  const [openId, setOpenId] = useState(null);
  const [creating, setCreating] = useState(false);
  const open = goals.find((g) => g.id === openId);

  if (creating) {
    return (
      <GoalForm
        initial={{}}
        currency={currency}
        onCancel={() => setCreating(false)}
        onSave={(g) => {
          onSave(g);
          setCreating(false);
          setOpenId(g.id);
        }}
      />
    );
  }
  if (open) {
    return (
      <GoalDetail
        goal={open}
        currency={currency}
        onBack={() => setOpenId(null)}
        onChange={onSave}
        onDelete={(id) => {
          onDelete(id);
          setOpenId(null);
        }}
      />
    );
  }

  return (
    <div className="form">
      {goals.length ? (
        <div className="list">
          {goals.map((g) => (
            <button type="button" key={g.id} className="row goal-row" onClick={() => setOpenId(g.id)}>
              <span className="goal-emoji small" aria-hidden="true">
                {g.emoji}
              </span>
              <span className="row-main">
                <span className="row-title">{g.name}</span>
                <span className="row-sub">
                  {formatMoney(goalSaved(g), currency)} de {formatMoney(g.target, currency)}
                  {g.deadline && ` · ${formatShort(g.deadline)} ${g.deadline.slice(0, 4)}`}
                </span>
                <Progress goal={g} />
              </span>
              <span className="goal-pct">{Math.floor(pct(g))} %</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="empty">Crea una meta (vacaciones, un notebook, un fondo de emergencia…) y ve cómo avanza con cada aporte.</p>
      )}
      <button type="button" className="btn primary" onClick={() => setCreating(true)}>
        <Plus size={18} /> Nueva meta
      </button>
      <p className="hint">Los aportes a una meta no se cuentan como gastos: es dinero que apartas.</p>
    </div>
  );
}
