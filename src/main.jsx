import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Root from './Root';
import './styles.css';
import './themes.css';

const container = document.getElementById('root');

// Protección contra clickjacking: la app no funciona si otra página la carga dentro de un marco.
if (window.top !== window.self) {
  container.textContent = 'Por seguridad, Mi Gestor no se puede abrir dentro de otra página.';
} else {
  createRoot(container).render(
    <StrictMode>
      <Root />
    </StrictMode>
  );
}

// Guarda el aviso de instalación para mostrar el botón "Instalar" en Ajustes.
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  window.deferredInstallPrompt = e;
});

// Service worker: la app queda guardada en el teléfono. Cuando se publica una versión nueva, se instala
// sola y la app avisa (evento "mg-update") para recargar.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    let controlled = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', async () => {
      const was = controlled;
      controlled = true;
      if (!was) return;
      // Solo si la versión nueva trae otro código (al pasar de un service worker antiguo puede ser la misma).
      const html = await caches
        .match(import.meta.env.BASE_URL)
        .then((r) => r?.text())
        .catch(() => '');
      if (!html || !html.includes(new URL(import.meta.url).pathname)) window.dispatchEvent(new Event('mg-update'));
    });
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .then((reg) => {
        // Android puede dejar la app abierta por días: busca versiones nuevas cada vez que vuelve a primer plano.
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') reg.update().catch(() => {});
        });
      })
      .catch(() => {});
  });
}
