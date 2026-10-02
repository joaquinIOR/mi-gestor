import { useEffect, useRef } from 'react';

// Botón o gesto «Atrás» del teléfono: cierra lo último que se abrió (un panel, el visor de fotos, una
// pestaña) en vez de salir de la app. Cada cosa abierta deja una entrada en el historial del navegador.
// onClose puede devolver false para seguir abierto.
const stack = [];
let skip = 0;
let pendingBack = 0;
let listening = false;

function onPopState() {
  if (skip > 0) {
    skip -= 1;
    return;
  }
  const top = stack.pop();
  // Si la persona decide no cerrar (por ejemplo, para no perder lo escrito), se repone la entrada.
  if (top && top.close() === false) {
    stack.push(top);
    window.history.pushState({ miGestor: 'back' }, '');
  }
}

// Si se cierran varias cosas a la vez (por ejemplo, al bloquear), se retrocede una sola vez.
function goBack() {
  pendingBack += 1;
  if (pendingBack > 1) return;
  queueMicrotask(() => {
    const steps = pendingBack;
    pendingBack = 0;
    skip += 1;
    window.history.go(-steps);
  });
}

export function useBackClose(onClose, active = true) {
  const latest = useRef(onClose);
  useEffect(() => {
    latest.current = onClose;
  });
  useEffect(() => {
    if (!active) return undefined;
    if (!listening) {
      window.addEventListener('popstate', onPopState);
      listening = true;
    }
    const entry = { close: () => latest.current() };
    stack.push(entry);
    window.history.pushState({ miGestor: 'back' }, '');
    return () => {
      const i = stack.indexOf(entry);
      if (i === -1) return; // ya se cerró con «Atrás»
      stack.splice(i, 1);
      goBack();
    };
  }, [active]);
}
