// Avisos con la app cerrada: suscripción, aviso al grupo, recordatorios programados, limpieza y aviso en el teléfono.
import https from 'node:https';
import { chromium, devices } from 'playwright';
import { BASE_URL, ok, ORIGIN, skipRecovery, sql } from './helpers.mjs';

const SERVER = 'http://localhost:54321';
const b = await chromium.launch({ channel: 'chromium' });
const errors = [];

// Lo que recibió el servicio de avisos simulado.
const pushLog = () =>
  new Promise((resolve, reject) => {
    https.get('https://localhost:54340/__log', { rejectUnauthorized: false }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
const waitFor = async (check, ms = 15000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const value = await check();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 400));
  }
  return null;
};

async function phone() {
  const ctx = await b.newContext({ ...devices['Pixel 7'] });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write', 'notifications'], { origin: ORIGIN });
  // Este entorno no llega a los servidores de avisos de Google: se simula la suscripción con claves reales
  // y una dirección del servicio de avisos de prueba.
  await ctx.addInitScript(() => {
    let current = null;
    const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    PushManager.prototype.getSubscription = async () => current;
    PushManager.prototype.subscribe = async (options) => {
      const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
      const json = {
        endpoint: `https://localhost:54340/push/${crypto.randomUUID()}`,
        expirationTime: null,
        keys: { p256dh: b64url(await crypto.subtle.exportKey('raw', pair.publicKey)), auth: b64url(crypto.getRandomValues(new Uint8Array(16))) },
      };
      window.__vapidKeyLength = options.applicationServerKey.byteLength;
      current = { endpoint: json.endpoint, toJSON: () => json, unsubscribe: async () => ((current = null), true) };
      return current;
    };
  });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('dialog', (d) => d.accept());
  return p;
}
async function setup(p, url) {
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.getByPlaceholder(/Código \(mínimo/).fill('clave-segura-1');
  await p.getByPlaceholder('Repite el código').fill('clave-segura-1');
  await p.getByRole('button', { name: 'Crear código' }).click();
  await skipRecovery(p);
}
async function enablePush(p) {
  await p.getByLabel('Ajustes').click();
  await p.getByRole('button', { name: 'Activar en este teléfono' }).click();
  await p.getByText(/✅ Activados en este teléfono/).waitFor({ timeout: 15000 });
  await p.getByLabel('Cerrar').click();
  return p.evaluate(() => JSON.parse(localStorage.getItem('miGestor.settings')).pushEndpoint);
}

const A = await phone();
await setup(A, BASE_URL);
await A.getByRole('navigation').getByRole('button', { name: 'Grupo' }).click();
await A.getByRole('button', { name: 'Crear grupo' }).click();
await A.getByPlaceholder('https://xxxx.supabase.co').fill(SERVER);
await A.getByPlaceholder('sb_publishable_…').fill('sb_publishable_test');
await A.getByRole('button', { name: /Probar conexión/ }).click();
await A.getByPlaceholder('Ej.: Tomás').fill('Tomás');
await A.getByRole('dialog').getByRole('button', { name: 'Crear grupo' }).click();
await A.getByRole('button', { name: 'Copiar enlace' }).click();
const link = await A.evaluate(() => navigator.clipboard.readText());
await A.getByLabel('Cerrar').click();

const B = await phone();
await setup(B, link);
await B.getByPlaceholder('Ej.: Tomás').fill('Valentina');
await B.getByRole('button', { name: 'Unirme al grupo' }).click();
await B.locator('.member', { hasText: 'Tomás' }).waitFor();

// Activar
await A.getByLabel('Ajustes').click();
ok(await A.getByText('Preparar tu Supabase').isVisible(), 'Ajustes ofrece la guía para preparar Supabase');
await A.getByLabel('Cerrar').click();
const endpointA = await enablePush(A);
const endpointB = await enablePush(B);
ok((await A.evaluate(() => window.__vapidKeyLength)) === 65, 'la función entrega una clave VAPID válida (generada sola)');
ok(sql('select count(*) from push_subscriptions') === '2', 'los dos teléfonos quedan registrados');
ok(sql("select count(*) from push_config where public_key is not null and private_key is not null and project_url = 'http://localhost:54321'") === '1', 'claves VAPID y dirección del proyecto guardadas en el servidor');

// Valentina agrega un gasto → aviso solo al teléfono de Tomás
await B.getByRole('button', { name: 'Gasto en común' }).click();
await B.getByPlaceholder('0').fill('20.000');
await B.getByPlaceholder(/Supermercado, cuenta/).fill('Feria');
await B.getByRole('dialog').getByRole('button', { name: 'Guardar' }).click();
const first = await waitFor(async () => (await pushLog()).find((r) => endpointA.endsWith(r.path)));
ok(!!first, 'Tomás recibe un aviso cuando Valentina agrega un gasto');
ok(first?.headers['content-encoding'] === 'aes128gcm' && /^vapid t=.+, k=.+/.test(first?.headers.authorization ?? ''), 'el aviso va cifrado (aes128gcm) y firmado (VAPID)');
ok(first?.bytes > 0 && first?.bytes < 400, `contenido pequeño y genérico (${first?.bytes} bytes cifrados)`);
ok(!(await pushLog()).some((r) => endpointB.endsWith(r.path)), 'Valentina no recibe aviso de su propio gasto');

// Un segundo cambio enseguida no genera otro aviso (máximo 1 cada 20 s)
const before = (await pushLog()).length;
await B.getByRole('button', { name: 'Gasto en común' }).click();
await B.getByPlaceholder('0').fill('5.000');
await B.getByRole('dialog').getByRole('button', { name: 'Guardar' }).click();
await new Promise((r) => setTimeout(r, 6000));
ok((await pushLog()).length === before, 'no satura: un solo aviso cada 20 segundos por persona');

// Pero si enseguida otra persona (Tomás) cambia algo, a Valentina sí le llega su aviso.
await A.getByRole('button', { name: 'Gasto en común' }).click();
await A.getByPlaceholder('0').fill('7.000');
await A.getByRole('dialog').getByRole('button', { name: 'Guardar' }).click();
ok(!!(await waitFor(async () => (await pushLog()).find((r) => endpointB.endsWith(r.path)))), 'el cambio de otra persona dentro de esos 20 s también avisa');

// Recordatorio programado: gasto personal con aviso 1 día antes
await A.getByRole('navigation').getByRole('button', { name: 'Inicio' }).click();
await A.getByRole('button', { name: 'Gasto' }).first().click();
await A.getByPlaceholder('0').fill('15.000');
await A.getByRole('dialog').getByRole('button', { name: /Servicios/ }).click();
const due = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
await A.getByRole('dialog').locator('input[type=date]').first().fill(due);
await A.getByRole('dialog').locator('select').selectOption('1');
await A.getByRole('dialog').getByRole('button', { name: 'Guardar' }).click();
const scheduled = await waitFor(async () => Number(sql(`select count(*) from push_schedule where endpoint = '${endpointA}'`)) >= 1);
ok(!!scheduled, 'el recordatorio queda programado en el servidor (solo la hora)');
ok(/09:00:00/.test(sql(`select to_char(send_at at time zone '${Intl.DateTimeFormat().resolvedOptions().timeZone}', 'HH24:MI:SS') from push_schedule where endpoint = '${endpointA}' limit 1`)), 'programado a las 9:00 del día del aviso');
ok(!/15000|Servicios/.test(sql('select coalesce(string_agg(endpoint || send_at::text, \'\'), \'\') from push_schedule')), 'el servidor no guarda montos ni descripciones');

// Con la clave pública (la que viaja en la invitación) no se puede leer la configuración ni las direcciones.
const anonRpc = (fn, body = {}) => fetch(`${SERVER}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: 'sb_publishable_test', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const denied = await Promise.all([
  anonRpc('mg_push_config'),
  anonRpc('mg_push_due'),
  anonRpc('mg_push_targets', { p_group: 'a'.repeat(64), p_exclude_tag: 'x' }),
  anonRpc('mg_push_remove', { p_endpoint: endpointA }),
  anonRpc('mg_push_set_vapid', { p_public: 'x', p_private: 'y' }),
]);
ok(denied.every((r) => r.status === 401 || r.status === 403), 'la clave pública no puede usar las funciones internas de avisos ' + JSON.stringify(denied.map((r) => r.status)));
const tableRead = await fetch(`${SERVER}/rest/v1/push_config?select=*`, { headers: { apikey: 'sb_publishable_test' } });
ok(tableRead.status === 401 || tableRead.status === 403, 'la clave pública no puede leer las tablas de avisos (' + tableRead.status + ')');

// La tarea programada envía los que tocan
sql(`update push_schedule set send_at = now() - interval '1 minute' where endpoint = '${endpointA}'`);
const secret = sql('select cron_secret from push_config');
const n0 = (await pushLog()).filter((r) => endpointA.endsWith(r.path)).length;
const bad = await fetch(`${SERVER}/functions/v1/mg-push`, { method: 'POST', headers: { apikey: 'x', 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cron', secret: 'falso' }) });
ok(bad.status === 401, 'la tarea programada exige el secreto');
const cron = await (await fetch(`${SERVER}/functions/v1/mg-push`, { method: 'POST', headers: { apikey: 'x', 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cron', secret }) })).json();
ok(cron.sent === 1 && (await pushLog()).filter((r) => endpointA.endsWith(r.path)).length === n0 + 1, 'la tarea programada envía el recordatorio');
ok(sql(`select count(*) from push_schedule where send_at <= now()`) === '0', 'cada recordatorio se envía una sola vez');

// Un teléfono que ya no existe (410) se olvida solo
const gid = sql('select group_id from push_subscriptions limit 1');
sql(`insert into push_subscriptions values ('https://localhost:54340/gone/viejo', '${gid}', '${'f'.repeat(32)}', (select p256dh from push_subscriptions limit 1), (select auth from push_subscriptions limit 1), now())`);
sql("update push_groups set last_notified = now() - interval '1 minute'");
sql("update push_senders set last_notified = now() - interval '1 minute'");
await fetch(`${SERVER}/functions/v1/mg-push`, { method: 'POST', headers: { apikey: 'x', 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'notify', group: gid, tag: 'e'.repeat(32) }) });
ok(sql("select count(*) from push_subscriptions where endpoint like '%/gone/%'") === '0', 'los teléfonos que ya no aceptan avisos se borran');

// El teléfono muestra el aviso aunque la app no lo esté mirando (evento push del service worker)
// (se entrega al service worker ya activado; se escucha antes de activar el dominio para no perder el evento)
const cdp = await A.context().newCDPSession(A);
const regId = new Promise((resolve) => {
  cdp.on('ServiceWorker.workerVersionUpdated', ({ versions }) => {
    const active = versions.find((v) => v.status === 'activated' && v.scriptURL.startsWith(ORIGIN));
    if (active) resolve(active.registrationId);
  });
});
await cdp.send('ServiceWorker.enable');
await cdp.send('ServiceWorker.deliverPushMessage', { origin: ORIGIN, registrationId: await regId, data: JSON.stringify({ title: 'Mi Gestor', body: 'Hay novedades en un grupo compartido.', tag: 'mi-gestor-grupo' }) });
const shown = await waitFor(async () => (await A.evaluate(async () => (await (await navigator.serviceWorker.getRegistration()).getNotifications({ tag: 'mi-gestor-grupo' })).map((n) => n.body)))[0]);
ok(shown === 'Hay novedades en un grupo compartido.', 'el teléfono muestra el aviso genérico');

// Desactivar
await A.getByLabel('Ajustes').click();
await A.getByRole('button', { name: 'Desactivar en este teléfono' }).click();
await A.getByRole('button', { name: 'Activar en este teléfono' }).waitFor();
ok(sql(`select count(*) from push_subscriptions where endpoint = '${endpointA}'`) === '0', 'desactivar borra el registro del teléfono en el servidor');

ok(errors.length === 0, `sin errores ${JSON.stringify(errors)}`);
await b.close();
