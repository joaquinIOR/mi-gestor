// Servidor de sincronización de prueba, equivalente a Supabase: PostgreSQL + PostgREST + una puerta
// de entrada que atiende /rest/v1/* con CORS. Requiere SYNC_PG_URI (superusuario) y POSTGREST_BIN.
import { spawn, execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';

export const SYNC_URL = 'http://localhost:54321';
export const PUSH_SERVICE = 'https://localhost:54340';
const PGRST_PORT = 3010;
const FUNCTION_PORT = 8000;
const JWT_SECRET = 'clave-de-prueba-de-al-menos-32-caracteres!';

// Token de la clave de servicio (como el SUPABASE_SERVICE_ROLE_KEY de Supabase).
function serviceKey() {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const body = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ role: 'service_role', exp: Math.floor(Date.now() / 1000) + 86400 })}`;
  return `${body}.${crypto.createHmac('sha256', JWT_SECRET).update(body).digest('base64url')}`;
}

// Servicio de avisos simulado (hace el papel de los servidores de Google/Apple): guarda lo que recibe.
function startPushService() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-push-'));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=localhost', '-keyout', `${dir}/key.pem`, '-out', `${dir}/cert.pem`], { stdio: 'ignore' });
  const received = [];
  const server = https
    .createServer({ key: fs.readFileSync(`${dir}/key.pem`), cert: fs.readFileSync(`${dir}/cert.pem`) }, (req, res) => {
      if (req.url === '/__log') return res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(received));
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        received.push({ path: req.url, headers: req.headers, bytes: Buffer.concat(chunks).length, at: Date.now() });
        res.writeHead(req.url.startsWith('/gone/') ? 410 : 201).end();
      });
    })
    .listen(54340);
  return server;
}

const psql = (args) => execFileSync('psql', [process.env.SYNC_PG_URI, '-v', 'ON_ERROR_STOP=1', '-q', ...args], { stdio: 'pipe' });

export async function startSyncServer() {
  const uri = new URL(process.env.SYNC_PG_URI);
  psql([
    '-c',
    `do $$ begin
      if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
      if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
      if not exists (select from pg_roles where rolname = 'authenticator') then create role authenticator login password 'pw' noinherit; end if;
    end $$;
    grant anon to authenticator;
    grant usage on schema public to anon, authenticated;`,
  ]);
  psql(['-c', `do $$ begin
      if not exists (select from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
    end $$;
    grant service_role to authenticator;
    grant usage on schema public to service_role;`]);
  // Igual que Supabase: todo lo nuevo en "public" queda permitido a anon/authenticated salvo que el SQL lo quite.
  psql(['-c', `alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;`]);
  psql(['-f', path.resolve('supabase/setup.sql')]);
  psql(['-f', path.resolve('supabase/push.sql')]);
  psql(['-c', 'truncate public.shared_entries, public.push_subscriptions, public.push_schedule, public.push_groups, public.push_senders']);

  const conf = path.join(os.tmpdir(), 'mi-gestor-pgrst.conf');
  fs.writeFileSync(
    conf,
    [
      `db-uri = "postgres://authenticator:pw@${uri.hostname}:${uri.port || 5432}${uri.pathname}"`,
      'db-schemas = "public"',
      'db-anon-role = "anon"',
      `server-port = ${PGRST_PORT}`,
      `jwt-secret = "${JWT_SECRET}"`,
    ].join('\n')
  );
  const pgrst = spawn(process.env.POSTGREST_BIN, [conf], { stdio: 'ignore' });

  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'apikey, authorization, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };
  const gateway = http
    .createServer((req, res) => {
      if (req.method === 'OPTIONS') return res.writeHead(204, cors).end();
      const isFunction = req.url.startsWith('/functions/v1/mg-push');
      if (isFunction && !process.env.DENO_BIN) return res.writeHead(404, cors).end();
      if (!req.url.startsWith('/rest/v1/') && !isFunction) return res.writeHead(404, cors).end();
      if (!req.headers.apikey) return res.writeHead(401, cors).end('{"message":"No API key found"}');
      const headers = { ...req.headers };
      delete headers.apikey;
      delete headers.host;
      const target = isFunction ? { port: FUNCTION_PORT, path: '/' } : { port: PGRST_PORT, path: req.url.slice(8) };
      const upstream = http.request({ host: 'localhost', ...target, method: req.method, headers }, (r) => {
        const passthrough = Object.fromEntries(Object.entries(r.headers).filter(([k]) => !k.startsWith('access-control-')));
        res.writeHead(r.statusCode, { ...passthrough, ...cors });
        r.pipe(res);
      });
      upstream.on('error', () => res.writeHead(502, cors).end());
      req.pipe(upstream);
    })
    .listen(54321);

  for (let i = 0; i < 50; i += 1) {
    try {
      const r = await fetch(`http://localhost:${PGRST_PORT}/`);
      if (r.ok) break;
    } catch {
      // PostgREST aún arrancando
    }
    await new Promise((ok) => setTimeout(ok, 200));
  }
  // Función de avisos (Deno) y servicio de avisos simulado, si hay Deno disponible.
  let fn = null;
  let pushService = null;
  if (process.env.DENO_BIN) {
    pushService = startPushService();
    fn = spawn(
      process.env.DENO_BIN,
      ['run', '--no-lock', '--node-modules-dir=none', '--allow-net', '--allow-env', '--allow-read', '--unsafely-ignore-certificate-errors=localhost', path.resolve('supabase/functions/mg-push/index.ts')],
      // Se ejecuta fuera del proyecto para que Deno descargue web-push como en Supabase (sin node_modules).
      { cwd: os.tmpdir(), env: { ...process.env, SUPABASE_URL: SYNC_URL, SUPABASE_SERVICE_ROLE_KEY: serviceKey() }, stdio: process.env.DEBUG_PUSH ? 'inherit' : 'ignore' }
    );
    for (let i = 0; i < 150; i += 1) {
      try {
        await fetch(`http://localhost:${FUNCTION_PORT}/`, { method: 'OPTIONS' });
        break;
      } catch {
        await new Promise((ok) => setTimeout(ok, 200));
      }
    }
  }
  return () => {
    pgrst.kill();
    gateway.close();
    fn?.kill();
    pushService?.close();
  };
}
