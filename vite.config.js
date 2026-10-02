import crypto from 'node:crypto'
import fs from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Política de seguridad: la app solo puede cargar sus propios archivos y no puede enviar datos a ningún otro sitio.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' blob:",
  "font-src 'self'",
  // Solo se permite conectar con la propia app y con Supabase (gastos en común, cifrados).
  `connect-src 'self' https://*.supabase.co${process.env.CSP_EXTRA_CONNECT ? ` ${process.env.CSP_EXTRA_CONNECT}` : ''}`,
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

// Solo en la versión publicada: el modo desarrollo de Vite necesita scripts en línea.
const securityPolicy = {
  name: 'security-policy',
  apply: 'build',
  transformIndexHtml: (html) =>
    html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
}

// Genera sw.js con la versión y la lista exacta de archivos de esta compilación, para que la app
// abra sin conexión desde la primera visita y cada publicación se instale completa de una vez.
const serviceWorker = {
  name: 'service-worker',
  apply: 'build',
  enforce: 'post',
  generateBundle(_, bundle) {
    const files = Object.keys(bundle).filter((f) => f.startsWith('assets/'))
    const iconNames = fs.readdirSync('public/icons').sort()
    const icons = iconNames.map((f) => `icons/${f}`)
    const precache = ['./', 'manifest.webmanifest', ...icons, ...files]
    const template = fs.readFileSync('src/service-worker.js', 'utf8')
    const hash = crypto.createHash('sha256').update(template)
    for (const name of Object.keys(bundle).sort()) {
      const item = bundle[name]
      hash.update(name).update(item.type === 'chunk' ? item.code : item.source)
    }
    hash.update(fs.readFileSync('public/manifest.webmanifest'))
    for (const f of iconNames) hash.update(f).update(fs.readFileSync(`public/icons/${f}`))
    const source = template
      .replace('__VERSION__', hash.digest('hex').slice(0, 12))
      .replace('[/* __PRECACHE__ */]', JSON.stringify(precache))
    this.emitFile({ type: 'asset', fileName: 'sw.js', source })
  },
}

// https://vite.dev/config/
export default defineConfig({
  // BASE_PATH permite publicar en un subdirectorio (p. ej. GitHub Pages: /mi-gestor/)
  base: process.env.BASE_PATH || '/',
  plugins: [react(), securityPolicy, serviceWorker],
  // host: true deja abrir la app desde el teléfono en la misma red Wi-Fi
  server: { host: true },
  preview: { host: true },
})
