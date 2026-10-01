import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // BASE_PATH permite publicar en un subdirectorio (p. ej. GitHub Pages: /mi-gestor/)
  base: process.env.BASE_PATH || '/',
  plugins: [react()],
  // host: true deja abrir la app desde el teléfono en la misma red Wi-Fi
  server: { host: true },
  preview: { host: true },
})
