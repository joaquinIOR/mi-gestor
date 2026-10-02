// Montos y fechas del día a día: «15,990», repetición anual, cambios «desde aquí» sin tocar el pasado,
// cuotas, «Ya lo pagué», búsqueda sin tildes, frecuentes y duplicar.
import { chromium, devices } from 'playwright';
import { BASE_URL, ok, ORIGIN, skipRecovery } from './helpers.mjs';

const b = await chromium.launch({ channel: 'chromium' });
const ctx = await b.newContext({ ...devices['Pixel 7'] });
await ctx.grantPermissions(['notifications'], { origin: ORIGIN });
const p = await ctx.newPage();
await p.clock.setFixedTime(new Date('2026-10-15T12:00:00'));
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
p.on('dialog', (d) => d.accept());
await p.goto(BASE_URL, { waitUntil: 'networkidle' });
await p.getByPlaceholder(/Código \(mínimo/).fill('clave-segura-1');
await p.getByPlaceholder('Repite el código').fill('clave-segura-1');
await p.getByRole('button', { name: 'Crear código' }).click();
await skipRecovery(p);
await p.getByRole('heading', { name: 'Inicio' }).waitFor();
const nav = (name) => p.getByRole('navigation').getByRole('button', { name }).click();
const dlg = () => p.getByRole('dialog');
const newExpense = async ({ amount, cat, desc, date, freq, until, reminder }) => {
  await p.getByRole('button', { name: 'Gasto' }).first().click();
  await dlg().getByPlaceholder('0').fill(amount);
  await dlg().getByRole('button', { name: new RegExp(cat) }).first().click();
  if (desc) await dlg().getByPlaceholder(/Supermercado/).fill(desc);
  if (date) await dlg().locator('input[type=date]').first().fill(date);
  if (freq) await dlg().getByRole('button', { name: freq, exact: true }).click();
  if (until) await dlg().locator('input[type=date]').nth(1).fill(until);
  if (reminder) await dlg().locator('select').first().selectOption(reminder);
};

// «15,990» se entiende como quince mil novecientos noventa y se muestra antes de guardar.
await newExpense({ amount: '15,990', cat: 'Comida', desc: 'Almuerzo' });
ok((await dlg().locator('.amount-hint').textContent()) === 'Se guardará: $15.990', 'vista previa: «15,990» → $15.990');
await dlg().getByRole('button', { name: 'Guardar' }).click();
await nav('Historial');
ok((await p.locator('.row', { hasText: 'Almuerzo' }).locator('.amount').textContent()) === '−$15.990', 'se guarda $15.990 (no $15,99)');

// Repetición anual (por ejemplo, el permiso de circulación).
await nav('Inicio');
await newExpense({ amount: '85.000', cat: 'Transporte', desc: 'Permiso de circulación', date: '2026-03-31', freq: 'Anual' });
await dlg().getByRole('button', { name: 'Guardar' }).click();
await nav('Historial');
await p.getByPlaceholder('Buscar en todos los meses').fill('permiso');
ok(/Anual/.test(await p.locator('.row').first().textContent()), 'repetición «Anual»');
await p.getByLabel('Borrar búsqueda').click();

// Arriendo mensual desde julio: subir el monto «desde octubre» no cambia julio–septiembre.
await nav('Inicio');
await newExpense({ amount: '300.000', cat: 'Vivienda', desc: 'Arriendo', date: '2026-07-05', freq: 'Mensual' });
await dlg().getByRole('button', { name: 'Guardar' }).click();
await nav('Historial');
await p.locator('.row', { hasText: 'Arriendo' }).click();
ok(await dlg().getByRole('button', { name: /Desde el 5 oct/ }).isVisible(), 'al editar una repetición ofrece «Desde el 5 oct» o «Todas»');
await dlg().getByPlaceholder('0').fill('320.000');
await dlg().getByRole('button', { name: 'Guardar' }).click();
const rentIn = async (label) => {
  while (!(await p.locator('.month-switcher span').textContent()).startsWith(label)) await p.getByLabel('Mes anterior').click();
  return p.locator('.row', { hasText: 'Arriendo' }).locator('.amount').textContent();
};
ok((await p.locator('.row', { hasText: 'Arriendo' }).locator('.amount').textContent()) === '−$320.000', 'octubre: $320.000');
ok((await rentIn('Septiembre')) === '−$300.000' && (await rentIn('Julio')) === '−$300.000', 'julio y septiembre siguen en $300.000');
await p.getByRole('button', { name: 'Hoy' }).click();
ok((await p.locator('.month-switcher span').textContent()).startsWith('Octubre'), 'el botón «Hoy» vuelve al mes actual');

// Borrar «desde aquí» deja de repetir sin borrar lo pasado.
await p.getByLabel('Mes siguiente').click();
await p.locator('.row', { hasText: 'Arriendo' }).click();
await dlg().getByRole('button', { name: 'Eliminar' }).click();
await dlg().getByRole('button', { name: /Dejar de repetir desde el 5 nov/ }).click();
ok((await p.locator('.row', { hasText: 'Arriendo' }).count()) === 0, 'noviembre ya no tiene arriendo');
await p.getByLabel('Mes anterior').click();
ok((await p.locator('.row', { hasText: 'Arriendo' }).count()) === 1, 'octubre lo conserva');

// Compra en cuotas: 90.000 en 3 cuotas.
await nav('Inicio');
await newExpense({ amount: '90.000', cat: 'Compras', desc: 'Zapatillas' });
await dlg().getByText('Compra en cuotas').click();
await dlg().getByLabel('¿Cuántas cuotas?').fill('3');
ok(/3 cuotas de \$30\.000/.test(await dlg().textContent()), 'muestra «3 cuotas de $30.000»');
await dlg().getByRole('button', { name: 'Guardar' }).click();
await nav('Historial');
const shoes = p.locator('.row', { hasText: 'Zapatillas' });
ok((await shoes.locator('.amount').textContent()) === '−$30.000' && /Pago 1 de 3/.test(await shoes.textContent()), 'octubre: «Pago 1 de 3» de $30.000');
await p.getByLabel('Mes siguiente').click();
await p.getByLabel('Mes siguiente').click();
await p.getByLabel('Mes siguiente').click();
ok((await p.locator('.row', { hasText: 'Zapatillas' }).count()) === 0, 'después de la 3.ª cuota no hay más');
await p.getByRole('button', { name: 'Hoy' }).click();

// «Ya lo pagué» saca el pago de los próximos recordatorios.
await nav('Inicio');
await newExpense({ amount: '25.000', cat: 'Servicios', desc: 'Internet', date: '2026-10-18', freq: 'Mensual', reminder: '3' });
await dlg().getByRole('button', { name: 'Guardar' }).click();
const upcoming = p.locator('.card', { hasText: 'Próximos recordatorios' });
ok(/Internet/.test(await upcoming.textContent()), 'Internet aparece en «Próximos recordatorios»');
await upcoming.getByRole('button', { name: 'Ya pagué Internet' }).click();
ok(!/Internet/.test(await upcoming.textContent()), '«Ya lo pagué» lo quita de los recordatorios');

// Búsqueda sin tildes, con el total de los últimos 12 meses.
await nav('Historial');
await p.getByPlaceholder('Buscar en todos los meses').fill('circulacion');
ok((await p.locator('.row').count()) === 1, 'búsqueda sin tildes: «circulacion» encuentra «circulación»');
await p.getByPlaceholder('Buscar en todos los meses').fill('almuerzo');
ok(/gastos \$15\.990 en los últimos 12 meses/.test(await p.locator('.hint').first().textContent()), 'la búsqueda suma lo encontrado');
await p.getByLabel('Borrar búsqueda').click();

// Frecuentes y duplicar.
await nav('Inicio');
await newExpense({ amount: '15.990', cat: 'Comida', desc: 'Almuerzo' });
await dlg().getByRole('button', { name: 'Guardar' }).click();
await p.getByRole('button', { name: 'Gasto' }).first().click();
const frequent = dlg().getByRole('button', { name: /Repetir Almuerzo/ });
ok(await frequent.isVisible(), 'ofrece «Almuerzo» entre los frecuentes');
await frequent.click();
ok((await dlg().getByPlaceholder('0').inputValue()) === '15990' && (await dlg().getByPlaceholder(/Supermercado/).inputValue()) === 'Almuerzo', 'un toque completa monto, tipo y descripción');
await dlg().getByRole('button', { name: 'Ayer' }).click();
await dlg().getByRole('button', { name: 'Guardar' }).click();
await nav('Historial');
ok(/Ayer/.test(await p.locator('.day-title').allTextContents().then((t) => t.join(' '))) || (await p.locator('.row', { hasText: 'Almuerzo' }).count()) === 3, '«Ayer» guarda con la fecha de ayer');
await p.locator('.row', { hasText: 'Almuerzo' }).first().click();
await dlg().getByRole('button', { name: 'Duplicar' }).click();
ok((await dlg().getAttribute('aria-label')) === 'Nuevo movimiento' && (await dlg().getByPlaceholder(/Supermercado/).inputValue()) === 'Almuerzo', '«Duplicar» abre uno nuevo con los mismos datos');
await dlg().getByRole('button', { name: 'Guardar' }).click();
ok((await p.locator('.row', { hasText: 'Almuerzo' }).count()) >= 3, 'el duplicado se guarda');

ok(errs.length === 0, 'sin errores ' + JSON.stringify(errs));
await b.close();
