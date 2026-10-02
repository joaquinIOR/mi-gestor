import { chromium, devices } from 'playwright';
import { ARTIFACTS, BASE_URL, ok, ORIGIN, skipRecovery, sql } from './helpers.mjs';
const S=ARTIFACTS, URL=BASE_URL;
const b = await chromium.launch({ channel: 'chromium' });
for (const scheme of ['light','dark']) {
const ctx = await b.newContext({ ...devices['Pixel 7'], colorScheme: scheme, acceptDownloads:true });
const p = await ctx.newPage(); const errs=[]; p.on('pageerror', e=>errs.push(e.message)); p.on('dialog', d=>d.accept());
await p.goto(URL, { waitUntil: 'networkidle' });
await p.getByPlaceholder(/Código \(mínimo/).fill('clave-segura-1'); await p.getByPlaceholder('Repite el código').fill('clave-segura-1');
await p.getByRole('button',{name:'Crear código'}).click(); await skipRecovery(p); await p.getByRole('heading',{name:'Inicio'}).waitFor();
// ingreso sueldo
await p.getByRole('button',{name:'Ingreso'}).first().click(); await p.getByPlaceholder('0').fill('400000'); await p.getByRole('button',{name:/Sueldo/}).click(); await p.getByRole('button',{name:'Guardar'}).click();
// tope
await p.getByLabel('Definir tope').click();
await p.getByRole('button',{name:/Usar mis ingresos del mes/}).click(); await p.locator('.budget form').getByRole('button',{name:'Guardar'}).click();
const add = async (amount, cat, desc) => { await p.getByRole('button',{name:'Gasto'}).first().click(); await p.getByPlaceholder('0').fill(amount); if (cat.startsWith('+')) { await p.getByRole('button',{name:/Nuevo tipo/}).click(); await p.getByPlaceholder('Nombre del tipo').fill(cat.slice(1)); await p.getByRole('button',{name:'Añadir'}).click(); } else await p.getByRole('dialog').getByRole('button',{name:new RegExp(cat)}).click(); if(desc) await p.getByPlaceholder(/Supermercado/).fill(desc); await p.getByRole('button',{name:'Guardar'}).click(); };
await add('3.000','Transporte','Micro');
ok(/0,8 %/.test(await p.locator('.budget').textContent()), scheme+': 3.000 de transporte = 0,8 % del sueldo');
const seg = await p.locator('.budget-seg').first().evaluate(e=>({w:e.getBoundingClientRect().width, track:e.parentElement.getBoundingClientRect().width, bg:getComputedStyle(e).backgroundColor}));
ok(Math.abs(seg.w/seg.track - 0.0075) < 0.02, scheme+': tramo de transporte proporcional ('+(seg.w/seg.track*100).toFixed(2)+'%) color '+seg.bg);
await add('180000','Vivienda','Arriendo'); await add('45000','Comida','Supermercado'); await add('20000','Servicios','Luz y agua'); await add('15000','Ocio'); await add('8000','Educación'); await add('12000','+Mascota');
const txt = await p.locator('.budget').textContent();
ok(/Disponible: \$117\.000/.test(txt) && /usado 71 %/.test(txt), scheme+': disponible 117.000 y 71 % usado');
ok(await p.locator('.budget-seg').count()===6, scheme+': 5 tipos con color + 1 tramo Otros (Educación+Mascota)');
await p.locator('.budget').scrollIntoViewIfNeeded(); await p.waitForTimeout(500);
await p.locator('.budget').screenshot({ path: S+'/budget-'+scheme+'.png' });
// tocar un tramo
await p.locator('.budget-seg').nth(0).click();
ok(/Vivienda: \$180\.000 · 45 % del tope/.test(await p.locator('.budget-detail').textContent()), scheme+': tocar tramo muestra detalle');
await p.locator('.budget-seg').nth(0).click();
// pasarse del tope
await add('150000','Compras','Celular');
const over = await p.locator('.budget-status').textContent();
ok(/Te pasaste por \$33\.000/.test(over), scheme+': aviso al pasarse ('+over.trim()+')');
ok(await p.locator('.budget-limit').count()===1, scheme+': marca del tope visible');
await p.waitForTimeout(500); await p.locator('.budget').screenshot({ path: S+'/budget-over-'+scheme+'.png' });
if (scheme==='light') {
  // persistencia cifrada + copia
  await p.reload({ waitUntil:'networkidle' }); await p.getByPlaceholder('Código').fill('clave-segura-1'); await p.getByRole('button',{name:'Desbloquear'}).click(); await p.getByRole('heading',{name:'Inicio'}).waitFor();
  ok(/de \$400\.000/.test(await p.locator('.budget').textContent()), 'el tope se guarda (cifrado) y se recupera');
  const disk = await p.evaluate(()=>JSON.stringify(localStorage));
  console.log('DBG settings', await p.evaluate(()=>localStorage.getItem('miGestor.settings'))); ok(!/400000|400\.000|"budget":/.test(disk), 'el monto del tope no queda en claro en localStorage');
}
ok(errs.length===0, scheme+': sin errores '+JSON.stringify(errs));
await ctx.close();
}
await b.close();
