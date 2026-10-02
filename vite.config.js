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

// https://vite.dev/config/
export default defineConfig({
  // BASE_PATH permite publicar en un subdirectorio (p. ej. GitHub Pages: /mi-gestor/)
  base: process.env.BASE_PATH || '/',
  plugins: [react(), securityPolicy],
  // host: true deja abrir la app desde el teléfono en la misma red Wi-Fi
  server: { host: true },
  preview: { host: true },
})
