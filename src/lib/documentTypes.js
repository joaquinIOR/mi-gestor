import { BookUser, Car, CreditCard, FileText, IdCard, ShieldCheck } from 'lucide-react';

export const DOC_TYPES = [
  { value: 'carnet', label: 'Carnet / DNI', icon: IdCard },
  { value: 'tarjeta', label: 'Tarjeta', icon: CreditCard },
  { value: 'licencia', label: 'Licencia', icon: Car },
  { value: 'pasaporte', label: 'Pasaporte', icon: BookUser },
  { value: 'seguro', label: 'Seguro', icon: ShieldCheck },
  { value: 'otro', label: 'Otro', icon: FileText },
];

export const docType = (value) => DOC_TYPES.find((t) => t.value === value) ?? DOC_TYPES[DOC_TYPES.length - 1];

// Muestra solo los últimos 4 caracteres del número.
export const maskNumber = (number) => (number.length > 4 ? `•••• ${number.slice(-4)}` : number);

export function expiryStatus(expiry, today) {
  if (!expiry) return null;
  if (expiry < today) return { label: 'Vencido', tone: 'expense' };
  const days = Math.round((new Date(expiry) - new Date(today)) / 86400000);
  return days <= 30 ? { label: `Vence en ${days} días`, tone: 'warn' } : null;
}
