import { useCallback, useEffect, useRef, useState } from 'react';
import App from './App';
import { cryptoAvailable } from './lib/crypto';
import { uid } from './lib/format';
import { clearQuickFromUrl, inviteFromUrl, QUICK_TYPES, quickFromUrl, showQuickAccess } from './lib/quick';
import { DEFAULT_SETTINGS } from './lib/settings';
import { DEFAULT_PALETTE, PALETTES } from './lib/themes';
import { useLocalState } from './lib/storage';
import { readVault } from './lib/vault';
import { LockScreen, SetupScreen, UnsupportedScreen } from './views/LockScreens';

export default function Root() {
  // Los ajustes no son sensibles (tema, moneda…) y se necesitan antes de desbloquear.
  const [storedSettings, setSettings] = useLocalState('miGestor.settings', DEFAULT_SETTINGS);
  const settings = { ...DEFAULT_SETTINGS, ...storedSettings };
  const [hasVault, setHasVault] = useState(() => readVault() !== null);
  const [wiped, setWiped] = useState(false);
  // La sesión guarda la clave en memoria; al bloquear se descarta.
  const [session, setSession] = useState(null);
  // Petición de "gasto/ingreso rápido" (desde el icono o la notificación); se atiende tras desbloquear.
  const [quick, setQuick] = useState(() => {
    const type = quickFromUrl();
    return type ? { type, id: uid() } : null;
  });

  // Invitación a un grupo compartido: se atiende al desbloquear (o tras crear el código).
  const [invite, setInvite] = useState(inviteFromUrl);

  useEffect(() => {
    clearQuickFromUrl();
    const onMessage = (e) => {
      if (e.data?.type === 'quick' && QUICK_TYPES.includes(e.data.quick)) setQuick({ type: e.data.quick, id: uid() });
    };
    navigator.serviceWorker?.addEventListener('message', onMessage);
    return () => navigator.serviceWorker?.removeEventListener('message', onMessage);
  }, []);

  // La notificación de acceso rápido se vuelve a mostrar al abrir la app (por si se cerró o se reinició el teléfono).
  useEffect(() => {
    if (settings.quickAccess) navigator.serviceWorker?.ready.then(() => showQuickAccess()).catch(() => {});
  }, [settings.quickAccess]);

  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'auto') root.removeAttribute('data-theme');
    else root.dataset.theme = settings.theme;
    root.dataset.palette = PALETTES.some((p) => p.id === settings.palette) ? settings.palette : DEFAULT_PALETTE;
    root.dataset.text = settings.textSize;
    // La barra de estado del teléfono toma el color de fondo del tema.
    const paint = () => {
      const color = getComputedStyle(root).getPropertyValue('--bg').trim();
      document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => meta.setAttribute('content', color));
    };
    paint();
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', paint);
    return () => media.removeEventListener('change', paint);
  }, [settings.theme, settings.palette, settings.textSize]);

  // Difumina el contenido al salir de la app para que no aparezca en la vista de apps recientes.
  useEffect(() => {
    const onChange = () => document.documentElement.classList.toggle('privacy-blur', document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);

  // Versión nueva instalada: se aplica (recargando) al bloquear o al salir de la pantalla de bloqueo,
  // para no interrumpir a nadie. Con la app abierta se ofrece «Actualizar». Los datos ya están guardados.
  const [updateReady, setUpdateReady] = useState(false);
  const updateRef = useRef(false);
  useEffect(() => {
    const onUpdate = () => {
      updateRef.current = true;
      setUpdateReady(true);
    };
    window.addEventListener('mg-update', onUpdate);
    return () => window.removeEventListener('mg-update', onUpdate);
  }, []);
  useEffect(() => {
    if (!updateReady || session || !hasVault) return;
    const onHide = () => document.visibilityState === 'hidden' && window.location.reload();
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [updateReady, session, hasVault]);

  // quiet: se bloqueó porque se usó la app en otra ventana; ahí no se pide la huella sola (si no, las dos
  // ventanas se desbloquearían y bloquearían una a la otra).
  const [quietLock, setQuietLock] = useState(false);
  const reloadAfterLock = useRef(false);
  const lock = useCallback((options) => {
    setQuietLock(options?.quiet === true);
    setSession(null);
    setQuick(null);
    if (updateRef.current) reloadAfterLock.current = true;
  }, []);
  // La recarga va después de que la app se cerró (y de que se limpió el historial de paneles y pestañas).
  useEffect(() => {
    if (session || !reloadAfterLock.current) return;
    reloadAfterLock.current = false;
    setTimeout(() => window.location.reload(), 0);
  }, [session]);
  const inviteHandled = useCallback(() => setInvite(null), []);
  const ready = useCallback((s) => {
    setHasVault(true);
    setSession(s);
  }, []);

  if (!cryptoAvailable()) return <UnsupportedScreen />;
  if (!hasVault) return <SetupScreen onReady={ready} onExisting={() => setHasVault(true)} invite={invite} wiped={wiped} />;
  if (!session) {
    return (
      <LockScreen
        wipeOnFailures={settings.wipeOnFailures}
        quickType={quick?.type}
        invited={!!invite}
        autoBiometric={!quietLock}
        onUnlock={setSession}
        onWiped={() => {
          setWiped(true);
          setHasVault(false);
        }}
      />
    );
  }
  return (
    <App
      session={session}
      settings={settings}
      setSettings={setSettings}
      quick={quick}
      invite={invite}
      onInviteHandled={inviteHandled}
      onLock={lock}
      updateReady={updateReady}
    />
  );
}
