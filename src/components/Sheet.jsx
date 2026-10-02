import { useCallback, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useBackClose } from '../lib/back';

const DISCARD = '¿Descartar lo que escribiste?';

// Panel que sube desde abajo, cómodo de usar con el pulgar.
// Si se escribió algo, tocar fuera, la X, Escape o «Atrás» preguntan antes de descartarlo
// (guard={false} para paneles cuyos cambios se aplican al instante, como Ajustes).
export default function Sheet({ title, onClose, children, guard = true }) {
  const backdrop = useRef(null);
  const panel = useRef(null);
  const dirty = useRef(false);

  const requestClose = useCallback(() => {
    if (guard && dirty.current && !window.confirm(DISCARD)) return false;
    return onClose() !== false;
  }, [guard, onClose]);

  // «Atrás» cierra el panel (o lo deja abierto si la persona decide no descartar).
  useBackClose(requestClose);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && requestClose();
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [requestClose]);

  // Foco: entra al panel al abrir, vuelve al botón que lo abrió al cerrar, y el resto de la app queda inerte.
  useEffect(() => {
    const opener = document.activeElement;
    if (!panel.current.contains(document.activeElement)) panel.current.focus({ preventScroll: true });
    const inerted = [];
    let node = backdrop.current;
    while (node?.parentElement && node.id !== 'root') {
      for (const sibling of node.parentElement.children) {
        // El aviso flotante («Deshacer») sigue tocable.
        if (sibling !== node && !sibling.inert && sibling.tagName !== 'SCRIPT' && !sibling.classList.contains('toast')) {
          sibling.inert = true;
          inerted.push(sibling);
        }
      }
      node = node.parentElement;
    }
    return () => {
      inerted.forEach((n) => {
        n.inert = false;
      });
      if (opener?.isConnected && typeof opener.focus === 'function') opener.focus({ preventScroll: true });
    };
  }, []);

  return (
    <div
      ref={backdrop}
      className="sheet-backdrop"
      onClick={requestClose}
    >
      <div
        ref={panel}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onInput={() => {
          dirty.current = true;
        }}
      >
        <header className="sheet-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={requestClose} aria-label="Cerrar">
            <X size={20} />
          </button>
        </header>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}
