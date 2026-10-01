import { useCallback, useEffect, useState } from 'react';
import { Camera, Copy, Eye, EyeOff, Pencil, Plus, Trash2, X } from 'lucide-react';
import BlobImage from '../components/BlobImage';
import Sheet from '../components/Sheet';
import { formatShort, todayKey } from '../lib/dates';
import { DOC_TYPES, docType, expiryStatus, maskNumber } from '../lib/documentTypes';
import { uid } from '../lib/format';
import { allowBackgroundBriefly } from '../lib/autolock';
import { compressImage } from '../lib/images';

const MAX_PHOTOS = 4;
const MAX_PHOTO_BYTES = 30 * 1024 * 1024;
const CLIPBOARD_CLEAR_MS = 30 * 1000;
const REVEAL_MS = 15 * 1000;

export default function Documents({ store }) {
  const [docs, setDocs] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [viewingId, setViewingId] = useState(null);
  const [fullscreen, setFullscreen] = useState(null);

  const reload = useCallback(
    () =>
      store
        .listDocuments()
        .then((list) => setDocs(list.sort((a, b) => a.name.localeCompare(b.name))))
        .catch(() => setError('No se pudieron abrir los documentos.')),
    [store]
  );
  useEffect(() => {
    reload();
  }, [reload]);

  const viewing = docs?.find((d) => d.id === viewingId);
  const today = todayKey();

  const save = async (doc) => {
    await store.saveDocument(doc);
    await reload();
    setEditing(null);
    setViewingId(doc.id);
  };

  const remove = async (id) => {
    if (!window.confirm('¿Eliminar este documento y sus fotos?')) return;
    await store.deleteDocument(id);
    setViewingId(null);
    reload();
  };

  return (
    <div className="stack">
      <p className="hint">
        🔒 Se guardan cifrados con tu código y solo en este teléfono; nunca se suben a internet. Haz una copia cifrada en Ajustes para no perderlos.
      </p>
      <button type="button" className="btn primary" onClick={() => setEditing({})}>
        <Plus size={18} /> Agregar documento
      </button>
      {error && <p className="error">{error}</p>}

      {docs?.length === 0 && (
        <div className="empty-state">
          <Camera size={40} />
          <p>Aún no tienes documentos.</p>
          <p className="muted">Fotografía tu carnet o tarjeta para tenerlos siempre a mano.</p>
        </div>
      )}

      <div className="doc-grid">
        {docs?.map((doc) => {
          const type = docType(doc.type);
          const status = expiryStatus(doc.expiry, today);
          return (
            <button type="button" key={doc.id} className="doc-card" onClick={() => setViewingId(doc.id)}>
              <span className="doc-thumb">
                {doc.images[0] ? <BlobImage blob={doc.images[0]} /> : <type.icon size={32} />}
              </span>
              <span className="doc-name">{doc.name}</span>
              <span className="row-sub">{doc.number ? maskNumber(doc.number) : type.label}</span>
              {status && <span className={`pill ${status.tone}`}>{status.label}</span>}
            </button>
          );
        })}
      </div>

      {viewing && !editing && (
        <Sheet title={viewing.name} onClose={() => setViewingId(null)}>
          <DocumentDetail
            doc={viewing}
            today={today}
            onImage={setFullscreen}
            onEdit={() => setEditing(viewing)}
            onDelete={() => remove(viewing.id)}
          />
        </Sheet>
      )}

      {editing && (
        <Sheet title={editing.id ? 'Editar documento' : 'Nuevo documento'} onClose={() => setEditing(null)}>
          <DocumentForm initial={editing} onSave={save} />
        </Sheet>
      )}

      {fullscreen && (
        <div className="viewer" onClick={() => setFullscreen(null)}>
          <button type="button" className="icon-btn viewer-close" aria-label="Cerrar">
            <X size={24} />
          </button>
          <BlobImage blob={fullscreen} alt="Documento" />
        </div>
      )}
    </div>
  );
}

function DocumentDetail({ doc, today, onImage, onEdit, onDelete }) {
  const [reveal, setReveal] = useState(false);
  const [copied, setCopied] = useState(false);
  const status = expiryStatus(doc.expiry, today);

  // El número vuelve a ocultarse solo, por si dejas el teléfono a la vista.
  useEffect(() => {
    if (!reveal) return;
    const timer = setTimeout(() => setReveal(false), REVEAL_MS);
    return () => clearTimeout(timer);
  }, [reveal]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(doc.number);
      setCopied(true);
      // Se limpia el portapapeles para que otras apps no puedan leer el número después.
      setTimeout(() => {
        setCopied(false);
        navigator.clipboard.writeText('').catch(() => {});
      }, CLIPBOARD_CLEAR_MS);
    } catch {
      setReveal(true);
    }
  };

  return (
    <div className="form">
      <p className="muted">{docType(doc.type).label}</p>
      {doc.images.length > 0 && (
        <div className="photos">
          {doc.images.map((blob, i) => (
            <button type="button" key={i} className="photo" onClick={() => onImage(blob)} aria-label="Ver en grande">
              <BlobImage blob={blob} alt={`${doc.name} ${i + 1}`} />
            </button>
          ))}
        </div>
      )}
      {doc.number && (
        <div className="field">
          <span>Número</span>
          <div className="secret">
            <code>{reveal ? doc.number : maskNumber(doc.number)}</code>
            <button type="button" className="icon-btn" onClick={() => setReveal((r) => !r)} aria-label={reveal ? 'Ocultar' : 'Mostrar'}>
              {reveal ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
            <button type="button" className="icon-btn" onClick={copy} aria-label="Copiar">
              <Copy size={18} />
            </button>
          </div>
          {copied && <span className="hint">Copiado. Se borrará del portapapeles en 30 s.</span>}
        </div>
      )}
      {doc.expiry && (
        <div className="field">
          <span>Vencimiento</span>
          <p>
            {formatShort(doc.expiry)} {doc.expiry.slice(0, 4)} {status && <span className={`pill ${status.tone}`}>{status.label}</span>}
          </p>
        </div>
      )}
      {doc.notes && (
        <div className="field">
          <span>Notas</span>
          <p className="pre">{doc.notes}</p>
        </div>
      )}
      <div className="actions">
        <button type="button" className="btn danger ghost" onClick={onDelete}>
          <Trash2 size={18} /> Eliminar
        </button>
        <button type="button" className="btn primary grow" onClick={onEdit}>
          <Pencil size={18} /> Editar
        </button>
      </div>
    </div>
  );
}

function DocumentForm({ initial, onSave }) {
  const [form, setForm] = useState({
    type: initial.type ?? 'carnet',
    name: initial.name ?? '',
    number: initial.number ?? '',
    expiry: initial.expiry ?? '',
    notes: initial.notes ?? '',
  });
  const [images, setImages] = useState(initial.images ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const addPhotos = async (e) => {
    const picked = [...e.target.files];
    e.target.value = '';
    const files = picked.filter((f) => f.type.startsWith('image/') && f.size <= MAX_PHOTO_BYTES).slice(0, MAX_PHOTOS - images.length);
    if (files.length < picked.length) setError('Algunos archivos se ignoraron: solo se aceptan fotos de hasta 30 MB.');
    if (!files.length) return;
    setBusy(true);
    try {
      const blobs = await Promise.all(files.map((f) => compressImage(f)));
      setImages((list) => [...list, ...blobs]);
    } catch {
      setError('No se pudo leer una de las fotos.');
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return setError('Ponle un nombre, por ejemplo “Carnet” o “Visa”.');
    setBusy(true);
    try {
      await onSave({
        id: initial.id ?? uid(),
        ...form,
        name: form.name.trim(),
        number: form.number.trim(),
        notes: form.notes.trim(),
        images,
        createdAt: initial.createdAt ?? Date.now(),
      });
    } catch {
      setError('No se pudo guardar. Puede que el teléfono no tenga espacio.');
      setBusy(false);
    }
  };

  return (
    <form className="form" onSubmit={submit}>
      <div className="field">
        <span>Tipo</span>
        <div className="chips">
          {DOC_TYPES.map((t) => (
            <button type="button" key={t.value} className={`chip ${form.type === t.value ? 'on' : ''}`} onClick={() => set({ type: t.value })}>
              <t.icon size={14} /> {t.label}
            </button>
          ))}
        </div>
      </div>
      <label className="field">
        <span>Nombre</span>
        <input placeholder="Ej.: Carnet de identidad, Visa del banco…" maxLength={40} value={form.name} onChange={(e) => set({ name: e.target.value })} />
      </label>
      <label className="field">
        <span>Número (opcional)</span>
        <input autoComplete="off" maxLength={40} value={form.number} onChange={(e) => set({ number: e.target.value })} />
      </label>
      <label className="field">
        <span>Vencimiento (opcional)</span>
        <input type="date" value={form.expiry} onChange={(e) => set({ expiry: e.target.value })} />
      </label>
      <div className="field">
        <span>Fotos ({images.length}/{MAX_PHOTOS})</span>
        <div className="photos">
          {images.map((blob, i) => (
            <div key={i} className="photo">
              <BlobImage blob={blob} alt={`Foto ${i + 1}`} />
              <button
                type="button"
                className="photo-remove"
                aria-label="Quitar foto"
                onClick={() => setImages((list) => list.filter((_, j) => j !== i))}
              >
                <X size={14} />
              </button>
            </div>
          ))}
          {images.length < MAX_PHOTOS && (
            <label className="photo photo-add">
              <Camera size={22} />
              <span>Agregar</span>
              <input type="file" accept="image/*" multiple hidden onClick={allowBackgroundBriefly} onChange={addPhotos} />
            </label>
          )}
        </div>
      </div>
      <label className="field">
        <span>Notas (opcional)</span>
        <textarea rows={3} maxLength={300} value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
      </label>
      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button type="submit" className="btn primary grow" disabled={busy}>
          {busy ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </form>
  );
}
