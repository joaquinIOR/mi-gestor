// Lo que se anota seguido (mismo tipo y descripción en los últimos 4 meses), para registrarlo con un toque.
export function frequentTemplates(movements, type, today) {
  const since = new Date(today);
  since.setDate(since.getDate() - 120);
  const from = since.toISOString().slice(0, 10);
  const groups = new Map();
  for (const m of movements) {
    if (m.type !== type || m.frequency !== 'once' || !m.description || m.date < from) continue;
    const key = `${m.category}|${m.description.toLowerCase()}`;
    const g = groups.get(key) ?? { count: 0, last: '', category: m.category, description: m.description, amount: m.amount };
    g.count += 1;
    if (m.date >= g.last) Object.assign(g, { last: m.date, amount: m.amount, description: m.description });
    groups.set(key, g);
  }
  return [...groups.values()]
    .filter((g) => g.count >= 2)
    .sort((a, b) => b.count - a.count || b.last.localeCompare(a.last))
    .slice(0, 6);
}
