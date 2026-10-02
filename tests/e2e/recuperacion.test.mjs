import { chromium, devices } from 'playwright';
import { BASE_URL, ok, skipRecovery } from './helpers.mjs';

const CODE = 'clave-segura-1';
const b = await chromium.launch({ channel: 'chromium' });
const ctx = await b.newContext({ ...devices['Pixel 7'], acceptDownloads: true });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
p.on('dialog', (d) => d.accept());

await p.goto(BASE_URL, { waitUntil: 'networkidle' });
await p.getByPlaceholder(/Código \(mínimo/).fill(CODE);
await p.getByPlaceholder('Repite el código').fill(CODE);
await p.getByRole('button', { name: 'Crear código' }).click();
await p.getByRole('heading', { name: 'Tu código de recuperación' }).waitFor();
ok(await p.getByRole('button', { name: 'Continuar' }).isDisabled(), 'no se puede seguir sin confirmar que se guardó');
const recovery = await skipRecovery(p);
ok(/^([A-Z2-9]{4}-){7}[A-Z2-9]{4}$/.test(recovery), `código de recuperación de 32 caracteres: ${recovery}`);
await p.getByRole('heading', { name: 'Inicio' }).waitFor();
const disk = await p.evaluate(() => JSON.stringify(localStorage));
ok(!disk.includes(recovery) && !disk.includes(recovery.replace(/-/g, '')), 'el código de recuperación no se guarda en el teléfono');

// datos de ejemplo
for (const [amount, cat] of [['5.000', 'Comida'], ['3.000', 'Transporte'], ['8.000', 'Ocio']]) {
  await p.getByRole('button', { name: 'Gasto' }).first().click();
  await p.getByPlaceholder('0').fill(amount);
  await p.getByRole('dialog').getByRole('button', { name: new RegExp(cat) }).click();
  await p.getByRole('button', { name: 'Guardar' }).click();
}
ok(await p.locator('.notice', { hasText: 'Haz una copia de seguridad' }).isVisible(), 'con datos y sin copia: recuerda hacer una copia');
ok((await p.locator('.notice', { hasText: 'código de recuperación' }).count()) === 0, 'con código de recuperación: no muestra ese aviso');
await p.locator('.notice').getByRole('button', { name: 'Más tarde' }).click();
ok((await p.locator('.notice', { hasText: 'copia de seguridad' }).count()) === 0, '«Más tarde» oculta el recordatorio');

// olvidé mi código
await p.getByLabel('Bloquear').click();
await p.getByRole('button', { name: '¿Olvidaste tu código?' }).click();
await p.getByPlaceholder(/XXXX-XXXX/).fill('ABCD-EFGH-JKLM-NPQR-STUV-WXYZ-2345-6789');
await p.getByPlaceholder(/Código nuevo/).fill('nuevo-codigo-1');
await p.getByPlaceholder('Repite el código nuevo').fill('nuevo-codigo-1');
await p.getByRole('button', { name: 'Recuperar y entrar' }).click();
ok(await p.getByText('Código de recuperación incorrecto.').waitFor({ timeout: 10000 }).then(() => true, () => false), 'rechaza un código de recuperación falso');
await p.getByPlaceholder(/XXXX-XXXX/).fill(recovery.toLowerCase().replace(/-/g, ' '));
await p.getByRole('button', { name: 'Recuperar y entrar' }).click();
await p.getByRole('heading', { name: 'Inicio' }).waitFor();
ok(true, 'con el código de recuperación (aunque se escriba en minúsculas y con espacios) entra y define un código nuevo');
await p.getByRole('navigation').getByRole('button', { name: 'Historial' }).click();
ok((await p.locator('.row').count()) === 3, 'no se pierde ningún dato al recuperar');

// el código viejo ya no sirve y el nuevo sí
await p.getByLabel('Bloquear').click();
await p.getByPlaceholder('Código').fill(CODE);
await p.getByRole('button', { name: 'Desbloquear' }).click();
ok(await p.getByText('Código incorrecto.').waitFor({ timeout: 10000 }).then(() => true, () => false), 'el código olvidado ya no sirve');
await p.getByPlaceholder('Código').fill('nuevo-codigo-1');
await p.getByRole('button', { name: 'Desbloquear' }).click();
await p.getByRole('heading', { name: 'Historial' }).or(p.getByRole('heading', { name: 'Inicio' })).first().waitFor();
ok(true, 'el código nuevo funciona');

// usuaria antigua sin código de recuperación
await p.evaluate(() => {
  const v = JSON.parse(localStorage.getItem('miGestor.vault'));
  delete v.recovery;
  localStorage.setItem('miGestor.vault', JSON.stringify(v));
});
await p.reload({ waitUntil: 'networkidle' });
ok((await p.getByRole('button', { name: '¿Olvidaste tu código?' }).count()) === 0, 'sin código de recuperación no ofrece recuperar');
await p.getByPlaceholder('Código').fill('nuevo-codigo-1');
await p.getByRole('button', { name: 'Desbloquear' }).click();
await p.getByRole('heading', { name: 'Inicio' }).waitFor();
ok(await p.locator('.notice', { hasText: 'Crea tu código de recuperación' }).isVisible(), 'a quien ya usaba la app le pide crear su código de recuperación');
await p.locator('.notice').getByRole('button', { name: 'Crear' }).click();
await p.getByPlaceholder('Tu código', { exact: true }).fill('nuevo-codigo-1');
await p.getByRole('button', { name: 'Crear código de recuperación' }).last().click();
const second = await skipRecovery(p);
ok(/^([A-Z2-9]{4}-){7}[A-Z2-9]{4}$/.test(second) && second !== recovery, 'genera un código de recuperación nuevo');
ok(await p.getByText(/✅ Creado/).isVisible(), 'Ajustes muestra que el código de recuperación está creado');
const protection = await p.locator('.field', { hasText: 'Protección contra borrado' }).textContent();
ok(/Activa|Instala Mi Gestor|no la confirmó/.test(protection), `estado de la protección contra borrado: ${protection.replace('Protección contra borrado', '').slice(0, 60)}…`);

// la copia de seguridad actualiza el recordatorio
await p.getByRole('button', { name: 'Exportar' }).click();
await p.getByPlaceholder(/Contraseña de la copia/).fill('copia-123456');
await p.getByPlaceholder('Repite la contraseña').fill('copia-123456');
await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Descargar copia cifrada' }).click()]);
ok(await p.getByText(/Última copia:/).isVisible(), 'registra la fecha de la última copia');
await p.getByLabel('Cerrar').click();
ok((await p.locator('.notice').count()) === 0, 'tras crear el código y la copia, Inicio queda sin avisos');

// el código de recuperación sigue funcionando después de cambiar el código normal
await p.getByLabel('Bloquear').click();
await p.getByRole('button', { name: '¿Olvidaste tu código?' }).click();
await p.getByPlaceholder(/XXXX-XXXX/).fill(second);
await p.getByPlaceholder(/Código nuevo/).fill('otro-codigo-2');
await p.getByPlaceholder('Repite el código nuevo').fill('otro-codigo-2');
await p.getByRole('button', { name: 'Recuperar y entrar' }).click();
await p.getByRole('heading', { name: 'Inicio' }).waitFor();
ok(true, 'el código de recuperación sirve más de una vez');

ok(errs.length === 0, `sin errores ${JSON.stringify(errs)}`);
await b.close();
