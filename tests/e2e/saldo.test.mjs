// Saldo real («Tienes hoy»): lo programado no cuenta antes de su fecha, en su fecha se pregunta si ocurrió,
// «Todavía no» lo deja fuera hasta mañana, «Cambiar fecha» lo mueve y el presupuesto separa lo programado.
import { chromium, devices } from 'playwright';
import { ARTIFACTS, BASE_URL, ok, skipRecovery } from './helpers.mjs';

const b = await chromium.launch({ channel: 'chromium' });
const ctx = await b.newContext({ ...devices['Pixel 7'] });
const p = await ctx.newPage();
await p.clock.setFixedTime(new Date('2026-10-04T12:00:00'));
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
p.on('dialog', (d) => d.accept());
await p.goto(BASE_URL, { waitUntil: 'networkidle' });
await p.getByPlaceholder(/Código \(mínimo/).fill('clave-segura-1');
await p.getByPlaceholder('Repite el código').fill('clave-segura-1');
await p.getByRole('button', { name: 'Crear código' }).click();
await skipRecovery(p);
await p.getByRole('heading', { name: 'Inicio' }).waitFor();

const dlg = () => p.getByRole('dialog');
const hero = () => p.locator('.hero').textContent();
const big = () => p.locator('.hero .big').textContent();
const add = async ({ type, amount, cat, desc, date }) => {
  await p.getByRole('button', { name: type === 'income' ? 'Ingreso' : 'Gasto' }).first().click();
  await dlg().getByPlaceholder('0').fill(amount);
  await dlg().getByRole('button', { name: new RegExp(cat) }).first().click();
  if (desc) await dlg().getByPlaceholder(/Supermercado/).fill(desc);
  if (date) await dlg().locator('input[type=date]').first().fill(date);
  await dlg().getByRole('button', { name: 'Guardar' }).click();
  await dlg().waitFor({ state: 'detached' });
};
// Otro día: se recarga la app (pide el código) con el reloj en esa fecha.
const goToDay = async (day) => {
  await p.clock.setFixedTime(new Date(`${day}T12:00:00`));
  await p.reload({ waitUntil: 'networkidle' });
  await p.getByPlaceholder('Código').fill('clave-segura-1');
  await p.getByRole('button', { name: 'Desbloquear' }).click();
  await p.getByRole('heading', { name: 'Inicio' }).waitFor();
};

// Hoy es 4: el 16 llegan 100.000 y el 25 hay que pagar 50.000.
await add({ type: 'income', amount: '100.000', cat: 'Sueldo', date: '2026-10-16' });
await add({ type: 'expense', amount: '50.000', cat: 'Vivienda', desc: 'Arriendo', date: '2026-10-25' });
let t = await hero();
ok((await big()) === '$0', 'sin saldo: el número grande ya no suma lo que aún no pasa ($0 hasta hoy)');
ok(/Balance de octubre hasta hoy/.test(t), 'sin saldo: dice «hasta hoy»');
ok(/Por recibir \+\$100\.000 · Por pagar −\$50\.000/.test(t) && /A fin de octubre: \$50\.000/.test(t), 'lo programado va aparte: por recibir, por pagar y fin de mes');

// Escribe cuánto tiene hoy.
await p.getByRole('button', { name: /¿Cuánto tienes hoy\?/ }).click();
await dlg().getByLabel('Saldo de hoy').fill('200.000');
await dlg().getByRole('button', { name: 'Guardar' }).click();
await dlg().waitFor({ state: 'detached' });
t = await hero();
ok(/Tienes hoy/.test(t) && (await big()) === '$200.000', 'Tienes hoy: $200.000');
ok(/Por recibir \+\$100\.000 · Por pagar −\$50\.000/.test(t), 'debajo: por recibir y por pagar');
ok(/A fin de octubre: \$250\.000/.test(t), 'a fin de mes: $250.000');
const budget = await p.locator('.budget').textContent();
ok(/\+ \$50\.000 programado/.test(budget) && /Programado/.test(budget), 'presupuesto: lo programado va separado');
ok((await p.locator('.budget-seg.planned').count()) === 1, 'presupuesto: tramo rayado de lo programado');
await p.locator('.hero').screenshot({ path: `${ARTIFACTS}/saldo-dia-4.png` });

// Un gasto de hoy resta al tiro.
await add({ type: 'expense', amount: '5.000', cat: 'Comida', desc: 'Almuerzo' });
ok((await big()) === '$195.000', 'gasto de hoy: $195.000');
ok((await p.locator('.confirm-card').count()) === 0, 'lo anotado hoy no se pregunta');

// Día 16: el sueldo cuenta y se pregunta.
await goToDay('2026-10-16');
ok((await big()) === '$295.000', 'día 16: el sueldo cuenta mientras no respondas ($295.000)');
const card = p.locator('.confirm-card');
ok(/¿Ya te llegó\?/.test(await card.textContent()), 'día 16: pregunta «¿Ya te llegó?»');
await p.screenshot({ path: `${ARTIFACTS}/saldo-pregunta.png` });
await card.getByRole('group', { name: 'Sueldo' }).getByRole('button', { name: 'Todavía no' }).click();
ok((await big()) === '$195.000', '«Todavía no»: deja de contar ($195.000)');
ok(/Por recibir \+\$100\.000/.test(await hero()), '«Todavía no»: vuelve a «Por recibir»');
ok((await card.count()) === 0, '«Todavía no»: no vuelve a preguntar hoy');
await p.getByRole('navigation').getByRole('button', { name: 'Historial' }).click();
ok((await p.locator('.row', { hasText: 'Sueldo' }).textContent()).includes('Aún no llega'), 'Historial: marca «Aún no llega»');
await p.getByRole('navigation').getByRole('button', { name: 'Inicio' }).click();

// Día 17: pregunta de nuevo; «Sí, llegó».
await goToDay('2026-10-17');
ok((await big()) === '$195.000', 'día 17: sigue sin contar hasta confirmar');
await card.getByRole('group', { name: 'Sueldo' }).getByRole('button', { name: 'Sí, llegó' }).click();
ok((await big()) === '$295.000', '«Sí, llegó»: $295.000');
await p.screenshot({ path: `${ARTIFACTS}/saldo-dia-17.png`, fullPage: true });
ok((await card.count()) === 0, 'sin más preguntas');

// Día 25: el arriendo se cobra más tarde → «Cambiar fecha».
await goToDay('2026-10-25');
ok((await big()) === '$245.000' && /¿Ya se cobró\?/.test(await card.textContent()), 'día 25: resta el arriendo y pregunta «¿Ya se cobró?»');
const rent = card.getByRole('group', { name: 'Arriendo' });
await rent.getByRole('button', { name: 'Cambiar fecha' }).click();
await rent.locator('input[type=date]').fill('2026-10-28');
await rent.getByRole('button', { name: 'Guardar fecha' }).click();
ok((await big()) === '$295.000' && /Por pagar −\$50\.000/.test(await hero()), 'cambiar fecha: vuelve a «Por pagar»');

// Día 28: al ajustar el saldo se pregunta si el arriendo ya está en ese monto.
await goToDay('2026-10-28');
await p.getByRole('button', { name: 'Ajustar saldo' }).click();
ok((await dlg().getByLabel('Saldo de hoy').inputValue()) === '245000', 'ajustar: parte del saldo calculado');
const q = dlg().getByRole('group', { name: 'Arriendo' });
await q.getByRole('button', { name: 'Todavía no' }).click();
await p.screenshot({ path: `${ARTIFACTS}/saldo-ajustar.png` });
await dlg().getByLabel('Saldo de hoy').fill('290.000');
await dlg().getByRole('button', { name: 'Guardar' }).click();
await dlg().waitFor({ state: 'detached' });
ok((await big()) === '$290.000' && /Por pagar −\$50\.000/.test(await hero()) && /A fin de octubre: \$240\.000/.test(await hero()), 'saldo ajustado; el arriendo sigue por pagar');
await goToDay('2026-10-29');
await card.getByRole('group', { name: 'Arriendo' }).getByRole('button', { name: 'Sí, se pagó' }).click();
ok((await big()) === '$240.000', 'día 29: «Sí, se pagó» → $240.000');

// Noviembre: el saldo sigue de un mes a otro.
await goToDay('2026-11-02');
ok((await big()) === '$240.000' && /Nada más programado para noviembre/.test(await hero()), 'el saldo pasa al mes siguiente');

ok(errs.length === 0, `sin errores en la página ${errs.join(' | ')}`);
await b.close();
