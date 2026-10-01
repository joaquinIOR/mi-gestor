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

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
  });
}
