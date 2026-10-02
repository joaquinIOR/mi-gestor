// Copia algo secreto (número de documento, código de recuperación) y lo borra del portapapeles después.
// En iPhone, la app solo puede borrar el portapapeles durante un toque: si no puede al vencer el plazo, lo
// borra en el siguiente toque dentro de la app. El historial del teclado de algunos teléfonos puede guardar una copia igual.
export async function copySecret(text, ms = 30000) {
  await navigator.clipboard.writeText(text);
  const at = Date.now();
  const onBack = () => {
    if (document.visibilityState === 'visible' && Date.now() - at >= ms) clear();
  };
  const cleanup = () => {
    clearTimeout(timer);
    window.removeEventListener('focus', onBack);
    document.removeEventListener('visibilitychange', onBack);
    window.removeEventListener('click', onBack, true);
  };
  // Las escuchas se quitan solo cuando el borrado funcionó (si falla, se reintenta en el próximo toque).
  function clear() {
    // Si pasó mucho tiempo, puede que ya hayas copiado otra cosa: no se toca.
    if (Date.now() - at >= 10 * 60 * 1000) return cleanup();
    navigator.clipboard.writeText('').then(cleanup, () => {});
  }
  const timer = setTimeout(() => {
    window.addEventListener('focus', onBack);
    document.addEventListener('visibilitychange', onBack);
    window.addEventListener('click', onBack, true);
    if (document.hasFocus()) clear();
  }, ms);
}
