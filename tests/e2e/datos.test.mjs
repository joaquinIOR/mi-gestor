// Datos: «Borrar todos los datos» limpia también Documentos, el vencimiento de un documento llega a Inicio,
// la copia guarda las preferencias y su fecha, y dos ventanas abiertas no se pisan.
import path from 'node:path';
import { chromium, devices } from 'playwright';
import { ARTIFACTS, BASE_URL, ok, skipRecovery } from './helpers.mjs';

const CODE = 'clave-de-datos-1';
const b = await chromium.launch({ channel: 'chromium' });
const ctx = await b.newContext({ ...devices['Pixel 7'], acceptDownloads: true });
const p = await ctx.newPage();
await p.clock.setFixedTime(new Date('2026-10-15T12:00:00'));
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
p.on('dialog', (d) => d.accept());
await p.goto(BASE_URL, { waitUntil: 'networkidle' });
await p.getByPlaceholder(/Código \(mínimo/).fill(CODE);
await p.getByPlaceholder('Repite el código').fill(CODE);
await p.getByRole('button', { name: 'Crear código' }).click();
await skipRecovery(p);
await p.getByRole('heading', { name: 'Inicio' }).waitFor();
const nav = (page, name) => page.getByRole('navigation').getByRole('button', { name }).click();

// Un documento que vence pronto aparece en Inicio.
await nav(p, 'Docs');
await p.getByRole('button', { name: 'Agregar documento' }).click();
const doc = p.getByRole('dialog');
await doc.getByPlaceholder(/Carnet de identidad/).fill('Licencia de conducir');
await doc.locator('input[type=date]').fill('2026-11-01');
const [chooser] = await Promise.all([p.waitForEvent('filechooser'), doc.locator('.photo-add').click()]);
await chooser.setFiles(path.resolve('public/icons/icon-192.png'));
await doc.locator('.photo img').first().waitFor();
await doc.getByRole('button', { name: 'Guardar' }).click();
await p.getByLabel('Cerrar').click();
ok(/Vence en 17 días/.test(await p.locator('.doc-card').textContent()), 'Docs: «Vence en 17 días»');
await nav(p, 'Inicio');
const upcoming = p.locator('.card', { hasText: 'Próximos recordatorios' });
ok(/Licencia de conducir/.test(await upcoming.textContent()) && /Documento/.test(await upcoming.textContent()), 'el vencimiento del documento aparece en «Próximos recordatorios»');
ok(await p.locator('.notice', { hasText: 'Haz una copia de seguridad' }).isVisible(), 'con un documento guardado, recuerda hacer una copia');

// La copia guarda las preferencias (tema y letra) y su fecha.
await p.getByLabel('Ajustes').click();
await p.getByRole('radio', { name: /Lavanda/ }).click();
await p.getByRole('button', { name: 'Grande', exact: true }).click();
await p.getByRole('button', { name: 'Exportar' }).click();
await p.getByPlaceholder(/Contraseña de la copia/).fill('copia-123456');
await p.getByPlaceholder('Repite la contraseña').fill('copia-123456');
const [dl] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Descargar copia cifrada' }).click()]);
await dl.saveAs(`${ARTIFACTS}/datos-copia.json`);
await p.getByRole('button', { name: 'Listo, la guardé' }).click();

// Borrar todo: Documentos también queda vacío (sin mostrar fotos viejas).
await p.getByRole('button', { name: 'Borrar todos los datos' }).click();
await p.getByLabel('Cerrar').click();
await nav(p, 'Docs');
ok(await p.getByText('Aún no tienes documentos.').waitFor({ timeout: 5000 }).then(() => true, () => false), 'tras «Borrar todos los datos», Docs queda vacío');

// Restaurar: muestra qué trae la copia, devuelve el documento y las preferencias.
await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('miGestor.settings'));
  localStorage.setItem('miGestor.settings', JSON.stringify({ ...s, palette: 'menta', textSize: 'normal', lastBackupAt: null }));
});
await p.reload({ waitUntil: 'networkidle' });
await p.getByPlaceholder('Código').fill(CODE);
await p.getByRole('button', { name: 'Desbloquear' }).click();
await p.getByRole('heading', { name: 'Inicio' }).waitFor();
const asked = [];
p.removeAllListeners('dialog');
p.on('dialog', (d) => {
  asked.push(d.message());
  d.accept();
});
await p.getByLabel('Ajustes').click();
await p.getByRole('button', { name: 'Importar' }).click();
await p.locator('input[type=file]').setInputFiles(`${ARTIFACTS}/datos-copia.json`);
await p.getByPlaceholder('Contraseña de la copia').fill('copia-123456');
await p.getByRole('button', { name: 'Restaurar copia' }).click();
await p.getByText('Datos restaurados.').waitFor();
ok(asked.some((m) => /La copia del 15 de octubre de 2026 tiene 0 movimientos, 0 notas y 1 documentos/.test(m)), 'antes de restaurar muestra qué trae la copia y su fecha');
ok((await p.evaluate(() => [document.documentElement.dataset.palette, document.documentElement.dataset.text].join())) === 'lavanda,large', 'la copia devuelve el tema y el tamaño de letra');
await p.getByLabel('Cerrar').click();
await nav(p, 'Docs');
ok(await p.locator('.doc-card').first().waitFor({ timeout: 5000 }).then(() => true, () => false), 'el documento vuelve con la copia');

// Dos ventanas abiertas: la que quedó atrás se bloquea en vez de pisar lo nuevo.
const q = await ctx.newPage();
await q.clock.setFixedTime(new Date('2026-10-15T12:00:00'));
q.on('pageerror', (e) => errs.push(e.message));
await q.goto(BASE_URL, { waitUntil: 'networkidle' });
await q.getByPlaceholder('Código').fill(CODE);
await q.getByRole('button', { name: 'Desbloquear' }).click();
await q.getByRole('heading', { name: 'Inicio' }).waitFor();
ok(await p.getByRole('button', { name: 'Desbloquear' }).waitFor({ timeout: 5000 }).then(() => true, () => false), 'al abrir la app en otra ventana, la anterior se bloquea');
await p.getByPlaceholder('Código').fill(CODE);
await p.getByRole('button', { name: 'Desbloquear' }).click();
await p.getByRole('heading', { name: 'Inicio' }).waitFor();
await p.getByRole('button', { name: 'Gasto' }).first().click();
await p.getByPlaceholder('0').fill('4.000');
await p.getByRole('dialog').getByRole('button', { name: /Comida/ }).click();
await p.getByRole('dialog').getByRole('button', { name: 'Guardar' }).click();
ok(await q.getByRole('button', { name: 'Desbloquear' }).waitFor({ timeout: 5000 }).then(() => true, () => false), 'la otra ventana se bloquea al detectar cambios nuevos');
await q.getByPlaceholder('Código').fill(CODE);
await q.getByRole('button', { name: 'Desbloquear' }).click();
await nav(q, 'Historial');
ok((await q.locator('.row', { hasText: 'Comida' }).count()) === 1, 'al desbloquear, la otra ventana ve el gasto nuevo');

ok(errs.length === 0, 'sin errores ' + JSON.stringify(errs));
await b.close();
