import { useRef, useState } from 'react';
import { Check, Copy, QrCode as QrIcon, Share2 } from 'lucide-react';
import QrCode from './QrCode';
import { appLink, SHARE_TEXT } from '../lib/share';

// «Compartir Mi Gestor»: para que otra persona la pruebe en su teléfono.
export default function ShareApp() {
  const link = appLink();
  const input = useRef(null);
  const [status, setStatus] = useState(null);
  const [showQr, setShowQr] = useState(false);
  const canShare = typeof navigator.share === 'function';

  // Si el teléfono no deja copiar, el enlace queda seleccionado para copiarlo a mano.
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setStatus('copied');
    } catch {
      input.current?.focus();
      input.current?.select();
      setStatus('manual');
    }
  };
  // Un segundo toque mientras el menú de compartir sigue abierto no hace nada.
  const sharing = useRef(false);
  const share = async () => {
    if (sharing.current) return;
    sharing.current = true;
    setStatus(null);
    try {
      await navigator.share({ title: 'Mi Gestor', text: SHARE_TEXT, url: link });
      setStatus('shared');
    } catch (err) {
      // Cerrar el menú de compartir no es un error; si compartir falla, se copia el enlace.
      if (err?.name !== 'AbortError') await copy();
    } finally {
      sharing.current = false;
    }
  };

  return (
    <div className="form share-app">
      <p className="hint">
        Envía el enlace por WhatsApp, correo o donde quieras. Quien lo abra instala Mi Gestor en su teléfono y empieza con la app vacía, con
        su propio código: <b>tus datos no se comparten</b>.
      </p>
      <input
        ref={input}
        className="share-link"
        readOnly
        value={link}
        aria-label="Enlace de Mi Gestor"
        onFocus={(e) => e.target.select()}
      />
      <div className="share-actions">
        {canShare && (
          <button type="button" className="btn primary" onClick={share}>
            <Share2 size={18} /> Compartir enlace
          </button>
        )}
        <button type="button" className={`btn${canShare ? '' : ' primary'}`} onClick={copy}>
          {status === 'copied' ? <Check size={18} /> : <Copy size={18} />} {status === 'copied' ? 'Copiado' : 'Copiar enlace'}
        </button>
        <button type="button" className="btn" onClick={() => setShowQr((v) => !v)} aria-expanded={showQr}>
          <QrIcon size={18} /> {showQr ? 'Ocultar código QR' : 'Mostrar código QR'}
        </button>
      </div>
      {status === 'manual' && (
        <p className="hint" role="status">
          No se pudo copiar solo: mantén presionado el enlace de arriba y elige «Copiar».
        </p>
      )}
      {status === 'shared' && (
        <p className="hint" role="status">
          ¡Listo! Gracias por recomendar Mi Gestor.
        </p>
      )}
      {showQr && (
        <div className="qr-wrap">
          <QrCode text={link} label="Código QR para abrir Mi Gestor" />
          <p className="hint">Si la otra persona está contigo, que lo escanee con la cámara de su teléfono.</p>
        </div>
      )}
      <p className="hint">En iPhone, que lo abra en Safari y use Compartir → «Añadir a pantalla de inicio».</p>
    </div>
  );
}
