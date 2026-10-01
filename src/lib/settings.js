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
  autoLock: 1,
  notificationDetails: false,
  wipeOnFailures: false,
  quickAccess: false,
};
