import { chromium, devices } from 'playwright';
import { ARTIFACTS, BASE_URL, ok, ORIGIN, skipRecovery, sql } from './helpers.mjs';
const S=ARTIFACTS, URL=BASE_URL;
const b = await chromium.launch({ channel: 'chromium' });
const ctx = await b.newContext({ ...devices['Pixel 7'] });
await ctx.grantPermissions(['notifications'], { origin: ORIGIN });
const p = await ctx.newPage();
// Fecha fija: la prueba usa días concretos de octubre y plazos de aviso.
await p.clock.setFixedTime(new Date('2026-10-01T12:00:00')); const errs=[]; p.on('pageerror', e=>errs.push(e.message)); p.on('dialog', d=>d.accept());
await p.goto(URL, { waitUntil: 'networkidle' });
await p.getByPlaceholder(/Código \(mínimo/).fill('clave-segura-1'); await p.getByPlaceholder('Repite el código').fill('clave-segura-1');
await p.getByRole('button',{name:'Crear código'}).click(); await skipRecovery(p); await p.getByRole('heading',{name:'Inicio'}).waitFor();
await p.getByRole('navigation').getByRole('button',{name:'Calendario'}).click();
// elegir el día 15
await p.getByRole('button',{name:/15 de octubre/}).click();
await p.getByRole('button',{name:'Pago de tarjeta',exact:true}).click();
const dlg = p.getByRole('dialog',{name:'Pago de tarjeta'});
ok(await dlg.isVisible(), 'abre "Pago de tarjeta" desde el calendario');
ok((await dlg.locator('select').first().locator('option').allTextContents()).includes('CMR Falabella'), 'la lista incluye tarjetas chilenas (CMR Falabella)');
const groups = await dlg.locator('select').first().locator('optgroup').evaluateAll(gs=>gs.map(g=>g.label+':'+g.children.length));
ok(groups.join(',')==='Crédito:17,Débito:9,Prepago:3', 'grupos crédito/débito/prepago: '+groups.join(', '));
ok(await dlg.locator('input[type=date]').first().inputValue()==='2026-10-15', 'fecha = día elegido');
ok(await dlg.getByRole('button',{name:'Mensual'}).getAttribute('class')==='on', 'mensual por defecto');
ok(await dlg.locator('select').nth(1).inputValue()==='3', 'aviso 3 días antes por defecto');
// sin tarjeta → error
await dlg.getByPlaceholder('0').fill('85.000'); await dlg.getByRole('button',{name:'Guardar'}).click();
ok(await dlg.getByText('Elige la tarjeta que vas a pagar.').isVisible(), 'exige elegir tarjeta');
await dlg.locator('select').first().selectOption('CMR Falabella');
await dlg.locator('select').nth(1).selectOption('14');
await p.waitForTimeout(200); await p.screenshot({ path: S+'/card-form.png' });
await dlg.getByRole('button',{name:'Guardar'}).click();
// otra tarjeta personalizada con días a elección
await p.getByRole('button',{name:/25 de octubre/}).click();
await p.getByRole('button',{name:'Pago de tarjeta',exact:true}).click();
await dlg.getByPlaceholder('0').fill('40.000'); await dlg.locator('select').first().selectOption('__other');
await dlg.getByPlaceholder(/Nombre de la tarjeta/).fill('Visa del trabajo');
await dlg.locator('select').nth(1).selectOption('custom');
await dlg.getByPlaceholder('Ej.: 5').fill('99'); await dlg.getByRole('button',{name:'Guardar'}).click();
ok(await dlg.getByText(/entre 1 y 60 días/).isVisible(), 'rechaza más de 60 días');
await dlg.getByPlaceholder('Ej.: 5').fill('10'); await dlg.getByRole('button',{name:'Guardar'}).click();
await p.waitForTimeout(300);
const list = await p.locator('.card', {hasText:'Pagos de tarjeta del mes'}).textContent();
ok(/CMR Falabella/.test(list) && /2 semanas antes/.test(list) && /Visa del trabajo/.test(list) && /10 días antes/.test(list), 'lista mensual muestra ambas tarjetas con su aviso');
ok(await p.getByRole('button',{name:/15 de octubre/}).locator('.dot.cardpay').count()===1, 'el día 15 tiene marca de tarjeta');
await p.screenshot({ path: S+'/card-calendar.png', fullPage:true });
// noviembre también (mensual)
await p.getByLabel('Mes siguiente').click();
ok(await p.getByRole('button',{name:/15 de noviembre/}).locator('.dot.cardpay').count()===1, 'se repite el 15 de noviembre');
await p.getByLabel('Mes anterior').click();
// Inicio: recordatorios dentro del plazo (hoy 1 oct: CMR 15 oct con aviso de 14 días entra hoy; Visa 25 oct con 10 días aún no)
await p.getByRole('navigation').getByRole('button',{name:'Inicio'}).click();
const up = await p.locator('.card', {hasText:'Próximos recordatorios'}).textContent();
ok(/CMR Falabella/.test(up) && !/Visa del trabajo/.test(up), 'Inicio muestra el pago que ya entró en su plazo de aviso: '+up.replace(/\s+/g,' ').slice(0,120));
// notificaciones
await p.waitForTimeout(800);
const notes = await p.evaluate(async()=>{ const r=await navigator.serviceWorker.getRegistration(); return (await r.getNotifications()).map(n=>n.title+' | '+n.body); });
ok(notes.length===1 && /Pago de tarjeta en (2 semanas|1[0-4] días)/.test(notes[0]) && !/85/.test(notes[0]), 'notificación "Pago de tarjeta en 14 días" sin montos: '+JSON.stringify(notes));
await p.reload({ waitUntil:'networkidle' }); await p.getByPlaceholder('Código').fill('clave-segura-1'); await p.getByRole('button',{name:'Desbloquear'}).click(); await p.getByRole('heading',{name:'Inicio'}).waitFor(); await p.waitForTimeout(800);
const notes2 = await p.evaluate(async()=>{ const r=await navigator.serviceWorker.getRegistration(); return (await r.getNotifications()).length; });
ok(notes2===1, 'no repite el aviso al volver a abrir la app');
// editar: conserva tarjeta y aviso personalizado
await p.getByRole('navigation').getByRole('button',{name:'Calendario'}).click();
await p.locator('.card', {hasText:'Pagos de tarjeta del mes'}).getByRole('button',{name:/Visa del trabajo/}).click();
const ed = p.getByRole('dialog',{name:'Editar movimiento'});
ok(await ed.getByPlaceholder(/Nombre de la tarjeta/).inputValue()==='Visa del trabajo' && await ed.getByPlaceholder('Ej.: 5').inputValue()==='10', 'al editar conserva la tarjeta y los días del aviso');
ok(errs.length===0, 'sin errores '+JSON.stringify(errs));
await b.close();
