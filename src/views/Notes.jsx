import { useState } from 'react';
import { Pin, Plus, Search, StickyNote, Trash2 } from 'lucide-react';
import Sheet from '../components/Sheet';
import { uid } from '../lib/format';

const COLORS = ['plain', 'yellow', 'green', 'blue', 'pink', 'purple'];

export default function Notes({ notes, setNotes }) {
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(null);

  const q = query.trim().toLowerCase();
  const visible = notes
    .filter((n) => !q || `${n.title} ${n.body}`.toLowerCase().includes(q))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);

  const save = (note) => {
    setNotes((list) => (list.some((n) => n.id === note.id) ? list.map((n) => (n.id === note.id ? note : n)) : [note, ...list]));
    setEditing(null);
  };
  const remove = (id) => {
    if (!window.confirm('¿Eliminar esta nota?')) return;
    setNotes((list) => list.filter((n) => n.id !== id));
    setEditing(null);
  };

  return (
    <div className="stack">
      <div className="search">
        <Search size={18} />
        <input placeholder="Buscar en notas" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <button type="button" className="btn primary" onClick={() => setEditing({})}>
        <Plus size={18} /> Nueva nota
      </button>

      {visible.length ? (
        <div className="notes-grid">
          {visible.map((note) => (
            <button type="button" key={note.id} className={`note ${note.color}`} onClick={() => setEditing(note)}>
              {note.pinned && <Pin size={14} className="note-pin" />}
              {note.title && <strong>{note.title}</strong>}
              <span className="note-body">{note.body}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <StickyNote size={40} />
          <p>{q ? 'Ninguna nota coincide.' : 'Aún no tienes notas.'}</p>
        </div>
      )}

      {editing && (
        <Sheet title={editing.id ? 'Editar nota' : 'Nueva nota'} onClose={() => setEditing(null)}>
          <NoteForm initial={editing} onSave={save} onDelete={remove} />
        </Sheet>
      )}
    </div>
  );
}

function NoteForm({ initial, onSave, onDelete }) {
  const [title, setTitle] = useState(initial.title ?? '');
  const [body, setBody] = useState(initial.body ?? '');
  const [color, setColor] = useState(initial.color ?? 'plain');
  const [pinned, setPinned] = useState(initial.pinned ?? false);

  const submit = (e) => {
    e.preventDefault();
    if (!title.trim() && !body.trim()) return;
    onSave({ id: initial.id ?? uid(), title: title.trim(), body: body.trim(), color, pinned, updatedAt: Date.now() });
  };

  return (
    <form className="form" onSubmit={submit}>
      <input className="note-title-input" placeholder="Título" maxLength={60} value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea rows={6} placeholder="Escribe tu nota…" value={body} onChange={(e) => setBody(e.target.value)} autoFocus={!initial.id} />
      <div className="note-options">
        <div className="colors" role="radiogroup" aria-label="Color">
          {COLORS.map((c) => (
            <button
              type="button"
              key={c}
              role="radio"
              aria-checked={color === c}
              aria-label={c}
              className={`swatch ${c} ${color === c ? 'on' : ''}`}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
        <button type="button" className={`chip ${pinned ? 'on' : ''}`} onClick={() => setPinned((p) => !p)}>
          <Pin size={14} /> Fijar
        </button>
      </div>
      <div className="actions">
        {initial.id && (
          <button type="button" className="btn danger ghost" onClick={() => onDelete(initial.id)}>
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
