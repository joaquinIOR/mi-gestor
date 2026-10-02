import { useState } from 'react';
import { Bell, Copy, Plus, Trash2 } from 'lucide-react';
import AmountHint from './AmountHint';
import { categoryList } from '../lib/categories';
import { addDays, formatShort, todayKey, toKey } from '../lib/dates';
import { formatMoney, MAX_AMOUNT, parseAmount, uid } from '../lib/format';
import { ALL_CARDS, CARD_GROUPS, OTHER_CARD } from '../lib/cards';
import { notificationsSupported } from '../lib/notify';
import { endSeriesBefore, FREQUENCIES, lastInstallment, MAX_REMINDER_DAYS, REMINDERS } from '../lib/recurrence';
import { frequentTemplates } from '../lib/suggest';

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

// Solo los campos guardados (sin los que se agregan al mostrar una repetición, como «occurrence»).
const stored = (m) => ({
  id: m.id,
  type: m.type,
  amount: m.amount,
  category: m.category,
  description: m.description,
  date: m.date,
  frequency: m.frequency,
  until: m.until ?? null,
  reminder: m.reminder ?? null,
  card: m.card ?? null,
  ...(m.paidDates?.length ? { paidDates: m.paidDates } : {}),
  createdAt: m.createdAt,
});

export default function MovementForm({ initial, categories, currency, pushEnabled, movements = [], onAddCategory, onSave, onSplit, onDelete, onDuplicate }) {
  const [form, setForm] = useState(() => toForm(initial));
  // Se abrió una repetición posterior al inicio: los cambios pueden valer «desde aquí» sin tocar lo pasado.
  const fromHere = !!initial.id && initial.frequency !== 'once' && !!initial.occurrence && initial.occurrence > initial.date;
  const [scope, setScope] = useState('from');
  const [deleting, setDeleting] = useState(false);
  const [permission, setPermission] = useState(() => (notificationsSupported() ? Notification.permission : 'unsupported'));
  // Compra en cuotas: el monto es el total y se reparte en pagos mensuales.
  const [installments, setInstallments] = useState('');
  const today = todayKey();
  const yesterday = toKey(addDays(new Date(), -1));
  const frequent = initial.id ? [] : frequentTemplates(movements, form.type, today);
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
    if (amount >= MAX_AMOUNT) return setError('El monto es demasiado grande.');
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
    if (installments !== '') {
      const n = Number(installments);
      if (!Number.isInteger(n) || n < 2 || n > 48) return setError('Las cuotas deben ser entre 2 y 48.');
      return onSave({
        id: uid(),
        type: 'expense',
        amount: Math.round((amount / n) * 100) / 100,
        category: form.category,
        description: `${form.description.trim() || form.category} (${n} cuotas)`.slice(0, 60),
        date: form.date,
        frequency: 'monthly',
        until: lastInstallment(form.date, n),
        reminder,
        card,
        createdAt: Date.now(),
      });
    }
    const movement = {
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
      ...(initial.paidDates?.length ? { paidDates: initial.paidDates } : {}),
      createdAt: initial.createdAt ?? Date.now(),
    };
    if (fromHere && scope === 'from') {
      // Lo anterior queda como estaba; desde esta fecha sigue una serie nueva con los cambios.
      const start = form.date !== initial.date ? form.date : initial.occurrence;
      const cut = start < initial.occurrence ? start : initial.occurrence;
      return onSplit(endSeriesBefore(stored(initial), cut), { ...movement, id: uid(), date: start, createdAt: Date.now() });
    }
    onSave(movement);
  };

  const stopFromHere = () => onSave(endSeriesBefore(stored(initial), initial.occurrence));
  const askPermission = async () => setPermission(await Notification.requestPermission());

  return (
    <form className="form" onSubmit={submit}>
      <div className="segmented two">
        <button type="button" className={form.type === 'expense' ? 'on expense' : ''} aria-pressed={form.type === 'expense'} onClick={() => changeType('expense')}>
          Gasto
        </button>
        <button type="button" className={form.type === 'income' ? 'on income' : ''} aria-pressed={form.type === 'income'} onClick={() => changeType('income')}>
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
        <AmountHint value={form.amount} currency={currency} />
      </label>

      {frequent.length > 0 && !form.amount && (
        <div className="field">
          <span>Frecuentes</span>
          <div className="chips" aria-label="Frecuentes">
            {frequent.map((t) => (
              <button
                type="button"
                key={`${t.category}|${t.description}`}
                className="chip"
                aria-label={`Repetir ${t.description} ${formatMoney(t.amount, currency)}`}
                onClick={() => set({ amount: String(t.amount), category: t.category, description: t.description })}
              >
                {t.description} · {formatMoney(t.amount, currency)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="field">
        <span>Tipo</span>
        <div className="chips">
          {options.map((c) => (
            <button
              type="button"
              key={c.name}
              className={`chip ${form.category === c.name ? 'on' : ''}`} aria-pressed={form.category === c.name}
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

      {form.frequency === 'once' && (
        <div className="chips day-chips" aria-label="Fecha">
          {[
            [today, 'Hoy'],
            [yesterday, 'Ayer'],
          ].map(([key, label]) => (
            <button type="button" key={label} className={`chip ${form.date === key ? 'on' : ''}`} aria-pressed={form.date === key} onClick={() => set({ date: key })}>
              {label}
            </button>
          ))}
          {form.date !== today && form.date !== yesterday && <span className="chip on">{formatShort(form.date)}</span>}
        </div>
      )}

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
                  className={form.frequency === f.value ? 'on' : ''} aria-pressed={form.frequency === f.value}
                  onClick={() => set({ frequency: f.value })}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {form.type === 'expense' && !initial.id && form.frequency === 'once' && (
            <div className="field">
              <label className="toggle">
                <span className="row-main">
                  <span className="row-title">Compra en cuotas</span>
                  <span className="hint">El monto es el total; se anota una cuota cada mes.</span>
                </span>
                <input type="checkbox" role="switch" checked={installments !== ''} onChange={(e) => setInstallments(e.target.checked ? '3' : '')} />
              </label>
              {installments !== '' && (
                <>
                  <label className="field">
                    <span>¿Cuántas cuotas?</span>
                    <input inputMode="numeric" value={installments} onChange={(e) => setInstallments(e.target.value.replace(/\D/g, '').slice(0, 2))} />
                  </label>
                  {parseAmount(form.amount) > 0 && Number(installments) >= 2 && (
                    <p className="hint">
                      {installments} cuotas de {formatMoney(Math.round((parseAmount(form.amount) / Number(installments)) * 100) / 100, currency)}. Si ya anotas el pago
                      total de la tarjeta cada mes, no anotes las cuotas aparte.
                    </p>
                  )}
                </>
              )}
            </div>
          )}

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
          {form.reminder !== 'none' && permission === 'default' && (
            <div className="hint-row">
              <p className="hint">Para que el teléfono te avise, permite las notificaciones de Mi Gestor.</p>
              <button type="button" className="btn small" onClick={askPermission}>
                <Bell size={16} /> Permitir avisos
              </button>
            </div>
          )}
          {form.reminder !== 'none' && permission === 'denied' && (
            <p className="hint warn-text">Las notificaciones están bloqueadas: actívalas en los ajustes del teléfono para Mi Gestor. Mientras tanto lo verás en Inicio.</p>
          )}
          {form.reminder !== 'none' && permission === 'unsupported' && (
            <p className="hint">En iPhone, primero añade Mi Gestor a la pantalla de inicio para recibir avisos. Mientras tanto lo verás en Inicio.</p>
          )}
          {form.reminder !== 'none' && permission === 'granted' && !pushEnabled && (
            <p className="hint">Te avisaremos al abrir Mi Gestor. Para recibirlo con la app cerrada, actívalo en Ajustes → Avisos con la app cerrada.</p>
          )}
        </>
      )}

      {initial.id && initial.frequency !== 'once' && !fromHere && (
        <p className="hint">Los cambios se aplican a todas las repeticiones de este movimiento.</p>
      )}
      {fromHere && (
        <div className="field">
          <span>¿Desde cuándo vale el cambio?</span>
          <div className="segmented">
            <button type="button" className={scope === 'from' ? 'on' : ''} aria-pressed={scope === 'from'} onClick={() => setScope('from')}>
              Desde el {formatShort(initial.occurrence)}
            </button>
            <button type="button" className={scope === 'all' ? 'on' : ''} aria-pressed={scope === 'all'} onClick={() => setScope('all')}>
              Todas (también las pasadas)
            </button>
          </div>
        </div>
      )}
      {error && <p className="error">{error}</p>}

      {deleting ? (
        <div className="delete-choice">
          <p className="hint">Este movimiento se repite. ¿Qué quieres borrar?</p>
          <button type="button" className="btn" onClick={stopFromHere}>
            Dejar de repetir desde el {formatShort(initial.occurrence)} (lo anterior se conserva)
          </button>
          <button type="button" className="btn danger ghost" onClick={() => window.confirm('¿Borrar todas las repeticiones, también las de meses pasados?') && onDelete(initial.id)}>
            <Trash2 size={18} /> Borrar todas, también las pasadas
          </button>
          <button type="button" className="btn ghost small" onClick={() => setDeleting(false)}>
            Cancelar
          </button>
        </div>
      ) : (
        <div className="actions">
          {initial.id && (
            <button
              type="button"
              className="btn danger ghost"
              onClick={() => (fromHere ? setDeleting(true) : onDelete(initial.id))}
            >
              <Trash2 size={18} /> Eliminar
            </button>
          )}
          {initial.id && onDuplicate && (
            <button type="button" className="btn ghost" onClick={() => onDuplicate(stored(initial))}>
              <Copy size={18} /> Duplicar
            </button>
          )}
          <button type="submit" className="btn primary grow">
            Guardar
          </button>
        </div>
      )}
    </form>
  );
}
