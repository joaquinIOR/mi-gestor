# 📱 Mi Gestor

App personal para el teléfono: controla **gastos e ingresos**, programa **recordatorios**, mira todo en un **calendario**, guarda tus **documentos** (carnet, tarjetas…) y escribe **notas**.

Funciona como una app instalada (icono propio, pantalla completa) y **sin conexión**. Los datos se guardan solo en tu teléfono, **cifrados y protegidos con tu código**; no hay cuenta. Solo los gastos en común (opcionales) pasan por un servidor, y van cifrados. Detalles en [SECURITY.md](SECURITY.md).

## ✨ Funciones

- **Tienes hoy (saldo real):** escribe una vez cuánto tienes y Mi Gestor suma y resta cada ingreso y gasto **cuando llega su fecha** (no antes), de un mes a otro. Debajo se ve lo que falta: «Por recibir +X · Por pagar −Y» y cómo terminaría el mes. El día en que algo programado debía llegar o cobrarse, Inicio pregunta **«¿Ya te llegó?» / «¿Ya se cobró?»**: mientras no respondas cuenta como ocurrido; «Todavía no» lo saca del saldo y vuelve a preguntar al día siguiente; «Cambiar fecha» lo mueve (en una repetición, solo esa vez). En los grupos cuenta lo que sale de tu bolsillo (lo que pagaste completo y los pagos entre integrantes). Puedes ajustar el saldo cuando quieras.
- **Gastos e ingresos:** monto, tipo (Comida, Transporte, Sueldo… o tus propios tipos) y una descripción corta. Antes de guardar se muestra cómo quedará el monto («15,990» → $15.990), con botones **Hoy / Ayer**, **frecuentes** (lo que anotas seguido, con un toque) y **Duplicar**. Al guardar aparece una confirmación breve, y un borrado se puede **deshacer**.
- **Repetición:** una vez, diario, semanal, mensual o **anual** (SOAP, permiso de circulación…), con fecha final opcional. Al cambiar o borrar una repetición puedes elegir **«desde esta fecha»** sin tocar los meses pasados.
- **Compras en cuotas:** anota el total y el número de cuotas; cada mes aparece «Pago 3 de 12».
- **Recordatorios:** el mismo día, 1 o 3 días antes, 1 o 2 semanas antes, o los días que elijas (hasta 60). Aparecen en Inicio y como notificación al abrir la app, y también **con la app cerrada** si activas los avisos (ver abajo).
- **Movimientos:** busca por descripción, tipo, tarjeta o monto en todos los meses, sin importar tildes, con el total de los últimos 12 meses. Lo programado para más adelante en el mes se marca como «Programado».
- **Resumen mensual:** balance, ingresos y gastos; **gráfico de los últimos 6 meses**, comparación de cada tipo de gasto con el mes anterior y botón **Exportar a Excel** (archivo CSV de los últimos 24 meses, **sin cifrar**: guárdalo con cuidado).
- **Metas de ahorro:** por ejemplo «Vacaciones · $500.000 para diciembre». Registra aportes o retiros (y corrige uno mal escrito) y mira el progreso y cuánto necesitas ahorrar al mes para llegar a tiempo.
- **«Ya lo pagué»:** en «Próximos recordatorios» marca un pago como hecho y deja de avisar ese mes (si lo pagaste antes de su fecha, ya sale de tu saldo).
- **Barra de presupuesto:** define un tope mensual (por ejemplo, tu sueldo) y mira cuánto llevas gastado. Cada tipo de gasto suma un tramo con su color; lo programado para lo que queda del mes va aparte, en un tramo rayado. Toca un tramo para ver su monto y porcentaje. Cuando un gasto te hace **superar el presupuesto** aparece una alerta (y el teléfono vibra); opcionalmente también un aviso previo al 80 % o 90 %.
- **Pagos de tarjeta:** desde el Calendario, registra el pago mensual de tus tarjetas (lista de tarjetas de crédito, débito y prepago habituales en Chile, o una propia) con su aviso. Solo se guarda el nombre de la tarjeta, nunca el número.
- **Calendario:** puntos verdes (ingresos) y rojos (gastos) en cada día; toca un día para ver o agregar movimientos.
- **Mis documentos:** fotos de carnet, tarjetas, licencia, pasaporte, seguro… con número oculto (•••• 1234), botón para copiarlo y aviso de vencimiento (también en Inicio y como notificación, 30 días antes).
- **Notas:** rápidas, con colores, fijadas arriba y búsqueda.
- **Seguridad:** código de bloqueo y **desbloqueo con huella / Face ID**, cifrado AES-256 de todos los datos, bloqueo automático, límite de intentos y borrado opcional tras 10 fallos.
- **Acceso rápido:** notificación fija con botones **− Gasto** / **+ Ingreso** y atajos al mantener pulsado el icono (Android). El formulario rápido solo pide monto, tipo y descripción.
- **Gastos en común en tiempo real:** crea un grupo (por ejemplo, «Casa»), invita a la familia con un QR o un enlace y registren gastos compartidos: todos ven al instante lo que agrega cada persona, quién pagó, cuánto se deben y pueden registrar pagos para quedar a mano. Cifrado de extremo a extremo con Supabase (plan gratuito); ver `supabase/setup.sql`.
  - Las divisiones son **exactas en pesos** ($10.000 entre 3 = $3.334 + $3.333 + $3.333), así nadie queda con «Te deben $1».
  - **Tu parte** de cada gasto en común se suma sola a tus gastos del mes, a tu presupuesto y al Calendario (se puede apagar en Ajustes).
  - **Cuentas fijas de la casa** (luz, agua, internet, arriendo…): de todo el grupo (también de quien se una después), con día de vencimiento y aviso. Quien la paga la marca como pagada para **el mes que corresponde** (si quedó la del mes pasado, aparece primero); si dos personas tocan «Pagar» a la vez, queda un solo pago.
  - **Lista de compras compartida:** agrega, marca y borra productos (con «Deshacer»); «Registrar compra» toma lo que marcaste tú.
  - Si cambias de teléfono, al abrir la invitación puedes **retomar tu perfil** («¿Ya eras parte? Toca tu nombre») en vez de quedar dos veces. Se puede **quitar a un integrante** (tocando su nombre) y **salir** del grupo sin dejar «fantasmas».
  - Si dos teléfonos cambian lo mismo (por ejemplo, uno sin señal), gana el cambio más reciente y un borrado es definitivo.
- **Avisos con la app cerrada (opcional):** recordatorios, preguntas del saldo («¿Ya te llegó?», a las 20:00), cuentas de la casa y novedades del grupo llegan como notificación aunque la app esté cerrada. Los avisos son genéricos («Tienes un pago por vencer o un movimiento por confirmar»): nunca muestran montos ni nombres.
- **Temas de color:** Menta, Rosa pastel, Lavanda, Celeste pastel, Cielo, Durazno, Salvia, Coral, Índigo y Grafito, cada uno en modo claro y oscuro (contraste verificado).
- **Ajustes:** moneda, tema de color, modo claro/oscuro, **tamaño de letra** (normal, grande, muy grande), renombrar o borrar tus tipos de gasto e ingreso, copia de seguridad **cifrada** (exportar/importar, con tus preferencias; al restaurar se muestra qué trae y de qué fecha es) y borrar datos.
- **App instalada:** abre **sin conexión desde la primera visita**, avisa cuando hay una **versión nueva**, y el botón **Atrás** de Android cierra el panel abierto (si escribiste algo, pregunta antes de descartarlo) en vez de salir de la app.

## 📲 Instalar en el teléfono

1. La app compilada se publica en la rama `gh-pages` (Settings → Pages → *Deploy from a branch* → `gh-pages`), en `https://<tu-usuario>.github.io/<nombre-del-repo>/`.
   Todas las páginas de GitHub Pages de una misma cuenta comparten el dominio `https://<tu-usuario>.github.io`: publica ahí solo Mi Gestor (o usa una cuenta u organización aparte para otras páginas).
2. Abre esa dirección en el teléfono:
   - **Android (Chrome):** menú ⋮ → **Instalar aplicación**.
   - **iPhone (Safari):** botón Compartir → **Añadir a pantalla de inicio**. Hazlo **antes** de crear tu código: en iPhone, Safari y la app instalada guardan sus datos por separado (la app lo explica al abrirla en Safari).

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
huella, saldo real, presupuesto, alertas, temas, tarjetas, recuperación, resumen, metas, montos y fechas, datos y copias, uso sin
conexión y botón Atrás, gastos en común (integrantes, conflictos, cuentas de la casa) y avisos. Las de gastos en
común necesitan PostgreSQL y PostgREST, y la de avisos además Deno:
`SYNC_PG_URI=postgres://… POSTGREST_BIN=/ruta/postgrest DENO_BIN=/ruta/deno npm test` (si faltan, se omiten).
Para correr solo algunas: `npm test grupo` o `npm test presupuesto temas`.
En GitHub: **Actions → Pruebas → Run workflow**.

### Servidor para gastos en común (opcional)

1. Crea un proyecto gratis en [supabase.com](https://supabase.com).
2. En **SQL Editor**, ejecuta [`supabase/setup.sql`](supabase/setup.sql).
3. En la app: **Grupo → Crear grupo**, pega la *Project URL* y la clave *publishable* (nunca la *secret*).

> **Al actualizar Mi Gestor**, vuelve a ejecutar `setup.sql` (y `push.sql`, si usas los avisos) en el SQL Editor: se pueden
> ejecutar más de una vez y aplican las mejoras de seguridad del servidor sin tocar los datos.

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
los recordatorios pendientes (llegan alrededor de las 9:00 del día del aviso; las preguntas del saldo, alrededor de las 20:00).

Si ejecutaste una versión anterior de `push.sql` (antes de octubre de 2026), vuelve a ejecutarla: corrige un permiso que dejaba
leer la configuración de avisos con la clave *publishable*. Por precaución, después renueva las claves de envío ejecutando en el
SQL Editor `update public.push_config set public_key = null, private_key = null, cron_secret = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '') where id = 1; truncate public.push_subscriptions, public.push_schedule;`,
vuelve a desplegar la función `mg-push` y, en cada teléfono, desactiva y activa los avisos.

Hecho con React + Vite.
