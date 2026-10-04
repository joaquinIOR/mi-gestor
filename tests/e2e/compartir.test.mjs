// «Compartir Mi Gestor»: comparte solo el enlace limpio de la app (sin datos ni invitaciones), con respaldo a copiar,
// copia manual si el teléfono no deja copiar, y código QR. Está en Inicio y en Ajustes.
import { chromium, devices } from 'playwright';
import { ARTIFACTS, BASE_URL, ok, ORIGIN, skipRecovery } from './helpers.mjs';

const b = await chromium.launch({ channel: 'chromium' });

async function phone({ share, clipboard = true }) {
  const ctx = await b.newContext({ ...devices['Pixel 7'] });
  if (clipboard) await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: ORIGIN });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('dialog', (d) => d.accept());
  await p.addInitScript(
    ({ share, clipboard }) => {
      window.__shared = [];
      window.__shareMode = 'ok';
      if (share) {
        Object.defineProperty(Navigator.prototype, 'share', {
          configurable: true,
          value: async (data) => {
            if (window.__shareMode === 'abort') throw new DOMException('Cancelado', 'AbortError');
            if (window.__shareMode === 'fail') throw new DOMException('No permitido', 'NotAllowedError');
            window.__shared.push(data);
          },
        });
      } else {
        delete Navigator.prototype.share;
      }
      if (!clipboard) {
        Object.defineProperty(Clipboard.prototype, 'writeText', { configurable: true, value: () => Promise.reject(new DOMException('No', 'NotAllowedError')) });
      }
    },
    { share, clipboard }
  );
  await p.goto(BASE_URL, { waitUntil: 'networkidle' });
  await p.getByPlaceholder(/Código \(mínimo/).fill('clave-segura-1');
  await p.getByPlaceholder('Repite el código').fill('clave-segura-1');
  await p.getByRole('button', { name: 'Crear código' }).click();
  await skipRecovery(p);
  await p.getByRole('heading', { name: 'Inicio' }).waitFor();
  return { p, errs };
}

// --- Teléfono que puede compartir (Android) ---
const { p, errs } = await phone({ share: true });
// Un dato propio, para comprobar que nunca viaja en lo compartido.
await p.getByRole('button', { name: 'Ingreso' }).first().click();
await p.getByRole('dialog').getByPlaceholder('0').fill('123.456');
await p.getByRole('dialog').getByRole('button', { name: /Sueldo/ }).click();
await p.getByRole('dialog').getByRole('button', { name: 'Guardar' }).click();
await p.getByRole('dialog').waitFor({ state: 'detached' });
// Aunque la dirección tenga algo más (por ejemplo, restos de una invitación), se comparte el enlace limpio.
await p.evaluate(() => history.replaceState(null, '', `${location.pathname}?ref=abc#join=secreto`));

await p.getByRole('button', { name: /Compartir Mi Gestor/ }).click();
const sheet = p.getByRole('dialog');
ok(await sheet.getByRole('heading', { name: 'Compartir Mi Gestor' }).isVisible(), 'Inicio: la tarjeta abre «Compartir Mi Gestor»');
ok((await sheet.getByLabel('Enlace de Mi Gestor').inputValue()) === BASE_URL, 'muestra el enlace de la app: ' + BASE_URL);
await sheet.getByRole('button', { name: 'Compartir enlace' }).click();
const shared = await p.evaluate(() => window.__shared);
ok(shared.length === 1 && shared[0].url === BASE_URL, 'comparte el enlace limpio, sin «?» ni «#join» (' + shared[0]?.url + ')');
ok(shared[0].title === 'Mi Gestor' && /Pruébala aquí/.test(shared[0].text), 'con título y una invitación a probarla');
ok(!/123|456|Sueldo|clave/.test(JSON.stringify(shared[0])), 'no lleva montos, movimientos ni el código');
ok(await sheet.getByText(/Gracias por recomendar/).isVisible(), 'confirma que se compartió');
await p.waitForTimeout(200);
await p.screenshot({ path: `${ARTIFACTS}/compartir.png` });

// Cerrar el menú de compartir no copia ni muestra errores.
await p.evaluate(() => {
  window.__shareMode = 'abort';
  return navigator.clipboard.writeText('sin cambios');
});
await sheet.getByRole('button', { name: 'Compartir enlace' }).click();
await p.waitForTimeout(200);
ok((await p.evaluate(() => navigator.clipboard.readText())) === 'sin cambios', 'cancelar el menú de compartir no hace nada más');
// Si compartir falla, se copia el enlace.
await p.evaluate(() => {
  window.__shareMode = 'fail';
});
await sheet.getByRole('button', { name: 'Compartir enlace' }).click();
await sheet.getByRole('button', { name: 'Copiado' }).waitFor();
ok((await p.evaluate(() => navigator.clipboard.readText())) === BASE_URL, 'si compartir falla, copia el enlace');

// Código QR para alguien que está al lado.
await sheet.getByRole('button', { name: 'Mostrar código QR' }).click();
ok(await sheet.getByRole('img', { name: 'Código QR para abrir Mi Gestor' }).isVisible(), 'muestra el código QR');
await p.waitForTimeout(200);
await sheet.screenshot({ path: `${ARTIFACTS}/compartir-qr.png` });
await sheet.getByRole('button', { name: 'Cerrar' }).click();
await sheet.waitFor({ state: 'detached' });

// También en Ajustes.
await p.getByRole('button', { name: 'Ajustes' }).click();
const settings = p.getByRole('dialog');
const section = settings.locator('#settings-share');
await section.scrollIntoViewIfNeeded();
ok(await section.getByRole('heading', { name: /Compartir Mi Gestor/ }).isVisible(), 'Ajustes: sección «Compartir Mi Gestor»');
await p.evaluate(() => navigator.clipboard.writeText('otro'));
await section.getByRole('button', { name: 'Copiar enlace' }).click();
await section.getByRole('button', { name: 'Copiado' }).waitFor();
ok((await p.evaluate(() => navigator.clipboard.readText())) === BASE_URL, 'Ajustes: copia el enlace de la app');
// El campo usa su propio estilo (si lo pisa la regla general de los campos, con letra «Muy grande» el enlace se corta).
const fits = await section.getByLabel('Enlace de Mi Gestor').evaluate((el) => ({ size: getComputedStyle(el).fontSize, padding: getComputedStyle(el).paddingLeft }));
ok(fits.padding === '12px' && fits.size === '16px', 'el campo del enlace usa su estilo propio (' + JSON.stringify(fits) + ')');
ok(errs.length === 0, `sin errores en la página ${errs.join(' | ')}`);

// --- Teléfono o navegador sin «Compartir» y que no deja copiar ---
const other = await phone({ share: false, clipboard: false });
await other.p.getByRole('button', { name: /Compartir Mi Gestor/ }).click();
const sheet2 = other.p.getByRole('dialog');
ok((await sheet2.getByRole('button', { name: 'Compartir enlace' }).count()) === 0, 'sin «Compartir» del teléfono: no muestra ese botón');
await sheet2.getByRole('button', { name: 'Copiar enlace' }).click();
ok(await sheet2.getByText(/mantén presionado el enlace/).isVisible(), 'si no se puede copiar, explica cómo hacerlo a mano');
const selected = await other.p.evaluate(() => {
  const el = document.activeElement;
  return el?.getAttribute('aria-label') === 'Enlace de Mi Gestor' ? el.value.slice(el.selectionStart, el.selectionEnd) : null;
});
ok(selected === BASE_URL, 'y deja el enlace seleccionado para copiarlo');
ok(other.errs.length === 0, `sin errores en la página ${other.errs.join(' | ')}`);

await b.close();
