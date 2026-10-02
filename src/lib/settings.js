export const CURRENCIES = ['$', '€', 'S/', 'Bs', 'Q', '₡', 'L'];

export const AUTO_LOCK_OPTIONS = [
  { value: 0, label: 'Al salir' },
  { value: 1, label: '1 min' },
  { value: 5, label: '5 min' },
  { value: 15, label: '15 min' },
];

export const DEFAULT_SETTINGS = {
  currency: '$',
  theme: 'auto',
  palette: 'menta',
  textSize: 'normal',
  countShared: true,
  pushEnabled: false,
  pushEndpoint: null,
  deviceTag: null,
  autoLock: 1,
  notificationDetails: false,
  wipeOnFailures: false,
  quickAccess: false,
  budgetAlert: true,
  budgetWarnAt: 0,
  lastBackupAt: null,
  backupSnoozeUntil: 0,
  installSnoozeUntil: 0,
};

export const TEXT_SIZES = [
  { value: 'normal', label: 'Normal' },
  { value: 'large', label: 'Grande' },
  { value: 'xlarge', label: 'Muy grande' },
];

// Preferencias que viajan en la copia de seguridad (nunca las de avisos, bloqueo por intentos ni acceso rápido,
// que dependen de cada teléfono).
const PORTABLE = {
  currency: (v) => CURRENCIES.includes(v),
  theme: (v) => ['auto', 'light', 'dark'].includes(v),
  palette: (v) => typeof v === 'string' && /^[a-z]{2,20}$/.test(v),
  textSize: (v) => TEXT_SIZES.some((t) => t.value === v),
  autoLock: (v) => AUTO_LOCK_OPTIONS.some((o) => o.value === v),
  countShared: (v) => typeof v === 'boolean',
  budgetAlert: (v) => typeof v === 'boolean',
  budgetWarnAt: (v) => [0, 80, 90].includes(v),
  notificationDetails: (v) => typeof v === 'boolean',
};

export const portableSettings = (settings) => Object.fromEntries(Object.keys(PORTABLE).map((k) => [k, settings[k]]));

export function sanitizeSettings(value) {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(Object.entries(PORTABLE).filter(([k, ok]) => ok(value[k])).map(([k]) => [k, value[k]]));
}
