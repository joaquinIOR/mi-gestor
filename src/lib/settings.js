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
};

export const TEXT_SIZES = [
  { value: 'normal', label: 'Normal' },
  { value: 'large', label: 'Grande' },
  { value: 'xlarge', label: 'Muy grande' },
];
