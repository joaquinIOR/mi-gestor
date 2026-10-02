// Integrantes y cuentas exactas: dividir entre 3 sin «Te deben $1», volver a abrir la invitación sin duplicarse,
// retomar el perfil en un teléfono nuevo, salir del grupo, pagos de cuentas sin duplicar y conflictos sin señal.
import { chromium, devices } from 'playwright';
import { BASE_URL, ok, ORIGIN, skipRecovery } from './helpers.mjs';

const SERVER = 'http://localhost:54321';
const CODE = 'clave-segura-1';
const b = await chromium.launch({ channel: 'chromium' });
const errors = [];

async function phone() {
  const ctx = await b.newContext({ ...devices['Pixel 7'] });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: ORIGIN });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('dialog', (d) => d.accept());
  return p;
}
async function setup(p, url) {
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.getByPlaceholder(/Código \(mínimo/).fill(CODE);
  await p.getByPlaceholder('Repite el código').fill(CODE);
  await p.getByRole('button', { name: 'Crear código' }).click();
  await skipRecovery(p);
}
const nav = (p, name) => p.getByRole('navigation').getByRole('button', { name }).click();
const section = (p, name) => p.getByRole('tab', { name }).click();
const until = (locator, timeout = 15000) => locator.waitFor({ timeout }).then(() => true, () => false);
const balance = (p) => p.locator('.group-balance').textContent();

// Tomás crea el grupo; Valentina y Mamá se unen.
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
await until(A.locator('.member').nth(2));

// $10.000 entre 3 pagado por Tomás: Valentina y Mamá pagan lo sugerido y quedan todas a mano.
await A.getByRole('button', { name: 'Gasto en común' }).click();
const dlg = A.getByRole('dialog', { name: 'Gasto en común' });
await dlg.getByPlaceholder('0').fill('10.000');
ok(/\$3\.333 o \$3\.334 por persona/.test(await dlg.locator('.hint', { hasText: 'por persona' }).textContent()), 'la división muestra partes exactas en pesos ($3.333 o $3.334)');
await dlg.getByPlaceholder(/Supermercado/).fill('Supermercado');
await dlg.getByRole('button', { name: 'Guardar' }).click();
for (const p of [B, C]) {
  await until(p.locator('.group-balance', { hasText: 'Debes' }));
  ok(/Debes \$3\.333/.test(await balance(p)), 'cada una debe $3.333 (sin decimales)');
  await p.locator('.settle-row', { hasText: /^Tú/ }).getByRole('button', { name: 'Registrar pago' }).click();
  await p.getByRole('dialog', { name: 'Registrar pago' }).getByRole('button', { name: 'Guardar pago' }).click();
}
ok(await until(A.locator('.group-balance', { hasText: 'Están a mano' })), 'tras los pagos sugeridos, Tomás queda a mano (no «Te deben $1»)');
ok((await A.locator('.settle-row').count()) === 0, 'sin pagos pendientes sugeridos');

// Valentina vuelve a tocar el enlace de invitación: no se une otra vez.
await B.goto('about:blank');
await B.goto(link, { waitUntil: 'networkidle' });
await B.getByPlaceholder('Código').fill(CODE);
await B.getByRole('button', { name: 'Desbloquear' }).click();
await B.getByRole('heading', { name: 'Gastos en común' }).waitFor();
await B.waitForTimeout(800);
ok((await B.getByRole('dialog', { name: 'Unirme a un grupo' }).count()) === 0, 'reabrir la invitación no vuelve a pedir unirse');
ok((await B.locator('.member').count()) === 3 && (await B.locator('.member', { hasText: 'Valentina (tú)' }).count()) === 1, 'sigue siendo la misma Valentina (3 integrantes)');
await nav(B, 'Inicio');
await nav(B, 'Grupo');
ok((await B.getByRole('dialog').count()) === 0, 'la invitación no reaparece al volver a Grupo');

// Mamá cambia de teléfono: retoma su perfil en vez de duplicarse.
const D = await phone();
await setup(D, link);
const joinDlg = D.getByRole('dialog', { name: 'Unirme a un grupo' });
ok(await until(joinDlg.getByRole('button', { name: 'Mamá' })), 'el teléfono nuevo ofrece «¿Ya eras parte? Toca tu nombre»');
await joinDlg.getByRole('button', { name: 'Mamá' }).click();
ok(await until(D.locator('.member', { hasText: 'Mamá (tú)' })), 'Mamá retoma su perfil en el teléfono nuevo');
ok(await until(D.locator('.group-balance', { hasText: 'Están a mano' })), 'con sus saldos de siempre');
await A.waitForTimeout(5000);
ok((await A.locator('.member').count()) === 3, 'nadie queda duplicado (siguen 3 integrantes)');

// Cuenta de la casa: dos personas tocan «Pagar» a la vez (una sin señal) y queda un solo pago.
await section(A, 'Cuentas fijas');
await A.getByRole('button', { name: 'Agregar' }).click();
const bill = A.getByRole('dialog', { name: 'Nueva cuenta de la casa' });
await bill.getByPlaceholder(/Luz, agua/).fill('Internet');
await bill.getByPlaceholder('0').fill('30.000');
await bill.locator('input[inputmode=numeric]').fill(String(Math.min(28, new Date().getDate() + 2)));
ok(await bill.getByRole('button', { name: 'Todo el grupo' }).getAttribute('aria-pressed') === 'true', 'la cuenta es de todo el grupo por defecto');
await bill.getByRole('button', { name: 'Guardar' }).click();
await section(D, 'Cuentas fijas');
await until(D.locator('.bill-row', { hasText: 'Internet' }));
await A.context().setOffline(true);
await A.locator('.bill-row', { hasText: 'Internet' }).getByRole('button', { name: 'Pagar' }).click();
await A.getByRole('dialog', { name: 'Gasto en común' }).getByRole('button', { name: 'Guardar' }).click();
await A.waitForTimeout(300);
await D.locator('.bill-row', { hasText: 'Internet' }).getByRole('button', { name: 'Pagar' }).click();
const payDlg = D.getByRole('dialog', { name: 'Gasto en común' });
ok(/Pago de la cuenta de/.test(await payDlg.textContent()), 'el pago indica de qué mes es la cuenta');
await payDlg.getByRole('button', { name: 'Guardar' }).click();
await A.context().setOffline(false);
await A.waitForTimeout(9000);
await section(A, 'Gastos');
ok((await A.locator('.row', { hasText: 'Internet' }).count()) === 1, 'un solo pago de «Internet» aunque se tocó «Pagar» dos veces');
await section(A, 'Cuentas fijas');
ok(!/registrada/.test(await A.locator('.bill-row', { hasText: 'Internet' }).textContent()), 'sin aviso de pago repetido');

// Conflicto: Tomás edita sin señal; después Mamá edita lo mismo con señal. Gana el cambio más reciente.
await section(A, 'Gastos');
await section(D, 'Gastos');
await A.context().setOffline(true);
await A.locator('.row', { hasText: 'Supermercado' }).click();
await A.getByRole('dialog').getByPlaceholder('0').fill('12.000');
await A.getByRole('dialog').getByRole('button', { name: 'Guardar' }).click();
await D.waitForTimeout(1500);
await D.locator('.row', { hasText: 'Supermercado' }).click();
await D.getByRole('dialog').getByPlaceholder('0').fill('9.000');
await D.getByRole('dialog').getByRole('button', { name: 'Guardar' }).click();
await D.waitForTimeout(5000);
await A.context().setOffline(false);
await A.waitForTimeout(10000);
const amountOn = async (p) => p.locator('.row', { hasText: 'Supermercado' }).locator('.amount').textContent();
ok((await amountOn(A)) === '$9.000' && (await amountOn(D)) === '$9.000', `el cambio viejo hecho sin señal no pisa el más nuevo (${await amountOn(A)} / ${await amountOn(D)})`);

// Valentina sale del grupo: las demás dejan de verla para gastos nuevos.
await nav(B, 'Grupo');
await B.getByRole('button', { name: 'Salir' }).click();
ok(await until(B.getByText('Gastos en común, en tiempo real')), 'Valentina salió del grupo');
await A.waitForTimeout(6000);
ok((await A.locator('.member').count()) === 2, 'Tomás ya no la ve entre los integrantes');
await A.getByRole('button', { name: 'Gasto en común' }).click();
ok((await A.getByRole('dialog').locator('.chips .chip.on').filter({ hasText: /Valentina/ }).count()) === 0, 'los gastos nuevos ya no la incluyen');
await A.getByLabel('Cerrar').click();

ok(errors.length === 0, `sin errores ${JSON.stringify(errors)}`);
await b.close();
