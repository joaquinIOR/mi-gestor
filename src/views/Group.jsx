import { useState } from 'react';
import { ArrowRight, Check, Copy, HandCoins, LogOut, Plus, RefreshCw, Share2, Trash2, UserPen, UserPlus, Users } from 'lucide-react';
import setupSql from '../../supabase/setup.sql?raw';
import QrCode from '../components/QrCode';
import Sheet from '../components/Sheet';
import { categoryEmoji, categoryList } from '../lib/categories';
import { formatShort, todayKey } from '../lib/dates';
import { formatMoney, parseAmount, uid } from '../lib/format';
import {
  activity,
  balances,
  createGroup,
  inviteLink,
  joinGroup,
  MEMBER_COLORS,
  members,
  newMember,
  normalizeServer,
  parseInvite,
  settlements,
  testServer,
} from '../lib/shared';

const nameOf = (group, id) => (id === group.me ? 'Tú' : group.entries[id]?.name ?? 'Alguien');
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
        <input placeholder="Ej.: Joaquín" maxLength={30} value={name} onChange={(e) => setName(e.target.value)} />
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
        <p className="hint">Una sola vez: prepara tu servidor gratuito (unos 5 minutos). Tu hermana no tendrá que hacerlo.</p>
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

function JoinForm({ initialText, takenColors, onJoin }) {
  const [text, setText] = useState(initialText ?? '');
  const [name, setName] = useState('');
  // Quien se une empieza con otro color que quien creó el grupo (se puede cambiar).
  const [color, setColor] = useState(MEMBER_COLORS.find((c, i) => i > 0 && !takenColors.includes(c)) ?? MEMBER_COLORS[1]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  let invite = null;
  try {
    invite = text ? parseInvite(text) : null;
  } catch {
    invite = null;
  }

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!invite) return setError('Pega el enlace de invitación que te enviaron.');
    if (!name.trim()) return setError('Escribe tu nombre.');
    setBusy(true);
    try {
      await testServer(invite.server);
      onJoin(joinGroup(invite, newMember(name, color)));
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

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
        Pídele a tu hermana que escanee este código con la cámara de su teléfono, o envíale el enlace. Al abrirlo, Mi Gestor le pedirá su
        nombre y quedará conectada.
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
        🔒 El enlace contiene la clave del grupo: quien lo tenga puede ver y agregar gastos en común. Envíalo solo a tu hermana, por un chat
        privado.
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
  const share = participants.length ? value / participants.length : 0;

  const submit = (e) => {
    e.preventDefault();
    if (!(value > 0)) return setError('Escribe un monto mayor que 0.');
    if (!participants.length) return setError('Elige entre quiénes se divide.');
    onSave({
      id: initial.id ?? uid(),
      kind: 'expense',
      amount: Math.round(value * 100) / 100,
      description: description.trim(),
      category,
      date,
      paidBy,
      participants,
      createdBy: initial.createdBy ?? group.me,
    });
  };

  return (
    <form className="form" onSubmit={submit}>
      <label className="field">
        <span>Monto</span>
        <div className="money-input">
          <span>{currency}</span>
          <input inputMode="decimal" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))} autoFocus={!initial.id} />
        </div>
      </label>
      <label className="field">
        <span>Descripción corta</span>
        <input placeholder="Ej.: Supermercado, cuenta de la luz…" maxLength={60} value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <div className="field">
        <span>Tipo</span>
        <div className="chips">
          {categoryList('expense', categories).map((c) => (
            <button type="button" key={c.name} className={`chip ${category === c.name ? 'on' : ''}`} onClick={() => setCategory(c.name)}>
              {c.emoji} {c.name}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span>¿Quién pagó?</span>
        <div className="segmented">
          {people.map((p) => (
            <button type="button" key={p.id} className={paidBy === p.id ? 'on' : ''} onClick={() => setPaidBy(p.id)}>
              {nameOf(group, p.id)}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span>Se divide en partes iguales entre</span>
        <div className="chips">
          {people.map((p) => (
            <button type="button" key={p.id} className={`chip ${participants.includes(p.id) ? 'on' : ''}`} onClick={() => toggle(p.id)}>
              <i className="member-dot" style={{ background: p.color }} /> {nameOf(group, p.id)}
            </button>
          ))}
        </div>
        {value > 0 && participants.length > 0 && <p className="hint">{formatMoney(Math.round(share), currency)} cada una</p>}
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
  const people = members(group);
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
            <button type="button" key={p.id} className={from === p.id ? 'on' : ''} onClick={() => setFrom(p.id)}>
              {nameOf(group, p.id)}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span>A</span>
        <div className="segmented">
          {people.map((p) => (
            <button type="button" key={p.id} className={to === p.id ? 'on' : ''} onClick={() => setTo(p.id)} disabled={p.id === from}>
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
        if (name.trim()) onSave({ ...me, name: name.trim().slice(0, 30), color });
      }}
    >
      <ProfileFields name={name} setName={setName} color={color} setColor={setColor} />
      <button type="submit" className="btn primary">
        Guardar perfil
      </button>
    </form>
  );
}

function syncText(info) {
  if (!info) return 'Conectando…';
  if (info.error) return `⚠️ ${info.error} Se reintentará solo.`;
  const seconds = Math.max(0, Math.round((Date.now() - info.at) / 1000));
  return seconds < 10 ? 'Sincronizado ahora' : `Sincronizado hace ${seconds} s`;
}

export default function Group({ groups, syncInfo, invite, currency, categories, onAddGroup, onSaveEntry, onLeave, onSyncNow }) {
  const [sheet, setSheet] = useState(() => (invite ? { type: 'join' } : null));
  const [groupId, setGroupId] = useState(groups[0]?.id ?? null);
  const group = groups.find((g) => g.id === groupId) ?? groups[0];
  const close = () => setSheet(null);

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
        <Sheet title="Unirme a un grupo" onClose={close}>
          <JoinForm initialText={invite} takenColors={[]} onJoin={(g) => { onAddGroup(g); setGroupId(g.id); setSheet(null); }} />
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
            Comparte gastos con tu hermana (la casa, el súper, las cuentas): cada una ve al instante lo que la otra registra, quién pagó y
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
  const mine = net[group.me] ?? 0;
  const save = (entry) => {
    onSaveEntry(group.id, entry);
    setSheet(null);
  };
  const remove = (entry) => save({ ...entry, deleted: true });

  return (
    <div className="stack">
      {groups.length > 1 && (
        <div className="chips">
          {groups.map((g) => (
            <button type="button" key={g.id} className={`chip ${g.id === group.id ? 'on' : ''}`} onClick={() => setGroupId(g.id)}>
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
          {people.map((p) => (
            <span key={p.id} className="member">
              <i className="member-dot" style={{ background: p.color }} /> {p.id === group.me ? `${p.name} (tú)` : p.name}
            </span>
          ))}
        </div>
        <div className="actions">
          <button type="button" className="btn grow" onClick={() => setSheet({ type: 'invite' })}>
            <UserPlus size={18} /> Invitar
          </button>
          <button type="button" className="btn primary grow" onClick={() => setSheet({ type: 'expense', initial: {} })}>
            <Plus size={18} /> Gasto en común
          </button>
        </div>
      </section>

      <section className="card">
        <h3 className="card-title">
          <HandCoins size={18} /> Cuentas
        </h3>
        {people.length < 2 ? (
          <p className="empty">Invita a tu hermana para empezar a compartir gastos.</p>
        ) : (
          <>
            <p className={`group-balance ${mine < -0.5 ? 'expense' : mine > 0.5 ? 'income' : ''}`}>
              {mine > 0.5 ? `Te deben ${formatMoney(Math.round(mine), currency)}` : mine < -0.5 ? `Debes ${formatMoney(Math.round(-mine), currency)}` : 'Están a mano 🎉'}
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
          onClick={() => window.confirm(`¿Salir de «${group.name}»? Se borrará de este teléfono; las demás seguirán viéndolo.`) && onLeave(group.id)}
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
