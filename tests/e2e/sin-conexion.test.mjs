// App instalada: abre sin conexión desde la primera visita, el botón «Atrás» cierra paneles en vez de salir,
// no se pierde lo escrito por un toque accidental y las versiones nuevas se ofrecen sin interrumpir.
import { chromium, devices } from 'playwright';
import { BASE_URL, ok, skipRecovery } from './helpers.mjs';

const CODE = 'clave-sin-conexion';
const b = await chromium.launch({ channel: 'chromium' });
const ctx = await b.newContext({ ...devices['Pixel 7'] });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
const dialogs = [];
let answer = true;
p.on('dialog', (d) => {
  dialogs.push(d.message());
  return answer ? d.accept() : d.dismiss();
});

await p.goto(BASE_URL, { waitUntil: 'networkidle' });
await p.getByPlaceholder(/Código \(mínimo/).fill(CODE);
await p.getByPlaceholder('Repite el código').fill(CODE);
await p.getByRole('button', { name: 'Crear código' }).click();
await skipRecovery(p);
await p.getByRole('heading', { name: 'Inicio' }).waitFor();
await p.evaluate(() => navigator.serviceWorker.ready);
const cached = await p.evaluate(async () => {
  const keys = await caches.keys();
  const cache = await caches.open(keys.find((k) => k.startsWith('mi-gestor-')));
  return (await cache.keys()).map((r) => new URL(r.url).pathname);
});
ok(cached.some((u) => /\/assets\/index-.*\.js$/.test(u)) && cached.some((u) => /\.css$/.test(u)), 'la app completa (JS y CSS) queda guardada en la primera visita');

// Sin conexión: recargar muestra la pantalla de bloqueo y se puede entrar.
await ctx.setOffline(true);
await p.reload();
await p.getByRole('button', { name: 'Desbloquear' }).waitFor({ timeout: 10000 });
ok(true, 'sin conexión, la app abre (pantalla de bloqueo)');
await p.getByPlaceholder('Código').fill(CODE);
await p.getByRole('button', { name: 'Desbloquear' }).click();
await p.getByRole('heading', { name: 'Inicio' }).waitFor();
ok(true, 'sin conexión, se desbloquea y se usa');
await ctx.setOffline(false);

// «Atrás» cierra el panel y no sale de la app.
await p.getByRole('button', { name: 'Gasto' }).first().click();
await p.getByRole('dialog').waitFor();
await p.goBack();
await p.waitForTimeout(300);
ok((await p.getByRole('dialog').count()) === 0 && (await p.getByRole('heading', { name: 'Inicio' }).isVisible()), '«Atrás» cierra el formulario y sigue en la app');

// «Atrás» desde otra pestaña vuelve a Inicio.
await p.getByRole('navigation').getByRole('button', { name: 'Calendario' }).click();
await p.goBack();
await p.getByRole('heading', { name: 'Inicio' }).waitFor({ timeout: 3000 });
ok(true, '«Atrás» desde Calendario vuelve a Inicio');

// Lo escrito no se pierde con un toque fuera ni con «Atrás» sin confirmar.
await p.getByRole('button', { name: 'Gasto' }).first().click();
await p.getByPlaceholder('0').fill('12.500');
answer = false;
await p.mouse.click(200, 30); // toque en la franja oscura de arriba
await p.waitForTimeout(200);
ok((await p.getByRole('dialog').count()) === 1 && dialogs.at(-1) === '¿Descartar lo que escribiste?', 'tocar fuera pregunta antes de descartar lo escrito');
await p.goBack();
await p.waitForTimeout(300);
ok((await p.getByRole('dialog').count()) === 1 && (await p.getByPlaceholder('0').inputValue()) === '12.500', '«Atrás» también pregunta, y si no se confirma el formulario sigue igual');
await p.goBack();
await p.waitForTimeout(300);
ok((await p.getByRole('dialog').count()) === 1, 'después de no descartar, «Atrás» sigue funcionando');
answer = true;
await p.getByLabel('Cerrar').click();
await p.waitForTimeout(200);
ok((await p.getByRole('dialog').count()) === 0, 'al confirmar se descarta');

// Guardar no pregunta nada.
const before = dialogs.length;
await p.getByRole('button', { name: 'Gasto' }).first().click();
await p.getByPlaceholder('0').fill('3.000');
await p.getByRole('dialog').getByRole('button', { name: /Transporte/ }).click();
await p.getByRole('button', { name: 'Guardar' }).click();
await p.waitForTimeout(200);
ok(dialogs.length === before && (await p.getByRole('dialog').count()) === 0, 'guardar cierra sin preguntar');

// Versión nueva: con la app abierta se ofrece; al bloquear se aplica.
await p.evaluate(() => window.dispatchEvent(new Event('mg-update')));
ok(await p.getByText('Hay una versión nueva de Mi Gestor').isVisible(), 'avisa que hay una versión nueva');
const reloaded = p.waitForEvent('load');
await p.getByLabel('Bloquear').click();
await reloaded;
await p.getByRole('button', { name: 'Desbloquear' }).waitFor();
ok(true, 'al bloquear se recarga con la versión nueva');

ok(errs.length === 0, 'sin errores ' + JSON.stringify(errs));
await b.close();
