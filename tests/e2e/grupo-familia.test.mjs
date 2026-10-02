// Tres teléfonos (Tomás, Valentina y mamá): lista de compras, cuentas de la casa y "mi parte" en el presupuesto.
import { chromium, devices } from 'playwright';
import { ARTIFACTS, BASE_URL, ok, ORIGIN, skipRecovery } from './helpers.mjs';

const SERVER = 'http://localhost:54321';
const b = await chromium.launch({ channel: 'chromium' });
const errors = [];

async function phone() {
  const ctx = await b.newContext({ ...devices['Pixel 7'] });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write', 'notifications'], { origin: ORIGIN });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('dialog', (d) => d.accept());
  return p;
}
async function setup(p, url) {
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.getByPlaceholder(/Código \(mínimo/).fill('clave-segura-1');
  await p.getByPlaceholder('Repite el código').fill('clave-segura-1');
  await p.getByRole('button', { name: 'Crear código' }).click();
  await skipRecovery(p);
}
const nav = (p, name) => p.getByRole('navigation').getByRole('button', { name }).click();
const section = (p, name) => p.getByRole('tab', { name }).click();

// Tomás crea el grupo
const A = await phone();
await setup(A, BASE_URL);
await nav(A, 'Grupo');
await A.getByRole('button', { name: 'Crear grupo' }).click();
await A.getByPlaceholder('https://xxxx.supabase.co').fill(SERVER);
await A.getByPlaceholder('sb_publishable_…').fill('sb_publishable_test');
await A.getByRole('button', { name: /Probar conexión/ }).click();
await A.getByPlaceholder('Ej.: Tomás').fill('Tomás');
await A.getByRole('dialog').getByRole('button', { name: 'Crear grupo' }).click();
await A.getByRole('button', { name: 'Copiar enlace' }).click();
const link = await A.evaluate(() => navigator.clipboard.readText());
await A.getByLabel('Cerrar').click();

// Valentina y mamá se unen
const join = async (name) => {
  const p = await phone();
  await setup(p, link);
  await p.getByPlaceholder('Ej.: Tomás').fill(name);
  await p.getByRole('button', { name: 'Unirme al grupo' }).click();
  await p.locator('.member', { hasText: 'Tomás' }).waitFor();
  return p;
};
const B = await join('Valentina');
const C = await join('Mamá');
await A.locator('.member').nth(2).waitFor({ timeout: 15000 });
ok((await A.locator('.member').count()) === 3, 'las tres están en el grupo');

// Lista de compras en tiempo real
await section(C, 'Compras');
for (const item of ['Pan', 'Leche', 'Detergente']) {
  await C.getByLabel('Producto').fill(item);
  await C.getByRole('button', { name: 'Agregar' }).click();
}
await A.locator('.toast', { hasText: 'a la lista de compras' }).waitFor({ timeout: 12000 });
ok(true, 'Tomás recibe aviso: «Mamá agregó … a la lista de compras»');
await section(A, 'Compras');
await A.locator('.shopping li').nth(2).waitFor({ timeout: 12000 });
ok((await A.locator('.shopping li').count()) === 3, 'Tomás ve los 3 productos de mamá');
await A.getByRole('checkbox', { name: /Pan/ }).click();
await A.getByRole('checkbox', { name: /Leche/ }).click();
await C.locator('.shopping li.done').nth(1).waitFor({ timeout: 12000 });
ok(true, 'mamá ve tachado lo que Tomás marcó en el súper');
await A.getByRole('button', { name: /Registrar compra de 2 productos/ }).click();
const dlg = A.getByRole('dialog', { name: 'Gasto en común' });
ok((await dlg.getByPlaceholder(/Supermercado, cuenta/).inputValue()) === 'Compras: Pan, Leche', 'la compra se prellena con los productos marcados');
await dlg.getByPlaceholder('0').fill('6.000');
await dlg.getByRole('button', { name: 'Guardar' }).click();
await C.locator('.shopping li').nth(1).waitFor({ state: 'detached', timeout: 12000 });
ok((await C.locator('.shopping li').count()) === 1, 'lo comprado sale de la lista en todos los teléfonos (queda «Detergente»)');

// Mi parte cuenta en mi presupuesto (6.000 / 3 = 2.000)
await nav(A, 'Inicio');
const hero = await A.locator('.hero').textContent();
ok(/\$2\.000/.test(hero) && /incluye \$2\.000 de tu parte en común/.test(hero), 'Inicio suma mi parte (2.000) a mis gastos y lo indica');
await nav(A, 'Historial');
ok(await A.locator('.row', { hasText: 'Tu parte · Casa' }).isVisible(), 'Historial muestra mi parte del gasto en común');
await A.getByLabel('Ajustes').click();
await A.getByText('Sumar mi parte de los gastos en común').click();
await A.getByLabel('Cerrar').click();
ok((await A.locator('.row', { hasText: 'Tu parte' }).count()) === 0, 'se puede desactivar');
await A.getByLabel('Ajustes').click();
await A.getByText('Sumar mi parte de los gastos en común').click();
await A.getByLabel('Cerrar').click();

// Cuentas de la casa
await nav(B, 'Grupo');
await section(B, 'Cuentas fijas');
await B.getByRole('button', { name: 'Agregar' }).click();
const bill = B.getByRole('dialog', { name: 'Nueva cuenta de la casa' });
await bill.getByPlaceholder(/Luz, agua/).fill('Luz');
await bill.getByPlaceholder('0').fill('36.000');
const day = String(new Date().getDate() + 2 > 28 ? 28 : new Date().getDate() + 2);
await bill.locator('input[inputmode=numeric]').fill(day);
await bill.getByRole('button', { name: 'Guardar' }).click();
await nav(A, 'Grupo');
await section(A, 'Cuentas fijas');
await A.locator('.bill-row', { hasText: 'Luz' }).waitFor({ timeout: 12000 });
ok(/Vence el/.test(await A.locator('.bill-row', { hasText: 'Luz' }).textContent()), 'Tomás ve la cuenta «Luz» y cuándo vence');
await nav(A, 'Inicio');
const upcoming = await A.locator('.card', { hasText: 'Próximos recordatorios' }).textContent();
ok(/Luz/.test(upcoming) && /Cuenta de Casa/.test(upcoming), 'la cuenta aparece en «Próximos recordatorios» (aviso 3 días antes)');
await A.waitForTimeout(500);
const notes = await A.evaluate(async () => (await (await navigator.serviceWorker.getRegistration()).getNotifications()).map((n) => n.title));
ok(notes.some((t) => /Cuenta de la casa/.test(t)), `notificación de la cuenta: ${JSON.stringify(notes)}`);
// Mamá la paga
await nav(C, 'Grupo');
await section(C, 'Cuentas fijas');
await C.locator('.bill-row', { hasText: 'Luz' }).getByRole('button', { name: 'Pagar' }).click();
await C.getByRole('dialog', { name: 'Gasto en común' }).getByRole('button', { name: 'Guardar' }).click();
await nav(A, 'Grupo');
await section(A, 'Cuentas fijas');
await A.locator('.bill-row', { hasText: 'Pagada por Mamá' }).waitFor({ timeout: 12000 });
ok(true, 'todas ven «Pagada por Mamá» y la próxima fecha');
ok(/Todas las cuentas de este mes están pagadas/.test(await A.locator('.card', { hasText: 'Cuentas de la casa' }).textContent()), 'resumen: todas pagadas');
await nav(A, 'Inicio');
ok(!/Luz/.test(await A.locator('.card', { hasText: 'Próximos recordatorios' }).textContent()), 'pagada: sale de «Próximos recordatorios»');
await nav(A, 'Grupo');
await section(A, 'Gastos');
ok(/Debes/.test(await A.locator('.group-balance').textContent()), 'el pago de la luz entra en las cuentas del grupo');
await A.screenshot({ path: `${ARTIFACTS}/familia-gastos.png`, fullPage: true });
await section(A, 'Cuentas fijas');
await A.screenshot({ path: `${ARTIFACTS}/familia-casa.png`, fullPage: true });
await section(C, 'Compras');
await C.screenshot({ path: `${ARTIFACTS}/familia-lista.png`, fullPage: true });

// Detalles: búsqueda, letra grande, tipos propios
await nav(A, 'Historial');
await A.getByPlaceholder('Buscar en todos los meses').fill('zzz');
ok(await A.getByText(/No hay movimientos con «zzz»/).isVisible(), 'búsqueda sin resultados');
await A.getByLabel('Borrar búsqueda').click();
await A.getByRole('button', { name: 'Gasto' }).first().click().catch(() => {});
await nav(A, 'Inicio');
await A.getByRole('button', { name: 'Gasto' }).first().click();
await A.getByPlaceholder('0').fill('4.500');
await A.getByRole('button', { name: /Nuevo tipo/ }).click();
await A.getByPlaceholder('Nombre del tipo').fill('Mascota');
await A.getByRole('button', { name: 'Añadir' }).click();
await A.getByPlaceholder(/Supermercado/).fill('Comida del gato');
await A.getByRole('button', { name: 'Guardar' }).click();
await nav(A, 'Historial');
await A.getByPlaceholder('Buscar en todos los meses').fill('gato');
ok((await A.locator('.row').count()) === 1, 'la búsqueda encuentra «Comida del gato»');
await A.getByLabel('Ajustes').click();
await A.getByLabel('Nombre del tipo Mascota').fill('Mascotas');
await A.getByLabel('Guardar Mascota').click();
await A.getByRole('button', { name: 'Muy grande' }).click();
ok((await A.evaluate(() => getComputedStyle(document.documentElement).fontSize)) === '20px', 'letra «Muy grande» (20 px)');
await A.getByLabel('Cerrar').click();
ok(/Mascotas/.test(await A.locator('.row').first().textContent()), 'renombrar el tipo actualiza los movimientos');
await A.getByLabel('Ajustes').click();
await A.getByLabel('Borrar Mascotas').click();
await A.getByRole('button', { name: 'Normal' }).click();
await A.getByLabel('Cerrar').click();
await A.getByPlaceholder('Buscar en todos los meses').fill('gato');
ok(/Otros/.test(await A.locator('.row').first().textContent()), 'borrar el tipo pasa sus movimientos a «Otros»');

ok(errors.length === 0, `sin errores ${JSON.stringify(errors)}`);
await b.close();
