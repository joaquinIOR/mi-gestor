// Servidor de sincronización de prueba, equivalente a Supabase: PostgreSQL + PostgREST + una puerta
// de entrada que atiende /rest/v1/* con CORS. Requiere SYNC_PG_URI (superusuario) y POSTGREST_BIN.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

export const SYNC_URL = 'http://localhost:54321';
const PGRST_PORT = 3010;

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
  psql(['-f', path.resolve('supabase/setup.sql')]);
  psql(['-c', 'truncate public.shared_entries']);

  const conf = path.join(os.tmpdir(), 'mi-gestor-pgrst.conf');
  fs.writeFileSync(
    conf,
    [
      `db-uri = "postgres://authenticator:pw@${uri.hostname}:${uri.port || 5432}${uri.pathname}"`,
      'db-schemas = "public"',
      'db-anon-role = "anon"',
      `server-port = ${PGRST_PORT}`,
      'jwt-secret = "clave-de-prueba-de-al-menos-32-caracteres!"',
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
      if (!req.url.startsWith('/rest/v1/')) return res.writeHead(404, cors).end();
      if (!req.headers.apikey) return res.writeHead(401, cors).end('{"message":"No API key found"}');
      const headers = { ...req.headers };
      delete headers.apikey;
      delete headers.host;
      const upstream = http.request({ host: 'localhost', port: PGRST_PORT, path: req.url.slice(8), method: req.method, headers }, (r) => {
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
  return () => {
    pgrst.kill();
    gateway.close();
  };
}
