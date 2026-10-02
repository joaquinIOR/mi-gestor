import { chromium, devices } from 'playwright';
import { ARTIFACTS, BASE_URL, ok, ORIGIN, skipRecovery, sql } from './helpers.mjs';
const S=ARTIFACTS, URL=BASE_URL;
const b = await chromium.launch({ channel: 'chromium' });
const ctx = await b.newContext({ ...devices['Pixel 7'] });
const p = await ctx.newPage(); const errs=[]; p.on('pageerror', e=>errs.push(e.message)); p.on('dialog', d=>d.accept());
await p.goto(URL, { waitUntil: 'networkidle' });
await p.getByPlaceholder(/Código \(mínimo/).fill('clave-segura-1'); await p.getByPlaceholder('Repite el código').fill('clave-segura-1');
await p.getByRole('button',{name:'Crear código'}).click(); await skipRecovery(p); await p.getByRole('heading',{name:'Inicio'}).waitFor();
await p.getByRole('button',{name:'Ingreso'}).first().click(); await p.getByPlaceholder('0').fill('400.000'); await p.getByRole('dialog').getByRole('button',{name:/Sueldo/}).click(); await p.getByRole('button',{name:'Guardar'}).click();
for (const [a,c] of [['180.000','Vivienda'],['45.000','Comida'],['3.000','Transporte'],['20.000','Servicios']]) { await p.getByRole('button',{name:'Gasto'}).first().click(); await p.getByPlaceholder('0').fill(a); await p.getByRole('dialog').getByRole('button',{name:new RegExp(c)}).click(); await p.getByRole('button',{name:'Guardar'}).click(); }
await p.getByLabel('Definir tope').click(); await p.getByRole('button',{name:/Usar mis ingresos/}).click(); await p.locator('.budget form').getByRole('button',{name:'Guardar'}).click();
const ids = ['menta','rosa','lavanda','celeste','cielo','durazno','salvia','coral','indigo','grafito'];
for (const mode of ['light','dark']) {
  await p.emulateMedia({ colorScheme: mode });
  for (const id of ids) {
    await p.getByLabel('Ajustes').click();
    await p.getByRole('radio', { name: new RegExp(id==='indigo'?'Índigo':id==='rosa'?'Rosa':id==='celeste'?'Celeste':id, 'i') }).click();
    if (id==='rosa' ) await p.screenshot({ path: S+'/th-settings-'+mode+'.png' });
    await p.getByLabel('Cerrar').click(); await p.waitForTimeout(150);
    await p.screenshot({ path: S+'/th-'+mode+'-'+id+'.png' });
    const pal = await p.evaluate(()=>[document.documentElement.dataset.palette, getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(), document.querySelector('meta[name=theme-color]').content]);
    ok(pal[0]===id && pal[1]===pal[2], mode+' '+id+': tema aplicado, barra de estado '+pal[2]);
  }
}
await p.emulateMedia({ colorScheme: 'light' });
await p.getByLabel('Bloquear').click(); await p.screenshot({ path: S+'/th-lock.png' });
await p.reload({ waitUntil:'networkidle' });
ok(await p.evaluate(()=>document.documentElement.dataset.palette)==='grafito', 'el tema elegido se recuerda al recargar (también en la pantalla de bloqueo)');
ok(errs.length===0,'sin errores '+JSON.stringify(errs));
await b.close();
