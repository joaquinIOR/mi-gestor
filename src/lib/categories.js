export const PRESET_CATEGORIES = {
  expense: [
    { name: 'Comida', emoji: '🍽️' },
    { name: 'Transporte', emoji: '🚌' },
    { name: 'Vivienda', emoji: '🏠' },
    { name: 'Servicios', emoji: '💡' },
    { name: 'Salud', emoji: '💊' },
    { name: 'Compras', emoji: '🛍️' },
    { name: 'Ocio', emoji: '🎬' },
    { name: 'Educación', emoji: '📚' },
    { name: 'Deudas', emoji: '💳' },
    { name: 'Otros', emoji: '📦' },
  ],
  income: [
    { name: 'Sueldo', emoji: '💼' },
    { name: 'Extra', emoji: '💰' },
    { name: 'Ventas', emoji: '🏷️' },
    { name: 'Regalo', emoji: '🎁' },
    { name: 'Otros ingresos', emoji: '➕' },
  ],
};

const CUSTOM_EMOJI = '🔖';

export function categoryList(type, custom) {
  return [...PRESET_CATEGORIES[type], ...(custom?.[type] ?? []).map((name) => ({ name, emoji: CUSTOM_EMOJI }))];
}

export function categoryEmoji(name) {
  const preset = [...PRESET_CATEGORIES.expense, ...PRESET_CATEGORIES.income].find((c) => c.name === name);
  return preset ? preset.emoji : CUSTOM_EMOJI;
}

// Color fijo por tipo de gasto (paleta validada para daltonismo, en orden). Un tipo conserva
// siempre su color; los que no tienen hueco propio (Educación, Otros y los personalizados) van en gris "Otros".
const COLOR_SLOTS = { Vivienda: 1, Comida: 2, Transporte: 3, Servicios: 4, Ocio: 5, Salud: 6, Compras: 7, Deudas: 8 };

export const categorySlot = (name) => COLOR_SLOTS[name] ?? 0;
export const categoryColor = (name) => (categorySlot(name) ? `var(--cat-${categorySlot(name)})` : 'var(--cat-other)');
