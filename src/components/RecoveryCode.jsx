import { useEffect, useState } from 'react';
import { Check, Copy, KeyRound } from 'lucide-react';
import { holdAutoLock } from '../lib/autolock';
import { copySecret } from '../lib/clipboard';

// Muestra el código de recuperación una sola vez y pide confirmar que se guardó.
export default function RecoveryCode({ code, onDone }) {
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  // Mientras se anota el código, la app no se bloquea sola (si no, el código nuevo no quedaría activo).
  useEffect(() => {
    holdAutoLock(true);
    return () => holdAutoLock(false);
  }, []);

  const copy = async () => {
    try {
      await copySecret(code, 2 * 60 * 1000);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="form">
      <span className="lock-icon">
        <KeyRound size={30} />
      </span>
      <h2 className="recovery-title">Tu código de recuperación</h2>
      <p className="muted">
        Si algún día olvidas tu código, con este podrás entrar y crear uno nuevo <b>sin perder nada</b>. Anótalo en papel o guárdalo donde
        guardas tus contraseñas. <b>No lo volverás a ver.</b>
      </p>
      <div className="recovery-code" role="group" aria-label={`Código de recuperación: ${code}`} data-code={code}>
        {code.split('-').map((block, i) => (
          <code key={i}>{block}</code>
        ))}
      </div>
      <button type="button" className="btn" onClick={copy}>
        {copied ? <Check size={18} /> : <Copy size={18} />} {copied ? 'Copiado (se borrará en 2 min)' : 'Copiar'}
      </button>
      <label className="toggle">
        <span className="row-main">
          <span className="row-title">Ya lo guardé en un lugar seguro</span>
          <span className="hint">Quien tenga este código y tu teléfono podría entrar: no lo compartas.</span>
        </span>
        <input type="checkbox" role="switch" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
      </label>
      <button type="button" className="btn primary" disabled={!saved} onClick={onDone}>
        Continuar
      </button>
      {!saved && <p className="hint">Activa «Ya lo guardé en un lugar seguro» para continuar.</p>}
    </div>
  );
}
