# 📱 Mi Gestor

App personal para el teléfono: controla **gastos e ingresos**, programa **recordatorios**, mira todo en un **calendario**, guarda tus **documentos** (carnet, tarjetas…) y escribe **notas**.

Funciona como una app instalada (icono propio, pantalla completa) y **sin conexión**. Los datos se guardan solo en tu teléfono, **cifrados y protegidos con tu código**; no hay cuenta. Solo los gastos en común (opcionales) pasan por un servidor, y van cifrados. Detalles en [SECURITY.md](SECURITY.md).

## ✨ Funciones

- **Gastos e ingresos:** monto, tipo (Comida, Transporte, Sueldo… o tus propios tipos) y una descripción corta.
- **Repetición:** una vez, diario, semanal o mensual, con fecha final opcional.
- **Recordatorios:** el mismo día, 1 o 3 días antes, 1 o 2 semanas antes, o los días que elijas (hasta 60). Aparecen en Inicio y como notificación al abrir la app, y también **con la app cerrada** si activas los avisos (ver abajo).
- **Movimientos:** busca por descripción, tipo o tarjeta en todos los meses.
- **Resumen mensual:** balance, ingresos y gastos; **gráfico de los últimos 6 meses**, comparación de cada tipo de gasto con el mes anterior y botón **Exportar a Excel** (archivo CSV de los últimos 24 meses, **sin cifrar**: guárdalo con cuidado).
- **Metas de ahorro:** por ejemplo «Vacaciones · $500.000 para diciembre». Registra aportes o retiros y mira el progreso y cuánto necesitas ahorrar al mes para llegar a tiempo.
- **Barra de presupuesto:** define un tope mensual (por ejemplo, tu sueldo) y mira cuánto llevas gastado. Cada tipo de gasto suma un tramo con su color; toca un tramo para ver su monto y porcentaje. Cuando un gasto te hace **superar el presupuesto** aparece una alerta (y el teléfono vibra); opcionalmente también un aviso previo al 80 % o 90 %.
- **Pagos de tarjeta:** desde el Calendario, registra el pago mensual de tus tarjetas (lista de tarjetas de crédito, débito y prepago habituales en Chile, o una propia) con su aviso. Solo se guarda el nombre de la tarjeta, nunca el número.
- **Calendario:** puntos verdes (ingresos) y rojos (gastos) en cada día; toca un día para ver o agregar movimientos.
- **Mis documentos:** fotos de carnet, tarjetas, licencia, pasaporte, seguro… con número oculto (•••• 1234), botón para copiarlo y aviso de vencimiento.
- **Notas:** rápidas, con colores, fijadas arriba y búsqueda.
- **Seguridad:** código de bloqueo y **desbloqueo con huella / Face ID**, cifrado AES-256 de todos los datos, bloqueo automático, límite de intentos y borrado opcional tras 10 fallos.
- **Acceso rápido:** notificación fija con botones **− Gasto** / **+ Ingreso** y atajos al mantener pulsado el icono (Android). El formulario rápido solo pide monto, tipo y descripción.
- **Gastos en común en tiempo real:** crea un grupo (por ejemplo, «Casa»), invita a la familia con un QR o un enlace y registren gastos compartidos: cada una ve al instante lo que las otras agregan, quién pagó, cuánto se deben y puede registrar pagos para quedar a mano. Cifrado de extremo a extremo con Supabase (plan gratuito); ver `supabase/setup.sql`.
  - **Tu parte** de cada gasto en común se suma sola a tus gastos del mes y a tu presupuesto (se puede apagar en Ajustes).
  - **Cuentas fijas de la casa** (luz, agua, internet, arriendo…): con día de vencimiento y aviso; quien la paga la marca como pagada y se registra como gasto del grupo.
  - **Lista de compras compartida:** agrega, marca y borra productos; todas ven los cambios al instante.
- **Avisos con la app cerrada (opcional):** recordatorios, cuentas de la casa y novedades del grupo llegan como notificación aunque la app esté cerrada. Los avisos son genéricos («Tienes un pago por vencer»): nunca muestran montos ni nombres.
- **Temas de color:** Menta, Rosa pastel, Lavanda, Celeste pastel, Cielo, Durazno, Salvia, Coral, Índigo y Grafito, cada uno en modo claro y oscuro (contraste verificado).
- **Ajustes:** moneda, tema de color, modo claro/oscuro, **tamaño de letra** (normal, grande, muy grande), renombrar o borrar tus tipos de gasto e ingreso, copia de seguridad **cifrada** (exportar/importar) y borrar datos.

## 📲 Instalar en el teléfono

1. La app compilada se publica en la rama `gh-pages` (Settings → Pages → *Deploy from a branch* → `gh-pages`), en `https://<tu-usuario>.github.io/<nombre-del-repo>/`.
2. Abre esa dirección en el teléfono:
   - **Android (Chrome):** menú ⋮ → **Instalar aplicación**.
   - **iPhone (Safari):** botón Compartir → **Añadir a pantalla de inicio**.

> Al crear tu código recibirás un **código de recuperación**: guárdalo, sirve si olvidas tu código. Haz también de vez en cuando una **copia de seguridad cifrada** (Ajustes → Exportar). Si olvidas tu código, borras los datos del navegador o cambias de teléfono, con ella lo recuperas todo.

## 🛠️ Desarrollo

```bash
npm install
npm run dev      # abre en el PC y, en la misma Wi-Fi, en el teléfono con la URL "Network"
npm run lint
npm run build
npm test         # pruebas de extremo a extremo en un teléfono simulado (Playwright)
```

Las pruebas (`tests/e2e`) compilan la app, la abren en Chromium con tamaño de teléfono y revisan seguridad, cifrado,
huella, presupuesto, alertas, temas, tarjetas, recuperación, resumen, metas, gastos en común y avisos. Las de gastos en
común necesitan PostgreSQL y PostgREST, y la de avisos además Deno:
`SYNC_PG_URI=postgres://… POSTGREST_BIN=/ruta/postgrest DENO_BIN=/ruta/deno npm test` (si faltan, se omiten).
Para correr solo algunas: `npm test grupo` o `npm test presupuesto temas`.
En GitHub: **Actions → Pruebas → Run workflow**.

### Servidor para gastos en común (opcional)

1. Crea un proyecto gratis en [supabase.com](https://supabase.com).
2. En **SQL Editor**, ejecuta [`supabase/setup.sql`](supabase/setup.sql).
3. En la app: **Grupo → Crear grupo**, pega la *Project URL* y la clave *publishable* (nunca la *secret*).

### Avisos con la app cerrada (opcional)

Usan el mismo proyecto de Supabase. Lo prepara una sola vez quien creó el grupo (la app muestra estos pasos en
**Ajustes → Avisos con la app cerrada**, con botones para copiar el código):

1. En **SQL Editor**, ejecuta [`supabase/push.sql`](supabase/push.sql).
2. En **Edge Functions → Deploy a new function → Via Editor**, crea la función `mg-push` con el código de
   [`supabase/functions/mg-push/index.ts`](supabase/functions/mg-push/index.ts) y pulsa **Deploy**.
3. En la función `mg-push` → **Details**, desactiva **Verify JWT** (la función revisa sus propios permisos).
4. En cada teléfono: **Ajustes → Avisos con la app cerrada → Activar en este teléfono** y acepta el permiso.
   En iPhone primero hay que instalar la app (Añadir a pantalla de inicio) y tener iOS 16.4 o posterior.

Las claves de envío (VAPID) se crean solas la primera vez, y una tarea programada (`pg_cron`) revisa cada 10 minutos
los recordatorios pendientes (llegan alrededor de las 9:00 del día del aviso).

Hecho con React + Vite.
