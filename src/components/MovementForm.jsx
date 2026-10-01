import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { categoryList } from '../lib/categories';
import { todayKey } from '../lib/dates';
import { parseAmount, uid } from '../lib/format';
import { ALL_CARDS, CARD_GROUPS, OTHER_CARD } from '../lib/cards';
import { FREQUENCIES, MAX_REMINDER_DAYS, REMINDERS } from '../lib/recurrence';

const PRESET_REMINDERS = REMINDERS.map((r) => r.value).filter((v) => v !== 'custom');

function toForm(initial) {
  return {
    type: initial.type ?? 'expense',
    amount: initial.amount != null ? String(initial.amount) : '',
    category: initial.category ?? '',
    description: initial.description ?? '',
    date: initial.date ?? todayKey(),
    frequency: initial.frequency ?? 'once',
    until: initial.until ?? '',
    reminder: initial.reminder == null ? 'none' : PRESET_REMINDERS.includes(String(initial.reminder)) ? String(initial.reminder) : 'custom',
    reminderDays: initial.reminder != null ? String(initial.reminder) : '',
    card: initial.card ? (ALL_CARDS.includes(initial.card) ? initial.card : OTHER_CARD) : '',
    otherCard: initial.card && !ALL_CARDS.includes(initial.card) ? initial.card : '',
  };
}

export default function MovementForm({ initial, categories, currency, onAddCategory, onSave, onDelete }) {
  const [form, setForm] = useState(() => toForm(initial));
  const [newCategory, setNewCategory] = useState(null);
  // En el modo rápido solo se ve lo esencial: monto, tipo y descripción.
  const [more, setMore] = useState(!initial.express);
  const [error, setError] = useState('');
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const options = categoryList(form.type, categories);
  // La tarjeta se pide en los pagos de deudas (o al crear un "Pago de tarjeta" desde el calendario).
  const showCard = form.type === 'expense' && (form.category === 'Deudas' || initial.cardPayment || !!form.card);

  const changeType = (type) => {
    const keep = categoryList(type, categories).some((c) => c.name === form.category);
    set({ type, category: keep ? form.category : '' });
  };

  const addCategory = () => {
    const name = newCategory.trim();
    if (!name) return;
    if (!options.some((c) => c.name.toLowerCase() === name.toLowerCase())) onAddCategory(form.type, name);
    set({ category: options.find((c) => c.name.toLowerCase() === name.toLowerCase())?.name ?? name });
    setNewCategory(null);
  };

  const submit = (e) => {
    e.preventDefault();
    const amount = parseAmount(form.amount);
    if (!(amount > 0)) return setError('Escribe un monto mayor que 0.');
    if (!form.category) return setError('Elige un tipo.');
    if (!form.date) return setError('Elige una fecha.');
    const recurring = form.frequency !== 'once';
    if (recurring && form.until && form.until < form.date) return setError('La fecha final debe ser posterior al inicio.');
    let reminder = form.reminder === 'none' ? null : Number(form.reminder);
    if (form.reminder === 'custom') {
      reminder = Number(form.reminderDays);
      if (!Number.isInteger(reminder) || reminder < 1 || reminder > MAX_REMINDER_DAYS) {
        return setError(`El aviso debe ser entre 1 y ${MAX_REMINDER_DAYS} días antes.`);
      }
    }
    const card = showCard ? (form.card === OTHER_CARD ? form.otherCard.trim() : form.card) || null : null;
    if (initial.cardPayment && !card) return setError('Elige la tarjeta que vas a pagar.');
    onSave({
      id: initial.id ?? uid(),
      type: form.type,
      amount: Math.round(amount * 100) / 100,
      category: form.category,
      description: form.description.trim() || (card ? `Pago ${card}` : ''),
      date: form.date,
      frequency: form.frequency,
      until: recurring && form.until ? form.until : null,
      reminder,
      card,
      createdAt: initial.createdAt ?? Date.now(),
    });
  };

  return (
    <form className="form" onSubmit={submit}>
      <div className="segmented two">
        <button type="button" className={form.type === 'expense' ? 'on expense' : ''} onClick={() => changeType('expense')}>
          Gasto
        </button>
        <button type="button" className={form.type === 'income' ? 'on income' : ''} onClick={() => changeType('income')}>
          Ingreso
        </button>
      </div>

      <label className="field">
        <span>Monto</span>
        <div className="money-input">
          <span>{currency}</span>
          <input
            inputMode="decimal"
            placeholder="0"
            value={form.amount}
            onChange={(e) => set({ amount: e.target.value.replace(/[^\d.,]/g, '') })}
            autoFocus={!initial.id}
          />
        </div>
      </label>

      <div className="field">
        <span>Tipo</span>
        <div className="chips">
          {options.map((c) => (
            <button
              type="button"
              key={c.name}
              className={`chip ${form.category === c.name ? 'on' : ''}`}
              onClick={() => set({ category: c.name })}
            >
              {c.emoji} {c.name}
            </button>
          ))}
          {newCategory === null && (
            <button type="button" className="chip dashed" onClick={() => setNewCategory('')}>
              <Plus size={14} /> Nuevo tipo
            </button>
          )}
        </div>
        {newCategory !== null && (
          <div className="inline-add">
            <input
              placeholder="Nombre del tipo"
              value={newCategory}
              maxLength={24}
              autoFocus
              onChange={(e) => setNewCategory(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCategory())}
            />
            <button type="button" className="btn small" onClick={addCategory}>
              Añadir
            </button>
          </div>
        )}
      </div>

      {showCard && (
        <div className="field">
          <span>Tarjeta</span>
          <select value={form.card} onChange={(e) => set({ card: e.target.value })}>
            <option value="">{initial.cardPayment ? 'Elige tu tarjeta…' : 'Sin tarjeta'}</option>
            {CARD_GROUPS.map((g) => (
              <optgroup key={g.kind} label={g.label}>
                {g.cards.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </optgroup>
            ))}
            <option value={OTHER_CARD}>Otra tarjeta…</option>
          </select>
          {form.card === OTHER_CARD && (
            <input
              placeholder="Nombre de la tarjeta (sin el número)"
              maxLength={40}
              value={form.otherCard}
              onChange={(e) => set({ otherCard: e.target.value })}
              autoFocus
            />
          )}
          <p className="hint">Solo se guarda el nombre, nunca el número de la tarjeta.</p>
        </div>
      )}

      <label className="field">
        <span>Descripción corta</span>
        <input
          placeholder={form.type === 'expense' ? 'Ej.: Supermercado, luz, gasolina…' : 'Ej.: Sueldo de octubre'}
          maxLength={60}
          value={form.description}
          onChange={(e) => set({ description: e.target.value })}
        />
      </label>

      {!more && (
        <button type="button" className="btn ghost" onClick={() => setMore(true)}>
          Más opciones (fecha, repetición, recordatorio)
        </button>
      )}

      {more && (
        <>
          <label className="field">
            <span>{form.frequency === 'once' ? 'Fecha' : 'Empieza el'}</span>
            <input type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} required />
          </label>

          <div className="field">
            <span>Se repite</span>
            <div className="segmented">
              {FREQUENCIES.map((f) => (
                <button
                  type="button"
                  key={f.value}
                  className={form.frequency === f.value ? 'on' : ''}
                  onClick={() => set({ frequency: f.value })}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {form.frequency !== 'once' && (
            <label className="field">
              <span>Hasta (opcional)</span>
              <input type="date" value={form.until} min={form.date} onChange={(e) => set({ until: e.target.value })} />
            </label>
          )}

          <label className="field">
            <span>Recordatorio</span>
            <select value={form.reminder} onChange={(e) => set({ reminder: e.target.value })}>
              {REMINDERS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          {form.reminder === 'custom' && (
            <label className="field">
              <span>¿Cuántos días antes?</span>
              <input
                inputMode="numeric"
                placeholder="Ej.: 5"
                value={form.reminderDays}
                onChange={(e) => set({ reminderDays: e.target.value.replace(/\D/g, '').slice(0, 2) })}
              />
            </label>
          )}
        </>
      )}

      {initial.id && initial.frequency !== 'once' && (
        <p className="hint">Los cambios se aplican a todas las repeticiones de este movimiento.</p>
      )}
      {error && <p className="error">{error}</p>}

      <div className="actions">
        {initial.id && (
          <button
            type="button"
            className="btn danger ghost"
            onClick={() => window.confirm('¿Eliminar este movimiento?') && onDelete(initial.id)}
          >
            <Trash2 size={18} /> Eliminar
          </button>
        )}
        <button type="submit" className="btn primary grow">
          Guardar
        </button>
      </div>
    </form>
  );
}
