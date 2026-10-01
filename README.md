# 📱 Mi Gestor

App personal para el teléfono: controla **gastos e ingresos**, programa **recordatorios**, mira todo en un **calendario**, guarda tus **documentos** (carnet, tarjetas…) y escribe **notas**.

Funciona como una app instalada (icono propio, pantalla completa) y **sin conexión**. Los datos se guardan solo en tu teléfono, **cifrados y protegidos con tu código**; no hay servidor ni cuenta. Detalles en [SECURITY.md](SECURITY.md).

## ✨ Funciones

- **Gastos e ingresos:** monto, tipo (Comida, Transporte, Sueldo… o tus propios tipos) y una descripción corta.
- **Repetición:** una vez, diario, semanal o mensual, con fecha final opcional.
- **Recordatorios:** el mismo día, 1 día antes o 3 días antes. Aparecen en Inicio y como notificación al abrir la app.
- **Resumen mensual:** balance, ingresos, gastos y gastos por tipo.
- **Calendario:** puntos verdes (ingresos) y rojos (gastos) en cada día; toca un día para ver o agregar movimientos.
- **Mis documentos:** fotos de carnet, tarjetas, licencia, pasaporte, seguro… con número oculto (•••• 1234), botón para copiarlo y aviso de vencimiento.
- **Notas:** rápidas, con colores, fijadas arriba y búsqueda.
- **Seguridad:** código de bloqueo, cifrado AES-256 de todos los datos, bloqueo automático, límite de intentos y borrado opcional tras 10 fallos.
- **Ajustes:** moneda, tema claro/oscuro, copia de seguridad **cifrada** (exportar/importar) y borrar datos.

## 📲 Instalar en el teléfono

1. En GitHub: **Settings → Pages → Source: GitHub Actions**.
2. Sube los cambios a `main`. El workflow *Deploy to GitHub Pages* publica la app en `https://<tu-usuario>.github.io/<nombre-del-repo>/`.
3. Abre esa dirección en el teléfono:
   - **Android (Chrome):** menú ⋮ → **Instalar aplicación**.
   - **iPhone (Safari):** botón Compartir → **Añadir a pantalla de inicio**.

> Haz de vez en cuando una **copia de seguridad cifrada** (Ajustes → Exportar). Si olvidas tu código, borras los datos del navegador o cambias de teléfono, con ella lo recuperas todo.

## 🛠️ Desarrollo

```bash
npm install
npm run dev      # abre en el PC y, en la misma Wi-Fi, en el teléfono con la URL "Network"
npm run lint
npm run build
```

Hecho con React + Vite. Sin dependencias de servidor.
