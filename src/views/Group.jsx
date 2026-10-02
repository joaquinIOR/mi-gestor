import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, Copy, HandCoins, House, LogOut, Plus, RefreshCw, Share2, ShoppingCart, Square, SquareCheck, Trash2, UserPen, UserPlus, Users, X } from 'lucide-react';
import setupSql from '../../supabase/setup.sql?raw';
import AmountHint from '../components/AmountHint';
import QrCode from '../components/QrCode';
import Sheet from '../components/Sheet';
import { categoryEmoji, categoryList } from '../lib/categories';
import { formatShort, MONTHS, todayKey, toKey } from '../lib/dates';
import { formatMoney, parseAmount, uid } from '../lib/format';
import {
  activity,
  balances,
  billParticipants,
  billPaymentId,
  billDueDate,
  billsOf,
  billStatus,
  createGroup,
  balanceTolerance,
  EPSILON,
  inviteLink,
  joinGroup,
  MEMBER_COLORS,
  members,
  newMember,
  normalizeServer,
  parseInvite,
  rejoinGroup,
  remoteMembers,
  settlements,
  shoppingItems,
  splitShares,
  testServer,
} from '../lib/shared';

const nameOf = (group, id) => (id === group.me ? 'Tú' : group.entries[id]?.name ?? 'Alguien');
const monthName = (period) => MONTHS[Number(period.slice(5, 7)) - 1].toLowerCase();

// Chips de personas: integrantes actuales y, si una entrada antigua las incluye, quienes ya no están
// (para poder desmarcarlas).
function PeopleChips({ group, people, selected, onToggle }) {
  const gone = selected.filter((id) => !people.some((p) => p.id === id));
  return (
    <div className="chips">
      {people.map((p) => (
        <button type="button" key={p.id} className={`chip ${selected.includes(p.id) ? 'on' : ''}`} aria-pressed={selected.includes(p.id)} onClick={() => onToggle(p.id)}>
          <i className="member-dot" style={{ background: p.color }} /> {nameOf(group, p.id)}
        </button>
      ))}
      {gone.map((id) => (
        <button type="button" key={id} className="chip on" aria-pressed="true" onClick={() => onToggle(id)}>
          {nameOf(group, id)} (ya no está)
        </button>
      ))}
    </div>
  );
}
const payerText = (group, id) => (id === group.me ? 'Pagaste tú' : `Pagó ${nameOf(group, id)}`);
function settleText(group, e) {
  if (e.from === group.me) return `Le pagaste a ${nameOf(group, e.to)}`;
  if (e.to === group.me) return `${nameOf(group, e.from)} te pagó`;
  return `${nameOf(group, e.from)} le pagó a ${nameOf(group, e.to)}`;
}

function ColorPicker({ value, onChange }) {
  return (
    <div className="colors" role="radiogroup" aria-label="Color">
      {MEMBER_COLORS.map((c) => (
        <button
          type="button"
          key={c}
          role="radio"
          aria-checked={value === c}
          aria-label={`Color ${c}`}
          className={`swatch ${value === c ? 'on' : ''}`}
          style={{ background: c }}
          onClick={() => onChange(c)}
        />
      ))}
    </div>
  );
}

function ProfileFields({ name, setName, color, setColor }) {
  return (
    <>
      <label className="field">
        <span>Tu nombre en el grupo</span>
        <input placeholder="Ej.: Tomás" maxLength={30} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="field">
        <span>Tu color</span>
        <ColorPicker value={color} onChange={setColor} />
      </div>
    </>
  );
}

function CreateGroupForm({ onCreate }) {
  const [step, setStep] = useState(1);
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [server, setServer] = useState(null);
  const [groupName, setGroupName] = useState('Casa');
  const [name, setName] = useState('');
  const [color, setColor] = useState(MEMBER_COLORS[0]);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const copySql = async () => {
    try {
      await navigator.clipboard.writeText(setupSql);
      setCopied(true);
    } catch {
      setError('No se pudo copiar. Mantén pulsado el código para copiarlo.');
    }
  };

  const check = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const s = normalizeServer(url, key);
      await testServer(s);
      setServer(s);
      setStep(2);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const create = (e) => {
    e.preventDefault();
    if (!name.trim()) return setError('Escribe tu nombre.');
    onCreate(createGroup({ name: groupName, server, me: newMember(name, color) }));
  };

  if (step === 1) {
    return (
      <form className="form" onSubmit={check}>
        <p className="hint">Una sola vez: prepara tu servidor gratuito (unos 5 minutos). Quienes invites no tendrán que hacerlo.</p>
        <ol className="steps">
          <li>
            Entra a <b>supabase.com</b>, crea una cuenta gratis y un <b>proyecto nuevo</b> (región: South America – São Paulo).
          </li>
          <li>
            En el proyecto abre <b>SQL Editor</b>, pega este código y pulsa <b>Run</b>.
            <button type="button" className="btn small" onClick={copySql}>
              {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'Copiado' : 'Copiar código'}
            </button>
            <details>
              <summary>Ver el código</summary>
              <pre className="code">{setupSql}</pre>
            </details>
          </li>
          <li>
            En <b>Project Settings → API Keys</b> (o el botón <b>Connect</b>) copia la <b>Project URL</b> y la clave <b>publishable</b> (o
            «anon public»). <b>Nunca</b> uses la clave «secret» ni «service_role».
          </li>
        </ol>
        <label className="field">
          <span>Project URL</span>
          <input placeholder="https://xxxx.supabase.co" inputMode="url" autoCapitalize="off" value={url} onChange={(e) => setUrl(e.target.value)} />
        </label>
        <label className="field">
          <span>Clave publishable / anon</span>
          <input placeholder="sb_publishable_…" autoCapitalize="off" autoCorrect="off" spellCheck={false} value={key} onChange={(e) => setKey(e.target.value)} />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" className="btn primary" disabled={busy || !url || !key}>
          {busy ? 'Probando…' : 'Probar conexión y continuar'}
        </button>
      </form>
    );
  }

  return (
    <form className="form" onSubmit={create}>
      <p className="status">✅ Servidor conectado.</p>
      <label className="field">
        <span>Nombre del grupo</span>
        <input maxLength={40} value={groupName} onChange={(e) => setGroupName(e.target.value)} />
      </label>
      <ProfileFields name={name} setName={setName} color={color} setColor={setColor} />
      {error && <p className="error">{error}</p>}
      <button type="submit" className="btn primary">
        Crear grupo
      </button>
    </form>
  );
}

function JoinForm({ initialText, groups, onJoin, onAlready }) {
  const [text, setText] = useState(initialText ?? '');
  const [name, setName] = useState('');
  // Quien se une empieza con un color al azar distinto de los que ya se usan (se puede cambiar en «Mi perfil»).
  const [color, setColor] = useState(() => MEMBER_COLORS[1 + Math.floor(Math.random() * (MEMBER_COLORS.length - 1))]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [existing, setExisting] = useState(null);

  const invite = useMemo(() => {
    try {
      return text ? parseInvite(text) : null;
    } catch {
      return null;
    }
  }, [text]);
  const already = !!invite && groups.some((g) => g.id === invite.id);

  // Quiénes ya están en el grupo: si cambiaste de teléfono, puedes retomar tu perfil en vez de duplicarte.
  useEffect(() => {
    if (!invite || already) return undefined;
    let alive = true;
    remoteMembers(invite)
      .then((list) => {
        if (!alive) return;
        setExisting(list);
        const taken = list.map((m) => m.color);
        setColor((c) => (taken.includes(c) ? MEMBER_COLORS.find((x) => !taken.includes(x)) ?? c : c));
      })
      .catch(() => alive && setExisting([]));
    return () => {
      alive = false;
    };
  }, [invite, already]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!invite) return setError('Pega el enlace de invitación que te enviaron.');
    if (!name.trim()) return setError('Escribe tu nombre.');
    const twin = existing?.find((m) => m.name.toLowerCase() === name.trim().toLowerCase());
    if (twin && !window.confirm(`Ya hay alguien llamado «${twin.name}» en el grupo. Si eres tú (por ejemplo, en un teléfono nuevo), toca tu nombre más arriba. ¿Unirte igual como otra persona?`)) return;
    setBusy(true);
    try {
      await testServer(invite.server);
      onJoin(joinGroup(invite, newMember(name, color)));
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const reclaim = (member) => {
    if (!window.confirm(`¿Eres ${member.name}? Este teléfono usará ese perfil, con sus gastos y saldos.`)) return;
    onJoin(rejoinGroup(invite, member));
  };

  if (already) {
    return (
      <div className="form">
        <p className="status">
          Ya estás en <b>«{invite.name}»</b> en este teléfono. No hace falta unirse otra vez.
        </p>
        <button type="button" className="btn primary" onClick={() => onAlready(invite.id)}>
          Ver el grupo
        </button>
      </div>
    );
  }

  return (
    <form className="form" onSubmit={submit}>
      {invite ? (
        <p className="status">
          Te invitaron al grupo <b>«{invite.name}»</b>.
        </p>
      ) : (
        <label className="field">
          <span>Enlace de invitación</span>
          <textarea rows={3} placeholder="Pega aquí el enlace que te enviaron" value={text} onChange={(e) => setText(e.target.value)} />
        </label>
      )}
      {existing?.length > 0 && (
        <div className="field">
          <span>¿Ya eras parte del grupo? Toca tu nombre</span>
          <div className="chips">
            {existing.map((m) => (
              <button type="button" key={m.id} className="chip" onClick={() => reclaim(m)}>
                <i className="member-dot" style={{ background: m.color }} /> {m.name}
              </button>
            ))}
          </div>
          <p className="hint">Por ejemplo, si cambiaste de teléfono. Si es tu primera vez, escribe tu nombre abajo.</p>
        </div>
      )}
      <ProfileFields name={name} setName={setName} color={color} setColor={setColor} />
      {error && <p className="error">{error}</p>}
      <button type="submit" className="btn primary" disabled={busy}>
        {busy ? 'Conectando…' : 'Unirme al grupo'}
      </button>
    </form>
  );
}

function InvitePanel({ group }) {
  const link = inviteLink(group);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  const share = () => navigator.share?.({ title: `Únete a «${group.name}» en Mi Gestor`, url: link }).catch(() => {});

  return (
    <div className="form invite">
      <p className="hint">
        Pídele a la otra persona que escanee este código con la cámara de su teléfono, o envíale el enlace. Al abrirlo, Mi Gestor le pedirá
        su nombre y quedará en el grupo.
      </p>
      <p className="hint">
        <b>iPhone:</b> que primero añada Mi Gestor a su pantalla de inicio y, dentro de la app, use «Unirme con invitación» pegando el
        enlace (Safari y la app instalada guardan los datos por separado).
      </p>
      <div className="qr-wrap">
        <QrCode text={link} />
      </div>
      <div className="actions">
        <button type="button" className="btn grow" onClick={copy}>
          {copied ? <Check size={18} /> : <Copy size={18} />} {copied ? 'Copiado' : 'Copiar enlace'}
        </button>
        {navigator.share && (
          <button type="button" className="btn grow" onClick={share}>
            <Share2 size={18} /> Compartir
          </button>
        )}
      </div>
      <p className="hint warn-text">
        🔒 El enlace contiene la clave del grupo: quien lo tenga puede ver y agregar gastos en común. Envíalo solo a tu familia, por un chat
        privado, y cuando ya se haya unido borra el mensaje. Si el enlace se filtra, crea un grupo nuevo y salgan de este.
      </p>
    </div>
  );
}

function SharedExpenseForm({ group, initial, categories, currency, onSave, onDelete }) {
  const people = members(group);
  const [amount, setAmount] = useState(initial.amount != null ? String(initial.amount) : '');
  const [description, setDescription] = useState(initial.description ?? '');
  const [category, setCategory] = useState(initial.category ?? 'Comida');
  const [date, setDate] = useState(initial.date ?? todayKey());
  const [paidBy, setPaidBy] = useState(initial.paidBy ?? group.me);
  const [participants, setParticipants] = useState(initial.participants ?? people.map((p) => p.id));
  const [error, setError] = useState('');

  const toggle = (id) => setParticipants((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  const value = parseAmount(amount);
  const shares = Object.values(splitShares(Math.round(value * 100) / 100, participants, paidBy));
  const payers = people.some((p) => p.id === paidBy) ? people : [...people, { id: paidBy }];

  const submit = (e) => {
    e.preventDefault();
    if (!(value > 0)) return setError('Escribe un monto mayor que 0.');
    if (!participants.length) return setError('Elige entre quiénes se divide.');
    onSave({
      id: initial.id ?? initial.payId ?? uid(),
      kind: 'expense',
      amount: Math.round(value * 100) / 100,
      description: description.trim(),
      category,
      date,
      paidBy,
      participants,
      createdBy: initial.createdBy ?? group.me,
      ...(initial.billId ? { billId: initial.billId, period: initial.period } : {}),
    });
  };

  return (
    <form className="form" onSubmit={submit}>
      {initial.billId && initial.period && (
        <p className="status">
          Pago de la cuenta de <b>{monthName(initial.period)}</b>.
        </p>
      )}
      <label className="field">
        <span>Monto</span>
        <div className="money-input">
          <span>{currency}</span>
          <input inputMode="decimal" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))} autoFocus={!initial.id} />
        </div>
        <AmountHint value={amount} currency={currency} />
      </label>
      <label className="field">
        <span>Descripción corta</span>
        <input placeholder="Ej.: Supermercado, cuenta de la luz…" maxLength={60} value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <div className="field">
        <span>Tipo</span>
        <div className="chips">
          {categoryList('expense', categories).map((c) => (
            <button type="button" key={c.name} className={`chip ${category === c.name ? 'on' : ''}`} aria-pressed={category === c.name} onClick={() => setCategory(c.name)}>
              {c.emoji} {c.name}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span>¿Quién pagó?</span>
        <div className="segmented">
          {payers.map((p) => (
            <button type="button" key={p.id} className={paidBy === p.id ? 'on' : ''} aria-pressed={paidBy === p.id} onClick={() => setPaidBy(p.id)}>
              {nameOf(group, p.id)}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span>Se divide en partes iguales entre</span>
        <PeopleChips group={group} people={people} selected={participants} onToggle={toggle} />
        {value > 0 && participants.length > 0 && (
          <p className="hint">
            {Math.max(...shares) !== Math.min(...shares) && `${formatMoney(Math.min(...shares), currency)} o `}
            {formatMoney(Math.max(...shares), currency)} por persona.
            {participants.includes(group.me) && ' Tu parte se suma sola a tus gastos del mes: no la registres otra vez.'}
          </p>
        )}
      </div>
      <label className="field">
        <span>Fecha</span>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </label>
      {error && <p className="error">{error}</p>}
      <div className="actions">
        {initial.id && (
          <button type="button" className="btn danger ghost" onClick={() => window.confirm('¿Eliminar este gasto en común para todo el grupo?') && onDelete(initial)}>
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

function SettleForm({ group, initial, currency, onSave, onDelete }) {
  const current = members(group);
  // Si el pago es con alguien que ya salió del grupo (por ejemplo, para saldar su deuda), también aparece.
  const people = [...current, ...[initial.from, initial.to].filter((id) => id && !current.some((p) => p.id === id)).map((id) => ({ id }))];
  const [from, setFrom] = useState(initial.from ?? group.me);
  const [to, setTo] = useState(initial.to ?? people.find((p) => p.id !== group.me)?.id ?? '');
  const [amount, setAmount] = useState(initial.amount != null ? String(initial.amount) : '');
  const [date, setDate] = useState(initial.date ?? todayKey());
  const [error, setError] = useState('');

  const submit = (e) => {
    e.preventDefault();
    const value = parseAmount(amount);
    if (!(value > 0)) return setError('Escribe un monto mayor que 0.');
    if (!to || from === to) return setError('Elige a quién se le pagó.');
    onSave({ id: initial.id ?? uid(), kind: 'settle', from, to, amount: Math.round(value * 100) / 100, date, createdBy: initial.createdBy ?? group.me });
  };

  return (
    <form className="form" onSubmit={submit}>
      <div className="field">
        <span>Pagó</span>
        <div className="segmented">
          {people.map((p) => (
            <button type="button" key={p.id} className={from === p.id ? 'on' : ''} aria-pressed={from === p.id} onClick={() => setFrom(p.id)}>
              {nameOf(group, p.id)}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span>A</span>
        <div className="segmented">
          {people.map((p) => (
            <button type="button" key={p.id} className={to === p.id ? 'on' : ''} aria-pressed={to === p.id} onClick={() => setTo(p.id)} disabled={p.id === from}>
              {nameOf(group, p.id)}
            </button>
          ))}
        </div>
      </div>
      <label className="field">
        <span>Monto</span>
        <div className="money-input">
          <span>{currency}</span>
          <input inputMode="decimal" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))} />
        </div>
        <AmountHint value={amount} currency={currency} />
      </label>
      <label className="field">
        <span>Fecha</span>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </label>
      {error && <p className="error">{error}</p>}
      <div className="actions">
        {initial.id && (
          <button type="button" className="btn danger ghost" onClick={() => window.confirm('¿Eliminar este pago?') && onDelete(initial)}>
            <Trash2 size={18} /> Eliminar
          </button>
        )}
        <button type="submit" className="btn primary grow">
          Guardar pago
        </button>
      </div>
    </form>
  );
}

function ProfileForm({ group, onSave }) {
  const me = group.entries[group.me];
  const [name, setName] = useState(me?.name ?? '');
  const [color, setColor] = useState(me?.color ?? MEMBER_COLORS[0]);
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        if (me && name.trim()) onSave({ ...me, name: name.trim().slice(0, 30), color });
      }}
    >
      <ProfileFields name={name} setName={setName} color={color} setColor={setColor} />
      {!me && <p className="hint">Conectando con el grupo… Intenta en unos segundos.</p>}
      <button type="submit" className="btn primary" disabled={!me}>
        Guardar perfil
      </button>
    </form>
  );
}

// Primer mes de una cuenta nueva: si este mes ya pasó el día de vencimiento, empieza el próximo
// (así no queda «vencida» una cuenta que probablemente ya se pagó por fuera).
function firstPeriod(day) {
  const now = todayKey();
  const y = Number(now.slice(0, 4));
  const m = Number(now.slice(5, 7)) - 1;
  const due = billDueDate({ date: `2000-01-${String(day).padStart(2, '0')}` }, y, m);
  return due < now ? toKey(new Date(y, m + 1, 1)).slice(0, 7) : now.slice(0, 7);
}

function BillForm({ group, initial, categories, currency, onSave, onDelete }) {
  const people = members(group);
  const [name, setName] = useState(initial.name ?? '');
  const [amount, setAmount] = useState(initial.amount != null ? String(initial.amount) : '');
  const [category, setCategory] = useState(initial.category ?? 'Servicios');
  const [day, setDay] = useState(initial.date ? String(Number(initial.date.slice(8))) : '10');
  const [reminder, setReminder] = useState(initial.reminder != null ? String(initial.reminder) : '3');
  const [participants, setParticipants] = useState(initial.participants ?? people.map((p) => p.id));
  // Por defecto, la cuenta es de todo el grupo (también de quien se una después).
  const [everyone, setEveryone] = useState(initial.id ? initial.everyone === true : true);
  const [error, setError] = useState('');
  const toggle = (id) => setParticipants((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));

  const submit = (e) => {
    e.preventDefault();
    const value = parseAmount(amount);
    const d = Number(day);
    if (!name.trim()) return setError('Ponle un nombre, por ejemplo «Luz».');
    if (!(value > 0)) return setError('Escribe el monto aproximado.');
    if (!Number.isInteger(d) || d < 1 || d > 31) return setError('El día de vencimiento debe estar entre 1 y 31.');
    if (!everyone && !participants.length) return setError('Elige entre quiénes se divide.');
    // Se guarda como fecha de enero (todos los días 1–31 existen); cada mes vence ese día o el último del mes.
    const year = initial.date ? initial.date.slice(0, 4) : todayKey().slice(0, 4);
    onSave({
      id: initial.id ?? uid(),
      kind: 'bill',
      name: name.trim(),
      amount: Math.round(value * 100) / 100,
      category,
      date: `${year}-01-${String(d).padStart(2, '0')}`,
      reminder: reminder === 'none' ? null : Number(reminder),
      participants: everyone ? people.map((p) => p.id) : participants,
      everyone,
      since: initial.since ?? firstPeriod(d),
      createdBy: initial.createdBy ?? group.me,
    });
  };

  return (
    <form className="form" onSubmit={submit}>
      <label className="field">
        <span>Nombre</span>
        <input placeholder="Ej.: Luz, agua, internet, gas…" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} autoFocus={!initial.id} />
      </label>
      <label className="field">
        <span>Monto aproximado al mes</span>
        <div className="money-input">
          <span>{currency}</span>
          <input inputMode="decimal" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))} />
        </div>
        <AmountHint value={amount} currency={currency} />
      </label>
      <label className="field">
        <span>Vence cada mes el día</span>
        <input inputMode="numeric" value={day} onChange={(e) => setDay(e.target.value.replace(/\D/g, '').slice(0, 2))} />
      </label>
      <label className="field">
        <span>Aviso para todo el grupo</span>
        <select value={reminder} onChange={(e) => setReminder(e.target.value)}>
          <option value="none">Sin aviso</option>
          <option value="0">El mismo día</option>
          <option value="1">1 día antes</option>
          <option value="3">3 días antes</option>
          <option value="7">1 semana antes</option>
        </select>
      </label>
      <div className="field">
        <span>Tipo</span>
        <div className="chips">
          {categoryList('expense', categories).map((c) => (
            <button type="button" key={c.name} className={`chip ${category === c.name ? 'on' : ''}`} aria-pressed={category === c.name} onClick={() => setCategory(c.name)}>
              {c.emoji} {c.name}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span>Se divide entre</span>
        <div className="segmented">
          <button type="button" className={everyone ? 'on' : ''} aria-pressed={everyone} onClick={() => setEveryone(true)}>
            Todo el grupo
          </button>
          <button type="button" className={!everyone ? 'on' : ''} aria-pressed={!everyone} onClick={() => setEveryone(false)}>
            Elegir personas
          </button>
        </div>
        {everyone ? (
          <p className="hint">Incluye a quien se una al grupo más adelante.</p>
        ) : (
          <PeopleChips group={group} people={people} selected={participants} onToggle={toggle} />
        )}
      </div>
      {error && <p className="error">{error}</p>}
      <div className="actions">
        {initial.id && (
          <button type="button" className="btn danger ghost" onClick={() => window.confirm(`¿Borrar la cuenta «${initial.name}» para todo el grupo?`) && onDelete(initial)}>
            <Trash2 size={18} /> Borrar
          </button>
        )}
        <button type="submit" className="btn primary grow">
          Guardar
        </button>
      </div>
    </form>
  );
}

function BillsSection({ group, currency, onAdd, onEdit, onPay }) {
  const bills = billsOf(group);
  const today = todayKey();
  const rows = bills.map((b) => ({ b, s: billStatus(group, b, today) }));
  const pending = rows.filter(({ s }) => !s.paid);
  const pendingTotal = pending.reduce((sum, { b }) => sum + b.amount, 0);
  const pay = async (b, period) => {
    const payId = await billPaymentId(group, b.id, period);
    onPay({ description: b.name, amount: b.amount, category: b.category, participants: billParticipants(group, b), billId: b.id, period, payId, date: today });
  };

  return (
    <section className="card">
      <div className="day-head">
        <h3 className="card-title">
          <House size={18} /> Cuentas de la casa
        </h3>
        <button type="button" className="btn small primary" onClick={onAdd}>
          <Plus size={16} /> Agregar
        </button>
      </div>
      {bills.length ? (
        <>
          <p className="hint">
            {pending.length ? `Faltan ${pending.length} por pagar (≈ ${formatMoney(pendingTotal, currency)}).` : '✅ Todas las cuentas de este mes están pagadas.'}
          </p>
          <div className="list">
            {rows.map(({ b, s }) => {
              const oldMonth = s.period !== today.slice(0, 7);
              return (
                <div key={b.id} className="row bill-row">
                  <button type="button" className="bill-main" onClick={() => onEdit(b)}>
                    <span className={`row-icon ${s.paid ? 'income' : 'expense'}`} aria-hidden="true">
                      {categoryEmoji(b.category)}
                    </span>
                    <span className="row-main">
                      <span className="row-title">
                        {b.name}
                        {oldMonth && ` · ${monthName(s.period)}`}
                      </span>
                      <span className={`row-sub ${s.late ? 'expense' : ''}`}>
                        {s.paid
                          ? `✓ Pagada por ${nameOf(group, s.paid.paidBy).replace(/^Tú$/, 'ti')} · próxima: ${formatShort(s.next.due)}${s.next.paid ? ' (ya pagada)' : ''}`
                          : `${s.late ? 'Venció' : 'Vence'} el ${formatShort(s.due)} · ≈ ${formatMoney(b.amount, currency)}`}
                      </span>
                      {s.payments > 1 && <span className="row-sub warn-text">⚠️ Este mes quedó registrada {s.payments} veces: revisa en «Gastos».</span>}
                    </span>
                  </button>
                  {!s.paid && (
                    <button type="button" className="btn small" onClick={() => pay(b, s.period)}>
                      Pagar
                    </button>
                  )}
                  {s.paid && s.next.canPay && (
                    <button type="button" className="btn small ghost" onClick={() => pay(b, s.next.period)}>
                      Adelantar
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <p className="empty">Agrega las cuentas que se repiten cada mes (luz, agua, internet, gas…). Les avisaremos antes de que venzan.</p>
      )}
    </section>
  );
}

function ShoppingSection({ group, onSave, onToast, onToExpense }) {
  const [text, setText] = useState('');
  const items = shoppingItems(group);
  // «Registrar compra» toma lo que marcaste tú; lo que marcó otra persona lo registra quien lo compró.
  const checked = items.filter((i) => i.checked && (!i.checkedBy || i.checkedBy === group.me));
  const othersChecked = items.filter((i) => i.checked).length - checked.length;

  const add = (e) => {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    onSave({ id: uid(), kind: 'item', text: value.slice(0, 60), checked: false, checkedBy: null, createdBy: group.me });
    setText('');
  };

  return (
    <section className="card">
      <h3 className="card-title">
        <ShoppingCart size={18} /> Lista de compras
      </h3>
      <form className="inline-add" onSubmit={add}>
        <input placeholder="Ej.: pan, leche, detergente…" maxLength={60} value={text} onChange={(e) => setText(e.target.value)} aria-label="Producto" />
        <button type="submit" className="btn small primary">
          Agregar
        </button>
      </form>
      {items.length ? (
        <ul className="shopping">
          {items.map((i) => (
            <li key={i.id} className={i.checked ? 'done' : ''}>
              <button
                type="button"
                className="shop-check"
                role="checkbox"
                aria-checked={i.checked}
                onClick={() => onSave({ ...i, checked: !i.checked, checkedBy: i.checked ? null : group.me })}
              >
                {i.checked ? <SquareCheck size={22} /> : <Square size={22} />}
                <span>{i.text}</span>
                {i.createdBy && i.createdBy !== group.me && <small className="muted">· {nameOf(group, i.createdBy)}</small>}
              </button>
              <button
                type="button"
                className="icon-btn small"
                aria-label={`Quitar ${i.text}`}
                onClick={() => {
                  onSave({ ...i, deleted: true });
                  // Un borrado es definitivo en el grupo: «Deshacer» lo vuelve a agregar.
                  onToast?.({ text: `Quitaste «${i.text}»`, action: { label: 'Deshacer', run: () => onSave({ id: uid(), kind: 'item', text: i.text, checked: false, checkedBy: null, createdBy: group.me }) } });
                }}
              >
                <X size={16} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty">La lista está vacía. Todo el grupo lo verá al instante.</p>
      )}
      {othersChecked > 0 && (
        <p className="hint">
          {othersChecked === 1 ? '1 producto lo marcó otra persona' : `${othersChecked} productos los marcó otra persona`}: lo registra quien lo compró.
        </p>
      )}
      {checked.length > 0 && (
        <button
          type="button"
          className="btn primary"
          onClick={() =>
            onToExpense({
              description: `Compras: ${checked.map((i) => i.text).join(', ')}`.slice(0, 60),
              category: 'Comida',
              fromItems: checked.map((i) => i.id),
            })
          }
        >
          <ShoppingCart size={18} /> Registrar compra de {checked.length} {checked.length === 1 ? 'producto' : 'productos'}
        </button>
      )}
    </section>
  );
}

function syncText(info) {
  if (!info) return 'Conectando…';
  if (info.error) return `⚠️ ${info.error} Se reintentará solo.`;
  const seconds = Math.max(0, Math.round((Date.now() - info.at) / 1000));
  return seconds < 10 ? 'Sincronizado ahora' : `Sincronizado hace ${seconds} s`;
}

export default function Group({ groups, syncInfo, invite, currency, categories, onAddGroup, onSaveEntry, onLeave, onSyncNow, onInviteHandled, section = 'gastos', onSection, onToast }) {
  // Una invitación a un grupo en el que ya estás solo lo abre (no se vuelve a unir ni se duplica el perfil).
  const invitedId = useMemo(() => {
    try {
      return invite ? parseInvite(invite).id : null;
    } catch {
      return null;
    }
  }, [invite]);
  const alreadyIn = !!invitedId && groups.some((g) => g.id === invitedId);
  const [sheet, setSheet] = useState(() => (invite && !alreadyIn ? { type: 'join' } : null));
  const [groupId, setGroupId] = useState(alreadyIn ? invitedId : groups[0]?.id ?? null);
  const setSection = onSection ?? (() => {});
  const group = groups.find((g) => g.id === groupId) ?? groups[0];
  const close = () => setSheet(null);
  useEffect(() => {
    if (alreadyIn) onInviteHandled();
  }, [alreadyIn, onInviteHandled]);
  const closeJoin = () => {
    setSheet(null);
    if (invite) onInviteHandled();
  };

  const addGroup = (g) => {
    onAddGroup(g);
    setGroupId(g.id);
    setSheet(g.me && g.outbox.length === 1 && !invite ? { type: 'invite' } : null);
  };

  const sheets = (
    <>
      {sheet?.type === 'create' && (
        <Sheet title="Crear grupo" onClose={close}>
          <CreateGroupForm onCreate={addGroup} />
        </Sheet>
      )}
      {sheet?.type === 'join' && (
        <Sheet title="Unirme a un grupo" onClose={closeJoin}>
          <JoinForm
            initialText={invite}
            groups={groups}
            onJoin={(g) => {
              onAddGroup(g);
              setGroupId(g.id);
              setSheet(null);
            }}
            onAlready={(id) => {
              setGroupId(id);
              closeJoin();
            }}
          />
        </Sheet>
      )}
    </>
  );

  if (!group) {
    return (
      <div className="stack">
        <section className="card group-intro">
          <span className="lock-icon">
            <Users size={30} />
          </span>
          <h3>Gastos en común, en tiempo real</h3>
          <p className="muted">
            Comparte gastos con tu familia (la casa, el súper, las cuentas): todos ven al instante lo que registra cada persona, quién pagó y
            cuánto se deben. Todo va <b>cifrado</b> con una clave que solo tienen ustedes; tus gastos personales no se comparten.
          </p>
          <div className="actions">
            <button type="button" className="btn primary grow" onClick={() => setSheet({ type: 'create' })}>
              <Plus size={18} /> Crear grupo
            </button>
            <button type="button" className="btn grow" onClick={() => setSheet({ type: 'join' })}>
              <UserPlus size={18} /> Unirme con invitación
            </button>
          </div>
        </section>
        {sheets}
      </div>
    );
  }

  const people = members(group);
  const net = balances(group);
  const suggestions = settlements(group);
  const items = activity(group);
  const info = syncInfo[group.id];
  const tol = balanceTolerance(group);
  const mine = net[group.me] ?? 0;
  const shown = (v) => (tol === EPSILON ? v : Math.round(v));
  // A este teléfono lo quitaron del grupo: puede ver lo anterior, pero no agregar cosas nuevas.
  const removed = group.entries[group.me]?.deleted === true;
  const save = (entry) => {
    if (removed) return setSheet(null);
    onSaveEntry(group.id, entry);
    // Al pasar la lista de compras a un gasto, se quitan de la lista los productos marcados (si siguen ahí).
    for (const itemId of sheet?.initial?.fromItems ?? []) {
      const item = group.entries[itemId];
      if (item && item.checked && !item.deleted) onSaveEntry(group.id, { ...item, deleted: true });
    }
    setSheet(null);
  };
  const removeMember = (p) => {
    if (window.confirm(`¿Quitar a ${p.name} del grupo? Sus gastos y pagos anteriores se mantienen; solo dejará de aparecer para nuevos gastos.`)) {
      onSaveEntry(group.id, { ...group.entries[p.id], deleted: true });
    }
  };
  const leave = () => {
    const owed = mine > tol ? ` Aún te deben ${formatMoney(shown(mine), currency)}.` : mine < -tol ? ` Aún debes ${formatMoney(shown(-mine), currency)}.` : '';
    if (window.confirm(`¿Salir de «${group.name}»?${owed} Se borrará de este teléfono y dejarás de aparecer en el grupo; las demás personas seguirán viendo los gastos anteriores.`)) {
      onLeave(group.id);
    }
  };
  const saveQuiet = (entry) => !removed && onSaveEntry(group.id, entry);
  const remove = (entry) => save({ ...entry, deleted: true });

  return (
    <div className="stack">
      {groups.length > 1 && (
        <div className="chips">
          {groups.map((g) => (
            <button type="button" key={g.id} className={`chip ${g.id === group.id ? 'on' : ''}`} aria-pressed={g.id === group.id} onClick={() => setGroupId(g.id)}>
              {g.name}
            </button>
          ))}
        </div>
      )}

      <section className="card">
        <div className="budget-head">
          <div>
            <h3 className="card-title">
              <Users size={18} /> {group.name}
            </h3>
            <p className={`sync-status ${info?.error ? 'warn-text' : ''}`}>{syncText(info)}</p>
          </div>
          <button type="button" className="icon-btn" onClick={onSyncNow} aria-label="Sincronizar ahora">
            <RefreshCw size={18} />
          </button>
        </div>
        <div className="members">
          {people.map((p) =>
            p.id === group.me ? (
              <span key={p.id} className="member">
                <i className="member-dot" style={{ background: p.color }} /> {p.name} (tú)
              </span>
            ) : removed ? (
              <span key={p.id} className="member">
                <i className="member-dot" style={{ background: p.color }} /> {p.name}
              </span>
            ) : (
              <button type="button" key={p.id} className="member" onClick={() => removeMember(p)} aria-label={`${p.name}: quitar del grupo`}>
                <i className="member-dot" style={{ background: p.color }} /> {p.name}
              </button>
            )
          )}
        </div>
        {removed ? (
          <div className="notice warn">
            <div className="notice-text">
              <b>Te quitaron de este grupo</b>
              <p>Tus gastos y pagos anteriores se mantienen, pero ya no puedes agregar nuevos. Puedes salir del grupo o pedir una invitación nueva.</p>
            </div>
            <button type="button" className="btn small danger" onClick={leave}>
              <LogOut size={16} /> Salir
            </button>
          </div>
        ) : (
          <div className="actions">
            <button type="button" className="btn grow" onClick={() => setSheet({ type: 'invite' })}>
              <UserPlus size={18} /> Invitar
            </button>
            <button type="button" className="btn primary grow" onClick={() => setSheet({ type: 'expense', initial: {} })}>
              <Plus size={18} /> Gasto en común
            </button>
          </div>
        )}
      </section>

      <div className="segmented" role="tablist" aria-label="Secciones del grupo">
        {[
          ['gastos', 'Gastos'],
          ['casa', 'Cuentas fijas'],
          ['lista', 'Compras'],
        ].map(([id, label]) => (
          <button type="button" key={id} role="tab" aria-selected={section === id} className={section === id ? 'on' : ''} aria-pressed={section === id} onClick={() => setSection(id)}>
            {label}
          </button>
        ))}
      </div>

      {section === 'casa' && (
        <BillsSection group={group} currency={currency} onAdd={() => setSheet({ type: 'bill', initial: {} })} onEdit={(b) => setSheet({ type: 'bill', initial: b })} onPay={(initial) => setSheet({ type: 'expense', initial })} />
      )}
      {section === 'lista' && (
        <ShoppingSection group={group} onSave={saveQuiet} onToast={onToast} onToExpense={(initial) => setSheet({ type: 'expense', initial })} />
      )}

      {section === 'gastos' && (
      <>
      <section className="card">
        <h3 className="card-title">
          <HandCoins size={18} /> Quién debe a quién
        </h3>
        {people.length < 2 && !suggestions.length ? (
          <p className="empty">Invita a tu familia para empezar a compartir gastos.</p>
        ) : (
          <>
            <p className={`group-balance ${mine < -tol ? 'expense' : mine > tol ? 'income' : ''}`}>
              {mine > tol ? `Te deben ${formatMoney(shown(mine), currency)}` : mine < -tol ? `Debes ${formatMoney(shown(-mine), currency)}` : 'Están a mano 🎉'}
            </p>
            {suggestions.map((s) => (
              <div key={`${s.from}-${s.to}`} className="settle-row">
                <span>
                  <b>{nameOf(group, s.from)}</b> <ArrowRight size={14} /> <b>{nameOf(group, s.to)}</b>: {formatMoney(s.amount, currency)}
                </span>
                <button type="button" className="btn small" onClick={() => setSheet({ type: 'settle', initial: { from: s.from, to: s.to, amount: s.amount } })}>
                  Registrar pago
                </button>
              </div>
            ))}
          </>
        )}
      </section>

      <section className="card">
        <h3 className="card-title">Movimientos del grupo</h3>
        {items.length ? (
          <div className="list">
            {items.map((e) =>
              e.kind === 'expense' ? (
                <button type="button" key={e.id} className="row" onClick={() => setSheet({ type: 'expense', initial: e })}>
                  <span className="row-icon expense" aria-hidden="true">
                    {categoryEmoji(e.category)}
                  </span>
                  <span className="row-main">
                    <span className="row-title">{e.description || e.category}</span>
                    <span className="row-sub">
                      <i className="member-dot" style={{ background: group.entries[e.paidBy]?.color }} /> {payerText(group, e.paidBy)} ·{' '}
                      {formatShort(e.date)}
                      {e.participants.length !== people.length && ` · entre ${e.participants.length}`}
                    </span>
                  </span>
                  <span className="amount">{formatMoney(e.amount, currency)}</span>
                </button>
              ) : (
                <button type="button" key={e.id} className="row" onClick={() => setSheet({ type: 'settle', initial: e })}>
                  <span className="row-icon income" aria-hidden="true">
                    🤝
                  </span>
                  <span className="row-main">
                    <span className="row-title">{settleText(group, e)}</span>
                    <span className="row-sub">{formatShort(e.date)}</span>
                  </span>
                  <span className="amount income">{formatMoney(e.amount, currency)}</span>
                </button>
              )
            )}
          </div>
        ) : (
          <p className="empty">Aún no hay gastos en común.</p>
        )}
      </section>
      </>
      )}

      <div className="actions group-footer">
        <button type="button" className="btn small ghost" onClick={() => setSheet({ type: 'profile' })}>
          <UserPen size={18} /> Mi perfil
        </button>
        <button type="button" className="btn small ghost" onClick={() => setSheet({ type: 'create' })}>
          <Plus size={18} /> Otro grupo
        </button>
        <button
          type="button"
          className="btn small ghost danger"
          onClick={leave}
        >
          <LogOut size={18} /> Salir
        </button>
      </div>

      {sheets}
      {sheet?.type === 'invite' && (
        <Sheet title={`Invitar a «${group.name}»`} onClose={close}>
          <InvitePanel group={group} />
        </Sheet>
      )}
      {sheet?.type === 'expense' && (
        <Sheet title={sheet.initial.id ? 'Editar gasto en común' : 'Gasto en común'} onClose={close}>
          <SharedExpenseForm group={group} initial={sheet.initial} categories={categories} currency={currency} onSave={save} onDelete={remove} />
        </Sheet>
      )}
      {sheet?.type === 'bill' && (
        <Sheet title={sheet.initial.id ? 'Editar cuenta de la casa' : 'Nueva cuenta de la casa'} onClose={close}>
          <BillForm group={group} initial={sheet.initial} categories={categories} currency={currency} onSave={save} onDelete={remove} />
        </Sheet>
      )}
      {sheet?.type === 'settle' && (
        <Sheet title="Registrar pago" onClose={close}>
          <SettleForm group={group} initial={sheet.initial} currency={currency} onSave={save} onDelete={remove} />
        </Sheet>
      )}
      {sheet?.type === 'profile' && (
        <Sheet title="Mi perfil en el grupo" onClose={close}>
          <ProfileForm group={group} onSave={save} />
        </Sheet>
      )}
    </div>
  );
}
