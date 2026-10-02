import { chromium, devices } from 'playwright';
import { ARTIFACTS, BASE_URL, ok, ORIGIN, skipRecovery, sql } from './helpers.mjs';
const S=ARTIFACTS, URL=BASE_URL, CODE='mi-clave-segura';
const b = await chromium.launch({ channel: 'chromium' });
const ctx = await b.newContext({ ...devices['Pixel 7'] });
await ctx.grantPermissions(['notifications'], { origin: ORIGIN });
const p = await ctx.newPage();
const errs=[]; p.on('console', m=>{ if(m.type()==='warning') console.log('DBG warn', m.text()); }); p.on('pageerror', e=>errs.push(e.message)); p.on('console', m=>{ if(m.type()==='error') errs.push(m.text()); });
p.on('dialog', d=>d.accept());
const cdp = await ctx.newCDPSession(p);
await cdp.send('WebAuthn.enable');
const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol:'ctap2', ctap2Version:'ctap2_1', transport:'internal', hasResidentKey:true, hasUserVerification:true, isUserVerified:true, hasPrf:true, automaticPresenceSimulation:true } });
await p.goto(URL, { waitUntil: 'networkidle' });
await p.getByPlaceholder(/Código \(mínimo/).fill(CODE); await p.getByPlaceholder('Repite el código').fill(CODE);
await p.getByRole('button',{name:'Crear código'}).click(); await skipRecovery(p); await p.getByRole('heading',{name:'Inicio'}).waitFor();
// activar huella
await p.getByLabel('Ajustes').click();
await p.getByRole('button',{name:'Activar huella / Face ID'}).first().click();
await p.getByPlaceholder('Tu código').fill('codigo-malo'); await p.locator('form.subform').getByRole('button',{name:/Activar huella/}).click();
await p.getByText('El código no es correcto.').waitFor(); ok(true,'activar huella exige el código correcto');
const credsBefore = (await cdp.send('WebAuthn.getCredentials',{authenticatorId})).credentials.length;
ok(credsBefore===0,'con código incorrecto no se crea ninguna passkey');
await p.getByPlaceholder('Tu código').fill(CODE); await p.locator('form.subform').getByRole('button',{name:/Activar huella/}).click();
await p.getByText(/Huella \/ Face ID activado/).waitFor(); ok(true,'huella activada');
const vault = await p.evaluate(()=>localStorage.getItem('miGestor.vault'));
ok(/"biometric":\{"credentialId"/.test(vault) && !vault.includes(CODE),'bóveda guarda la clave cifrada para la huella (sin el código)');
await p.waitForTimeout(300); await p.screenshot({ path: S+'/bio-settings.png' });
await p.getByLabel('Cerrar').click();
// añadir dato y bloquear
await p.getByRole('button',{name:'Gasto'}).first().click(); await p.getByPlaceholder('0').fill('12'); await p.getByRole('button',{name:/Comida/}).click(); await p.getByPlaceholder(/Supermercado/).fill('Almuerzo'); await p.getByRole('button',{name:'Guardar'}).click();
await p.getByLabel('Bloquear').click();
// la huella se pide sola al aparecer la pantalla de bloqueo
await p.getByRole('heading',{name:'Inicio'}).waitFor({timeout:8000}); ok(await p.locator('.legend-row', {hasText:'Comida'}).isVisible(),'desbloqueo automático con huella descifra los datos');
await p.getByLabel('Bloquear').click(); await p.getByRole('heading',{name:'Inicio'}).waitFor({timeout:8000});
// cambiar el código no rompe la huella
await p.getByLabel('Ajustes').click(); await p.getByRole('button',{name:'Cambiar código'}).click();
await p.getByPlaceholder('Código actual', {exact:true}).fill(CODE); await p.getByPlaceholder('Código nuevo', {exact:true}).fill('codigo-nuevo-99'); await p.getByPlaceholder('Repite el código nuevo').fill('codigo-nuevo-99');
await p.locator('form.subform').getByRole('button',{name:'Cambiar código'}).click(); await p.getByText('Código cambiado.').waitFor();
await p.getByLabel('Cerrar').click();
await p.getByLabel('Bloquear').click();
await p.getByRole('heading',{name:'Inicio'}).waitFor({timeout:8000});
ok(true,'la huella sigue funcionando tras cambiar el código');
// acceso rápido: notificación
await p.getByLabel('Ajustes').click();
await p.getByRole('switch').filter({ has: p.locator('xpath=.') }).count();
await p.getByText('Botones en la barra de notificaciones').click();
await p.waitForTimeout(800);
const notes = await p.evaluate(async()=>{ const r=await navigator.serviceWorker.getRegistration(); const n=await r.getNotifications({tag:'quick-access'}); return n.map(x=>({title:x.title, body:x.body, actions:(x.actions||[]).map(a=>a.title), sticky:x.requireInteraction})); });
ok(notes.length===1 && notes[0].actions.join('|')==='− Gasto|+ Ingreso' && notes[0].sticky,'notificación fija con botones − Gasto / + Ingreso: '+JSON.stringify(notes));
ok(!/Almuerzo|12/.test(JSON.stringify(notes)),'la notificación no muestra datos personales');
await p.getByLabel('Cerrar').click();
// botón de la notificación con la app abierta (mensaje del service worker)
await p.evaluate(()=>navigator.serviceWorker.dispatchEvent(new MessageEvent('message',{data:{type:'quick',quick:'income'}})));
await p.getByRole('dialog',{name:'Ingreso rápido'}).waitFor({timeout:3000}); ok(true,'botón "+ Ingreso" abre el ingreso rápido');
ok(await p.locator('input[type=date]').count()===0,'modo rápido: oculta fecha y repetición');
await p.getByPlaceholder('0').fill('500'); await p.getByRole('button',{name:/Sueldo/}).click(); await p.getByRole('button',{name:'Guardar'}).click();
ok(/500/.test(await p.locator('.hero').textContent()),'ingreso rápido guardado (ingresos del mes incluyen 500)');
// atajo del icono con la app bloqueada
const p2 = await ctx.newPage(); p2.on('pageerror', e=>console.log('DBG p2 err', e.message)); await p2.goto(URL+'?quick=expense', { waitUntil:'networkidle' });
ok(await p2.getByText('Desbloquea para registrar un gasto.').isVisible({timeout:3000}).catch(()=>false) || await p2.getByRole('dialog',{name:'Gasto rápido'}).isVisible(),'atajo "Gasto rápido" con la app bloqueada pide desbloquear');
await p2.getByPlaceholder('Código').fill('codigo-nuevo-99'); await p2.getByRole('button',{name:'Desbloquear'}).click();
await p2.getByRole('dialog',{name:'Gasto rápido'}).waitFor({timeout:8000});
ok(true,'tras desbloquear se abre directamente "Gasto rápido"');
ok(!p2.url().includes('quick='),'la URL se limpia');
await p2.getByRole('button',{name:/Más opciones/}).click(); ok(await p2.locator('input[type=date]').count()===1,'"Más opciones" muestra fecha y repetición');
await p2.waitForTimeout(300); await p2.screenshot({ path: S+'/quick.png' });
const man = await p.evaluate(async()=> (await (await fetch('manifest.webmanifest')).json()).shortcuts.map(s=>s.name+'→'+s.url));
ok(man.join(',')==='Gasto rápido→./?quick=expense,Ingreso rápido→./?quick=income','atajos del icono en el manifiesto');
// desactivar huella
await p.getByLabel('Ajustes').click(); await p.getByText('Desbloquear con huella o Face ID').click();
ok(!(await p.evaluate(()=>localStorage.getItem('miGestor.vault'))).includes('biometric'),'desactivar huella elimina su clave');
ok(errs.length===0,'sin errores: '+JSON.stringify(errs));
await b.close();
