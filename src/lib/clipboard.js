// Copia algo secreto (número de documento, código de recuperación) y lo borra del portapapeles después.
// En iPhone, la app solo puede borrar el portapapeles mientras está en primer plano: si saliste, se borra
// al volver a tocarla. El historial del teclado de algunos teléfonos puede guardar una copia igual.
export async function copySecret(text, ms = 30000) {
  await navigator.clipboard.writeText(text);
  const at = Date.now();
  const cleanup = () => {
    clearTimeout(timer);
    window.removeEventListener('focus', onBack);
    document.removeEventListener('visibilitychange', onBack);
    window.removeEventListener('click', onBack, true);
  };
  const clear = () => {
    cleanup();
    // Si pasó mucho tiempo, puede que ya hayas copiado otra cosa: no se toca.
    if (Date.now() - at < 10 * 60 * 1000) navigator.clipboard.writeText('').catch(() => {});
  };
  const onBack = () => {
    if (document.visibilityState === 'visible' && Date.now() - at >= ms) clear();
  };
  const timer = setTimeout(() => {
    if (document.hasFocus()) return clear();
    window.addEventListener('focus', onBack);
    document.addEventListener('visibilitychange', onBack);
    window.addEventListener('click', onBack, true);
  }, ms);
}
