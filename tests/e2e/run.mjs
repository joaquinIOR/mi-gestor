// Ejecuta todas las pruebas de extremo a extremo:  npm test
// Para incluir los gastos en común: SYNC_PG_URI=postgres://usuario:clave@host:puerto/db POSTGREST_BIN=/ruta/postgrest npm test
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { startSyncServer, SYNC_URL } from '../server/start.mjs';

const PORT = 4199;
const BASE_URL = `http://localhost:${PORT}/mi-gestor/`;
const DIST = 'tests/e2e/.dist';
const env = { ...process.env, BASE_PATH: '/mi-gestor/' };

console.log('▶ Compilando versión de prueba…');
execSync(`npx vite build --outDir ${DIST} --emptyOutDir --logLevel warn`, {
  stdio: 'inherit',
  env: { ...env, VITE_ALLOW_LOCAL_SYNC: '1', CSP_EXTRA_CONNECT: SYNC_URL },
});

const preview = spawn('npx', ['vite', 'preview', '--outDir', DIST, '--port', String(PORT), '--strictPort'], { env, stdio: 'ignore' });
for (let i = 0; i < 60; i += 1) {
  try {
    if ((await fetch(BASE_URL)).ok) break;
  } catch {
    // aún arrancando
  }
  await new Promise((ok) => setTimeout(ok, 250));
}

const withSync = !!(process.env.SYNC_PG_URI && process.env.POSTGREST_BIN);
const stopSync = withSync ? await startSyncServer() : null;

const only = process.argv.slice(2);
const suites = fs
  .readdirSync('tests/e2e')
  .filter((f) => f.endsWith('.test.mjs'))
  .filter((f) => !only.length || only.some((o) => f.includes(o)))
  .sort();

let failures = 0;
const summary = [];
for (const file of suites) {
  if (file.startsWith('grupo') && !withSync) {
    summary.push(`⏭  ${file}: omitida (falta SYNC_PG_URI y POSTGREST_BIN)`);
    continue;
  }
  console.log(`\n▶ ${file}`);
  const code = await new Promise((done) => {
    const child = spawn('node', [path.join('tests/e2e', file)], { env: { ...env, BASE_URL }, stdio: 'inherit' });
    child.on('exit', done);
  });
  if (code !== 0) failures += 1;
  summary.push(`${code === 0 ? '✅' : '❌'} ${file}`);
}

preview.kill();
stopSync?.();
console.log(`\n${summary.join('\n')}`);
process.exit(failures ? 1 : 0);
