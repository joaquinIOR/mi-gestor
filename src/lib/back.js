import { useEffect, useRef } from 'react';

// Botón o gesto «Atrás» del teléfono: cierra lo último que se abrió (un panel, el visor de fotos, una
// pestaña) en vez de salir de la app. Cada cosa abierta deja una entrada en el historial del navegador.
// onClose puede devolver false para seguir abierto.
const stack = [];
let skip = 0;
let pendingBack = 0;
let listening = false;

// Si la página se recargó con entradas nuestras en el historial, se vuelven a la base (si no, «Atrás» no haría nada).
if (typeof window !== 'undefined' && window.history.state?.miGestor === 'back' && window.history.state.depth > 0) {
  window.addEventListener('popstate', onPopState);
  listening = true;
  skip += 1;
  window.history.go(-window.history.state.depth);
}

// Recarga la app (versión nueva) después de quitar del historial las entradas de paneles y pestañas.
export function reloadApp() {
  const steps = stack.length + pendingBack;
  stack.length = 0;
  pendingBack = 0;
  if (!steps) return window.location.reload();
  skip += 1;
  window.addEventListener('popstate', () => window.location.reload(), { once: true });
  window.history.go(-steps);
}

function onPopState() {
  if (skip > 0) {
    skip -= 1;
    return;
  }
  const top = stack.pop();
  // Si la persona decide no cerrar (por ejemplo, para no perder lo escrito), se repone la entrada.
  if (top && top.close() === false) {
    stack.push(top);
    window.history.pushState({ miGestor: 'back', depth: stack.length }, '');
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

// base: la entrada queda debajo de las demás (la de las pestañas: «Atrás» cierra primero los paneles).
export function useBackClose(onClose, active = true, { base = false } = {}) {
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
    if (base) stack.unshift(entry);
    else stack.push(entry);
    window.history.pushState({ miGestor: 'back', depth: stack.length }, '');
    return () => {
      const i = stack.indexOf(entry);
      if (i === -1) return; // ya se cerró con «Atrás»
      stack.splice(i, 1);
      goBack();
    };
  }, [active, base]);
}
