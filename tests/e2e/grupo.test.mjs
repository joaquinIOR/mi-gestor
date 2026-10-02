import { chromium, devices } from 'playwright';
import { ARTIFACTS, BASE_URL, ok, ORIGIN, skipRecovery, sql } from './helpers.mjs';
import { execSync } from 'node:child_process';
const S=ARTIFACTS, URL=BASE_URL;
const _unusedSql = (q) => execSync(`psql -h localhost -p 55432 -U postgres -tA -c "${q.replace(/"/g,'\\"')}"`).toString().trim();
const b = await chromium.launch({ channel: 'chromium' });
async function phone(name) {
  const ctx = await b.newContext({ ...devices['Pixel 7'] });
  await ctx.grantPermissions(['clipboard-read','clipboard-write'], { origin: ORIGIN });
  const p = await ctx.newPage(); p.errs=[]; p.on('pageerror', e=>p.errs.push(e.message)); p.on('console', m=>{ if(m.type()==='error' && !/Failed to load resource|ERR_INTERNET_DISCONNECTED/.test(m.text())) p.errs.push(m.text()); }); p.on('dialog', d=>d.accept());
  return p;
}
const setup = async (p, url) => { await p.goto(url, { waitUntil: 'networkidle' }); await p.getByPlaceholder(/Código \(mínimo/).fill('clave-segura-1'); await p.getByPlaceholder('Repite el código').fill('clave-segura-1'); await p.getByRole('button',{name:'Crear código'}).click(); await skipRecovery(p); };
const A = await phone('Joaquín'); await setup(A, URL); await A.getByRole('heading',{name:'Inicio'}).waitFor();
await A.getByRole('navigation').getByRole('button',{name:'Grupo'}).click();
await A.getByRole('button',{name:'Crear grupo'}).click();
await A.getByPlaceholder('https://xxxx.supabase.co').fill('https://evil.example.com'); await A.getByPlaceholder('sb_publishable_…').fill('sb_publishable_test');
await A.getByRole('button',{name:/Probar conexión/}).click();
ok(await A.getByText(/debe ser la de tu proyecto/).isVisible(), 'rechaza servidores que no son de Supabase');
await A.getByPlaceholder('https://xxxx.supabase.co').fill('http://localhost:54321'); await A.getByPlaceholder('sb_publishable_…').fill('sb_secret_abc');
await A.getByRole('button',{name:/Probar conexión/}).click();
ok(await A.getByText(/nunca la secreta/).isVisible(), 'rechaza la clave secreta');
await A.getByPlaceholder('sb_publishable_…').fill('sb_publishable_test');
await A.getByRole('button',{name:/Probar conexión/}).click();
await A.getByText('Servidor conectado.').waitFor({timeout:8000}); ok(true, 'conexión con el servidor probada');
await A.getByPlaceholder('Ej.: Joaquín').fill('Joaquín'); await A.getByRole('dialog').getByRole('button',{name:'Crear grupo'}).click();
await A.getByRole('dialog',{name:/Invitar a «Casa»/}).waitFor(); ok(await A.locator('svg.qr').isVisible(), 'muestra QR de invitación');
await A.waitForTimeout(300); await A.screenshot({ path: S+'/g-invite.png' });
await A.getByRole('button',{name:'Copiar enlace'}).click();
const link = await A.evaluate(()=>navigator.clipboard.readText());
ok(/#join=[\w-]+$/.test(link), 'enlace de invitación con la clave tras "#"');
await A.getByLabel('Cerrar').click();
// teléfono de la hermana abre el enlace
const B = await phone('Fernanda'); await setup(B, link);
await B.getByRole('dialog',{name:'Unirme a un grupo'}).waitFor();
ok(await B.getByText(/Te invitaron al grupo «Casa»/).isVisible(), 'la hermana ve la invitación tras crear su código');
ok(!B.url().includes('#join'), 'la clave desaparece de la barra de direcciones');
await B.getByPlaceholder('Ej.: Joaquín').fill('Fernanda'); await B.getByRole('button',{name:'Unirme al grupo'}).click();
await B.getByText('Joaquín', {exact:false}).first().waitFor();
const t0 = Date.now();
await A.locator('.toast', {hasText:'Fernanda se unió'}).waitFor({ timeout: 10000 });
ok(true, 'aviso en el teléfono de Joaquín: "Fernanda se unió" ('+(Date.now()-t0)+' ms)');
ok(await A.locator('.member').count()===2 && await B.locator('.member').count()===2, 'ambas ven a los 2 miembros');
// gasto en común de la hermana
await B.getByRole('button',{name:'Gasto en común'}).click();
await B.getByPlaceholder('0').fill('30.000'); await B.getByPlaceholder(/Supermercado, cuenta/).fill('Supermercado');
await B.getByRole('dialog').getByRole('button',{name:'Guardar'}).click();
const t1 = Date.now();
await A.locator('.toast', {hasText:'Fernanda agregó «Supermercado»'}).waitFor({ timeout: 10000 });
ok(true, 'Joaquín recibe el gasto de Fernanda en tiempo real ('+(Date.now()-t1)+' ms)');
ok(/Debes \$15\.000/.test(await A.locator('.group-balance').textContent()), 'Joaquín: "Debes $15.000"');
await B.waitForTimeout(500);
ok(/Te deben \$15\.000/.test(await B.locator('.group-balance').textContent()), 'Fernanda: "Te deben $15.000"');
// el servidor solo tiene datos cifrados
const raw = sql("select string_agg(data, '') from shared_entries");
ok(raw.length>100 && !/Supermercado|Fernanda|Joaqu|30000/.test(raw) && !/Supermercado|Fernanda/.test(Buffer.from(raw,'base64').toString('latin1')), 'el servidor solo guarda datos cifrados ('+sql('select count(*) from shared_entries')+' filas)');
// pago para quedar a mano
await A.getByRole('button',{name:'Registrar pago'}).click();
await A.getByRole('dialog',{name:'Registrar pago'}).getByRole('button',{name:'Guardar pago'}).click();
await B.locator('.group-balance', {hasText:'Están a mano'}).waitFor({ timeout: 10000 }); ok(true, 'tras el pago, Fernanda ve "Están a mano"');
// borrar se propaga
await A.locator('.row', {hasText:'Supermercado'}).click(); await A.getByRole('button',{name:'Eliminar'}).click();
await B.locator('.row', {hasText:'Supermercado'}).waitFor({ state:'detached', timeout: 10000 }); ok(true, 'eliminar un gasto se refleja en el otro teléfono');
// sin conexión: se guarda y se envía después
await A.context().setOffline(true);
await A.getByRole('button',{name:'Gasto en común'}).click(); await A.getByPlaceholder('0').fill('12.000'); await A.getByPlaceholder(/Supermercado, cuenta/).fill('Gas'); await A.getByRole('dialog').getByRole('button',{name:'Guardar'}).click();
await A.locator('.sync-status', {hasText:'Sin conexión'}).waitFor({ timeout: 10000 }); ok(true, 'sin internet: avisa y guarda el gasto pendiente');
await A.context().setOffline(false);
await B.locator('.row', {hasText:'Gas'}).waitFor({ timeout: 12000 }); ok(true, 'al volver internet, el gasto pendiente llega a Fernanda');
// fila manipulada en el servidor
const gid = sql("select group_id from shared_entries limit 1");
sql("insert into shared_entries values (gen_random_uuid(), '"+gid+"', 'AAAAAAAAAAAAAAAA', 'bWFsaWNpb3Nv', clock_timestamp())");
await A.waitForTimeout(6000);
ok(A.errs.length===0 && await A.locator('.row').count()===2, 'una entrada falsa en el servidor se ignora sin romper nada');
// persistencia cifrada + reabrir
await B.reload({ waitUntil:'networkidle' }); await B.getByPlaceholder('Código').fill('clave-segura-1'); await B.getByRole('button',{name:'Desbloquear'}).click();
await B.getByRole('navigation').getByRole('button',{name:'Grupo'}).click();
ok(await B.locator('.row', {hasText:'Gas'}).isVisible(), 'el grupo sigue tras reabrir la app');
const disk = await B.evaluate(()=>JSON.stringify(localStorage)); ok(!/Gas|Fernanda|join/.test(disk), 'nada del grupo queda sin cifrar en el teléfono');
await A.screenshot({ path: S+'/g-main-A.png', fullPage: true }); await B.screenshot({ path: S+'/g-main-B.png', fullPage: true });
ok(A.errs.length===0 && B.errs.length===0, 'sin errores: '+JSON.stringify([A.errs,B.errs]));
await b.close();
