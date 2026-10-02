// Utilidades comunes de las pruebas de extremo a extremo (teléfono simulado con Playwright).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const BASE_URL = process.env.BASE_URL ?? 'http://localhost:4199/mi-gestor/';
export const ORIGIN = new URL(BASE_URL).origin;
export const ARTIFACTS = path.resolve('tests/e2e/.artifacts');
fs.mkdirSync(ARTIFACTS, { recursive: true });

let passed = 0;
let failed = 0;
export function ok(condition, message) {
  if (condition) passed += 1;
  else failed += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'} ${message}`);
  if (!condition) process.exitCode = 1;
}
process.on('exit', () => console.log(`RESUMEN ${passed} ok, ${failed} fallos`));

// Tras crear el código, la app muestra el código de recuperación: se confirma y se continúa.
export async function skipRecovery(page) {
  await page.getByRole('heading', { name: 'Tu código de recuperación' }).waitFor({ timeout: 20000 });
  const code = await page.locator('.recovery-code').getAttribute('data-code');
  await page.getByRole('switch', { name: /Ya lo guardé/ }).check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  return code;
}

// Consulta la base de datos del servidor de sincronización de prueba (solo para la prueba de grupos).
export function sql(query) {
  return execFileSync('psql', [process.env.SYNC_PG_URI, '-tA', '-c', query]).toString().trim();
}
