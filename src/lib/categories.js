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
