import { DOC_TYPES } from './documentTypes';
import { MAX_AMOUNT, uid } from './format';
import { MAX_REMINDER_DAYS } from './recurrence';

// Todo lo que entra desde un archivo externo pasa por aquí: se descartan tipos y valores inesperados.
export const NOTE_COLORS = ['plain', 'yellow', 'green', 'blue', 'pink', 'purple'];
const FREQUENCIES = ['once', 'daily', 'weekly', 'monthly', 'yearly'];
const IMAGE_DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/;
const MAX_ITEMS = 20000;
export const MAX_DOCUMENTS = 200;
export const NOTE_BODY_MAX = 20000;

const text = (value, max) => (typeof value === 'string' ? value.slice(0, max) : '');
const asList = (value) => (Array.isArray(value) ? value.slice(0, MAX_ITEMS) : []);
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

export function isDateKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

export function sanitizeMovements(list) {
  return asList(list).flatMap((m) => {
    if (!isObject(m)) return [];
    const amount = Number(m.amount);
    const category = text(m.category, 24).trim();
    if (!['income', 'expense'].includes(m.type) || !(amount > 0 && amount < MAX_AMOUNT) || !isDateKey(m.date) || !category) return [];
    const frequency = FREQUENCIES.includes(m.frequency) ? m.frequency : 'once';
    return [
      {
        id: uid(),
        type: m.type,
        amount: Math.round(amount * 100) / 100,
        category,
        description: text(m.description, 60).trim(),
        date: m.date,
        frequency,
        until: frequency !== 'once' && isDateKey(m.until) ? m.until : null,
        reminder: Number.isInteger(m.reminder) && m.reminder >= 0 && m.reminder <= MAX_REMINDER_DAYS ? m.reminder : null,
        card: text(m.card, 40).trim() || null,
        ...(asList(m.paidDates).some(isDateKey) ? { paidDates: asList(m.paidDates).filter(isDateKey).slice(-24) } : {}),
        ...(Number.isInteger(m.day) && m.day >= 1 && m.day <= 31 ? { day: m.day } : {}),
        createdAt: Number.isFinite(m.createdAt) ? m.createdAt : Date.now(),
      },
    ];
  });
}

export function sanitizeNotes(list) {
  return asList(list).flatMap((n) => {
    if (!isObject(n)) return [];
    const title = text(n.title, 60).trim();
    const body = text(n.body, NOTE_BODY_MAX).trim();
    if (!title && !body) return [];
    return [
      {
        id: uid(),
        title,
        body,
        color: NOTE_COLORS.includes(n.color) ? n.color : 'plain',
        pinned: n.pinned === true,
        updatedAt: Number.isFinite(n.updatedAt) ? n.updatedAt : Date.now(),
      },
    ];
  });
}

export function sanitizeCategories(value) {
  const clean = (list) => [...new Set(asList(list).map((c) => text(c, 24).trim()).filter(Boolean))].slice(0, 100);
  return isObject(value) ? { expense: clean(value.expense), income: clean(value.income) } : { expense: [], income: [] };
}

export function sanitizeDocumentMeta(doc) {
  if (!isObject(doc)) return null;
  const name = text(doc.name, 40).trim();
  if (!name) return null;
  return {
    type: DOC_TYPES.some((t) => t.value === doc.type) ? doc.type : 'otro',
    name,
    number: text(doc.number, 40).trim(),
    expiry: isDateKey(doc.expiry) ? doc.expiry : '',
    notes: text(doc.notes, 300).trim(),
    createdAt: Number.isFinite(doc.createdAt) ? doc.createdAt : Date.now(),
  };
}

// Convierte una imagen en base64 a Blob sin usar fetch (la política de seguridad lo bloquea).
export function imageFromDataUrl(value) {
  const match = typeof value === 'string' ? IMAGE_DATA_URL.exec(value) : null;
  if (!match) return null;
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: match[1] });
}

export function sanitizeDocuments(list) {
  return asList(list)
    .slice(0, MAX_DOCUMENTS)
    .flatMap((doc) => {
      const meta = sanitizeDocumentMeta(doc);
      if (!meta) return [];
      const images = asList(doc.images).slice(0, 4).map(imageFromDataUrl).filter(Boolean);
      return [{ id: uid(), ...meta, images }];
    });
}

export const sanitizeBudget = (value) => {
  const amount = Number(value);
  return amount > 0 && amount < MAX_AMOUNT ? Math.round(amount * 100) / 100 : null;
};
