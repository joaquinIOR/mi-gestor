// Resumen de 6 meses, comparación por tipo, exportar a Excel y metas de ahorro.
import fs from 'node:fs';
import { chromium, devices } from 'playwright';
import { ARTIFACTS, BASE_URL, ok, skipRecovery } from './helpers.mjs';

const b = await chromium.launch({ channel: 'chromium' });
const ctx = await b.newContext({ ...devices['Pixel 7'], acceptDownloads: true });
const p = await ctx.newPage();
await p.clock.setFixedTime(new Date('2026-10-15T12:00:00'));
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
p.on('dialog', (d) => d.accept());

await p.goto(BASE_URL, { waitUntil: 'networkidle' });
await p.getByPlaceholder(/Código \(mínimo/).fill('clave-segura-1');
await p.getByPlaceholder('Repite el código').fill('clave-segura-1');
await p.getByRole('button', { name: 'Crear código' }).click();
await skipRecovery(p);
await p.getByRole('heading', { name: 'Inicio' }).waitFor();

async function add({ type = 'Gasto', amount, cat, desc = '', date, monthly = false }) {
  await p.getByRole('button', { name: type }).first().click();
  const d = p.getByRole('dialog');
  await d.getByPlaceholder('0').fill(amount);
  await d.getByRole('button', { name: new RegExp(cat) }).click();
  if (desc) await d.locator('input[maxlength="60"]').fill(desc);
  await d.locator('input[type=date]').first().fill(date);
  if (monthly) await d.getByRole('button', { name: 'Mensual' }).click();
  await d.getByRole('button', { name: 'Guardar' }).click();
  await p.getByRole('dialog').waitFor({ state: 'detached' });
}
await add({ type: 'Ingreso', amount: '400.000', cat: 'Sueldo', date: '2026-05-01', monthly: true });
await add({ amount: '120.000', cat: 'Vivienda', desc: 'Arriendo', date: '2026-05-05', monthly: true });
await add({ amount: '30.000', cat: 'Comida', desc: 'Súper', date: '2026-09-10' });
await add({ amount: '45.000', cat: 'Comida', desc: 'Súper', date: '2026-10-08' });
await add({ amount: '9.990', cat: 'Ocio', desc: '=HYPERLINK("http://malo")', date: '2026-10-09' });

await p.getByRole('navigation').getByRole('button', { name: 'Historial' }).click();
const summary = p.locator('.summary');
const months = await summary.locator('text.month').allTextContents();
ok(months.join(',') === 'May,Jun,Jul,Ago,Sep,Oct', `6 meses en el gráfico: ${months.join(', ')}`);
ok(/Octubre: ingresos \$400\.000 · gastos \$174\.990 · balance \$225\.010/.test(await summary.locator('.summary-detail').textContent()), 'detalle del mes actual');
await summary.locator('g').nth(4).locator('rect.hit').click();
ok(/Septiembre: ingresos \$400\.000 · gastos \$150\.000/.test(await summary.locator('.summary-detail').textContent()), 'tocar septiembre muestra sus números');
ok((await summary.locator('text.value').count()) === 2, 'montos visibles solo sobre el mes elegido');
await summary.getByText('Ver los números').click();
ok((await summary.locator('tbody tr').count()) === 6, 'tabla con los 6 meses');
await summary.getByRole('button', { name: /vs. mes anterior/ }).click();
const comida = await summary.locator('.compare li', { hasText: 'Comida' }).textContent();
ok(/\$45\.000/.test(comida) && /50 %/.test(comida), `Comida sube 50 % vs. septiembre: ${comida.trim()}`);
ok(/=/.test(await summary.locator('.compare li', { hasText: 'Vivienda' }).textContent()), 'Vivienda igual que el mes anterior («=»)');
ok(/nuevo/.test(await summary.locator('.compare li', { hasText: 'Ocio' }).textContent()), 'Ocio marcado como nuevo');
await p.waitForTimeout(300);
await summary.screenshot({ path: `${ARTIFACTS}/resumen-claro.png` });

const [download] = await Promise.all([p.waitForEvent('download'), summary.getByRole('button', { name: 'Exportar a Excel' }).click()]);
const csvPath = `${ARTIFACTS}/export.csv`;
await download.saveAs(csvPath);
const csv = fs.readFileSync(csvPath, 'utf8');
ok(csv.startsWith('﻿Fecha;Tipo;Categoría;Descripción;Monto'), 'CSV para Excel (BOM y «;»)');
ok(/2026-10-08;Gasto;Comida;Súper;-45000/.test(csv) && /2026-05-01;Ingreso;Sueldo;Sueldo;400000|2026-05-01;Ingreso;Sueldo;;400000/.test(csv), 'incluye gastos (negativos) e ingresos');
ok(csv.includes(`"'=HYPERLINK(""http://malo"")"`), 'neutraliza fórmulas peligrosas (inyección CSV)');
ok(csv.split('\r\n').filter(Boolean).length === 1 + 6 + 6 + 3, 'una fila por movimiento de los meses exportados');

// Metas de ahorro
await p.getByRole('navigation').getByRole('button', { name: 'Inicio' }).click();
await p.getByRole('button', { name: /Metas de ahorro/ }).click();
await p.getByRole('button', { name: 'Nueva meta' }).click();
const sheet = p.getByRole('dialog', { name: 'Metas de ahorro' });
await sheet.getByPlaceholder(/Vacaciones, notebook/).fill('Vacaciones');
await sheet.getByLabel('Ícono ✈️').click();
await sheet.getByPlaceholder('0').fill('500.000');
await sheet.locator('input[type=date]').fill('2027-01-15');
await sheet.getByRole('button', { name: 'Guardar' }).click();
ok(/ahorra unos \$166\.667 al mes/.test(await sheet.locator('.hint').first().textContent()), 'calcula cuánto ahorrar al mes para llegar a la fecha');
await sheet.getByRole('button', { name: 'Aportar' }).click();
await sheet.getByLabel('Monto a aportar').fill('150.000');
await sheet.getByRole('button', { name: 'Aportar' }).click();
ok(/\$150\.000 de \$500\.000 · 30 %/.test(await sheet.locator('.goal-hero').textContent()), 'aporte de 150.000 → 30 %');
await sheet.getByRole('button', { name: 'Retirar' }).click();
await sheet.getByLabel('Monto a retirar').fill('200.000');
await sheet.getByRole('button', { name: 'Retirar' }).last().click();
ok(await sheet.getByText(/Solo tienes \$150\.000/).isVisible(), 'no deja retirar más de lo ahorrado');
await sheet.getByLabel('Monto a retirar').fill('50.000');
await sheet.getByRole('button', { name: 'Retirar' }).last().click();
ok(/20 %/.test(await sheet.locator('.goal-hero').textContent()), 'retiro de 50.000 → 20 %');
ok((await sheet.locator('.goal-history li').count()) === 2, 'historial de aportes y retiros');
await sheet.screenshot({ path: `${ARTIFACTS}/meta.png` });
await sheet.getByRole('button', { name: 'Todas las metas' }).click();
ok(/20 %/.test(await sheet.locator('.goal-row').textContent()), 'la lista muestra el avance');
await p.getByLabel('Cerrar').click();
ok(/1 meta · \$100\.000 ahorrados/.test(await p.locator('.goals-card').textContent()), 'Inicio resume las metas');
ok(/\$174\.990/.test(await p.locator('.hero').textContent()), 'los aportes a metas no cuentan como gastos');

// persiste cifrado
await p.reload({ waitUntil: 'networkidle' });
await p.getByPlaceholder('Código').fill('clave-segura-1');
await p.getByRole('button', { name: 'Desbloquear' }).click();
await p.getByRole('heading', { name: 'Inicio' }).waitFor();
ok(/1 meta/.test(await p.locator('.goals-card').textContent()), 'la meta se guarda (cifrada) al reabrir');
ok(!/Vacaciones/.test(await p.evaluate(() => JSON.stringify(localStorage))), 'nada de la meta queda sin cifrar');

// modo oscuro del gráfico
await p.emulateMedia({ colorScheme: 'dark' });
await p.getByRole('navigation').getByRole('button', { name: 'Historial' }).click();
await p.waitForTimeout(300);
await p.locator('.summary').screenshot({ path: `${ARTIFACTS}/resumen-oscuro.png` });

ok(errors.length === 0, `sin errores ${JSON.stringify(errors)}`);
await b.close();
