// Mi Gestor · función de Supabase que envía los avisos (Web Push).
// Crear en Supabase → Edge Functions → "Deploy a new function" → nombre: mg-push → pegar este código.
// Desactivar "Verify JWT" (la app usa la clave publishable). No necesita configurar secretos:
// las claves de envío (VAPID) se generan solas la primera vez y quedan guardadas en la base de datos.
//
// Los avisos nunca llevan datos personales: solo un texto genérico.
import webpush from 'npm:web-push@3.6.7';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:avisos@mi-gestor.app';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MESSAGES = {
  group: { title: 'Mi Gestor', body: 'Hay novedades en un grupo compartido.', tag: 'mi-gestor-grupo' },
  reminder: { title: 'Mi Gestor', body: 'Tienes un pago o una cuenta por vencer. Abre Mi Gestor para ver el detalle.', tag: 'mi-gestor-recordatorio' },
};

async function rpc(fn: string, body: Record<string, unknown> = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${fn}: ${res.status} ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

let config: { public_key: string; private_key: string; cron_secret: string } | null = null;

async function getConfig() {
  if (config?.public_key) return config;
  let cfg = await rpc('mg_push_config');
  if (!cfg.public_key) {
    const keys = webpush.generateVAPIDKeys();
    await rpc('mg_push_set_vapid', { p_public: keys.publicKey, p_private: keys.privateKey });
    cfg = await rpc('mg_push_config');
  }
  webpush.setVapidDetails(SUBJECT, cfg.public_key, cfg.private_key);
  config = cfg;
  return cfg;
}

type Target = { endpoint: string; p256dh: string; auth: string };

async function sendAll(targets: Target[], message: Record<string, string>) {
  let sent = 0;
  await Promise.all(
    targets.map(async (t) => {
      try {
        await webpush.sendNotification({ endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } }, JSON.stringify(message), {
          TTL: 12 * 3600,
          urgency: 'normal',
        });
        sent += 1;
      } catch (err) {
        // El teléfono ya no acepta avisos (app desinstalada o permiso quitado): se olvida.
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await rpc('mg_push_remove', { p_endpoint: t.endpoint });
        else console.error('No se pudo enviar un aviso:', status ?? '', (err as Error).message);
      }
    })
  );
  return sent;
}

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'método no permitido' }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const cfg = await getConfig();

    if (body.action === 'key') return json({ publicKey: cfg.public_key });

    if (body.action === 'notify') {
      if (typeof body.group !== 'string' || !/^[0-9a-f]{64}$/.test(body.group) || typeof body.tag !== 'string') return json({ error: 'datos inválidos' }, 400);
      const targets = await rpc('mg_push_targets', { p_group: body.group, p_exclude_tag: body.tag });
      return json({ sent: await sendAll(targets, MESSAGES.group) });
    }

    if (body.action === 'cron') {
      if (body.secret !== cfg.cron_secret) return json({ error: 'no autorizado' }, 401);
      const due = await rpc('mg_push_due');
      return json({ sent: await sendAll(due, MESSAGES.reminder) });
    }

    return json({ error: 'acción desconocida' }, 400);
  } catch (err) {
    console.error(err);
    return json({ error: 'error interno' }, 500);
  }
});
