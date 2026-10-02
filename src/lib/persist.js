// Pide al navegador que no borre los datos de la app para liberar espacio
// (en iPhone, Safari borra los datos de webs no instaladas tras 7 días sin uso).
export async function requestPersistence() {
  try {
    if (!navigator.storage?.persist) return 'unsupported';
    if (await navigator.storage.persisted()) return 'granted';
    return (await navigator.storage.persist()) ? 'granted' : 'denied';
  } catch {
    return 'unsupported';
  }
}

export const isInstalled = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

export const BACKUP_EVERY_DAYS = 30;
const DAY = 86400000;

// ¿Toca recordar la copia de seguridad?
export function backupDue(settings, now, hasData) {
  if (!hasData || now < (settings.backupSnoozeUntil ?? 0)) return null;
  if (!settings.lastBackupAt) return { never: true };
  const days = Math.floor((now - settings.lastBackupAt) / DAY);
  return days >= BACKUP_EVERY_DAYS ? { days } : null;
}

export const snoozeUntil = (now, days = 7) => now + days * DAY;
