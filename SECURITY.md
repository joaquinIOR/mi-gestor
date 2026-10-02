# 🔒 Seguridad de Mi Gestor

Mi Gestor guarda información sensible (finanzas, fotos de carnet y tarjetas, notas). Este documento explica cómo se protege.

## Qué protege y de quién

| Riesgo | Protección |
|---|---|
| Alguien toma tu teléfono desbloqueado | La app pide un **código** o tu **huella / Face ID**. Se bloquea sola al salir o tras un tiempo sin uso, y tiene un botón 🔒 para bloquear al instante. |
| Alguien prueba códigos al azar | Espera obligatoria tras 5 fallos (30 s → 15 min). Opcional: **borrar todo tras 10 fallos**. |
| Alguien copia los archivos del navegador (robo, malware, copia del teléfono) | Todo se guarda **cifrado** con AES-GCM 256. Sin el código, los datos son ilegibles. |
| Se filtra tu copia de seguridad (WhatsApp, correo, Drive) | Las copias siempre se **cifran con una contraseña** propia. |
| Un archivo de copia manipulado | Al importar se valida cada campo; lo que no es válido se descarta. |
| Código malicioso que intente enviar tus datos fuera | La **política de seguridad de contenido (CSP)** prohíbe conectarse a cualquier otro sitio y cargar scripts externos. |
| Otra página que cargue la app de forma oculta (clickjacking) | La app no funciona dentro de un marco (iframe). |
| Miradas indiscretas | Notificaciones sin montos (configurable), número del documento oculto (se vuelve a ocultar en 15 s), portapapeles que se limpia a los 30 s y contenido difuminado en la vista de apps recientes. |

## Cómo funciona el cifrado

1. Al crear tu código se genera al azar una **clave de datos** de 256 bits.
2. Con tu código y PBKDF2-SHA256 (600 000 iteraciones) se obtiene una segunda clave que cifra la clave de datos.
3. Solo se guarda la clave de datos **cifrada**. El código nunca se guarda.
4. Al desbloquear, la clave de datos vive solo en memoria y es **no extraíble**. Al bloquear se descarta.
5. Movimientos, notas, tipos y documentos (incluidas las fotos) se cifran con AES-GCM antes de escribirse en el disco.

### Huella / Face ID

Es opcional (Ajustes → Seguridad). Usa una **passkey** del teléfono con la extensión **WebAuthn PRF**:

- Al activarla se pide tu código y se crea una passkey "Mi Gestor" protegida por la huella o la cara.
- Tras verificarte, el sensor entrega un secreto de 32 bytes que solo existe con tu huella o tu cara. Con él (vía HKDF) se cifra **otra copia** de la clave de datos.
- La huella **no es solo una pantalla**: sin ella esa copia no se puede descifrar. Tu código sigue funcionando siempre.
- Cambiar el código no afecta a la huella. Al desactivarla se borra esa copia (puedes borrar también la passkey del gestor de contraseñas).
- Requiere Android con Chrome actualizado, o iPhone con iOS 18 o posterior. Si el teléfono no admite PRF, la opción no se activa (nunca se usa un método menos seguro).

### Acceso rápido

La notificación fija de acceso rápido y los atajos del icono (**Gasto rápido** / **Ingreso rápido**) no muestran ningún dato: solo abren el formulario, y si la app está bloqueada primero piden el código o la huella.

### Gastos en común (grupo)

Es lo único que sale del teléfono, y solo si creas o te unes a un grupo:

- Cada gasto, pago y perfil del grupo se **cifra en el teléfono** con la clave del grupo (AES-GCM 256, ligada al grupo y a la entrada) antes de enviarse a Supabase. El servidor solo ve un identificador de grupo al azar (256 bits), un identificador de entrada, la fecha de actualización y datos ilegibles.
- La tabla del servidor no se puede leer directamente (seguridad a nivel de fila sin políticas). Solo se accede mediante dos funciones (`supabase/setup.sql`) que exigen conocer el identificador secreto del grupo y no permiten modificar entradas de otro grupo.
- La app solo acepta servidores `https://*.supabase.co` y claves *publishable/anon* (rechaza la *secret*). La política de contenido (CSP) solo permite conectarse a Supabase.
- La **invitación** (enlace o QR) contiene la clave del grupo después de `#`: esa parte nunca se envía a ningún servidor, pero **quien tenga el enlace puede ver y agregar gastos del grupo**. Compártelo solo por un canal privado.
- Lo que llega del servidor se descifra, se valida campo por campo y se ignora si fue manipulado.
- La lista de compras, las cuentas fijas de la casa y los pagos de esas cuentas son entradas del grupo y se cifran igual.
- Tus gastos personales, notas, metas y documentos **nunca** se comparten. «Tu parte» de un gasto en común se calcula en el teléfono; no se envía nada extra.

### Avisos con la app cerrada

Son opcionales y se activan teléfono por teléfono (Ajustes). Usan Web Push del navegador y una función de Supabase (`mg-push`):

- **Los avisos no llevan datos.** El texto es siempre genérico («Hay novedades en un grupo compartido», «Tienes un pago o una cuenta por vencer»). Montos, nombres y descripciones solo se ven al abrir la app.
- El servidor guarda, por teléfono: la dirección de envío que entrega el navegador (*endpoint*) con sus claves públicas, el identificador del grupo, una etiqueta al azar del teléfono y la **hora** de cada recordatorio programado (máximo 60, a 90 días). No guarda qué es cada recordatorio.
- Cada aviso viaja **cifrado** (aes128gcm) y firmado con claves VAPID propias de tu proyecto, que se crean solas y nunca salen de tu Supabase.
- Las tablas de avisos no se pueden leer con la clave *publishable*: el teléfono solo puede registrar, borrar o reprogramar **su propia** dirección mediante funciones. Leer direcciones y enviar es exclusivo de la función `mg-push` (clave de servicio de Supabase, que nunca está en la app).
- La tarea programada (cada 10 minutos) necesita un secreto que solo conoce la base de datos. Los avisos de novedades del grupo tienen un límite de uno cada 20 segundos por grupo, y cada recordatorio se envía una sola vez.
- Al desactivar los avisos, o cuando el navegador informa que el teléfono ya no los acepta, se borra su registro del servidor.

### Exportar a Excel

El botón **Exportar a Excel** (Movimientos → Resumen) descarga un CSV con tus movimientos **sin cifrar**, para abrirlo en Excel o Google Sheets. La app avisa antes de descargarlo. Guárdalo en un lugar seguro y bórralo cuando ya no lo uses. Las celdas de texto que empiezan con `=`, `+`, `-` o `@` se neutralizan para que una descripción no pueda ejecutarse como fórmula en la hoja de cálculo.

Todo usa la Web Crypto API del navegador. Los datos personales no salen del teléfono, salvo en la copia de seguridad o el archivo de Excel que tú descargas. Los gastos en común viajan cifrados (ver arriba).

### Código de recuperación

- Al crear el código se genera un **código de recuperación** de 32 caracteres (160 bits al azar) que cifra otra copia de la clave de datos (vía HKDF). Se muestra una sola vez y no se guarda en el teléfono.
- Con él, desde «¿Olvidaste tu código?», se define un código nuevo sin perder datos. Sus intentos fallidos cuentan para la espera obligatoria.
- Se puede crear o reemplazar desde Ajustes (el anterior deja de servir). Quien tenga **este código y tu teléfono** podría entrar: guárdalo como una contraseña.

### Protección contra borrado

La app pide al navegador almacenamiento persistente (`navigator.storage.persist`) para que el sistema no borre los datos al liberar espacio, recomienda instalarla (en iPhone, Safari borra los datos de webs no instaladas tras 7 días sin uso) y recuerda hacer una copia de seguridad cada 30 días.

## Límites (léelos)

- **Si olvidas el código y también el código de recuperación, no hay forma de recuperar los datos personales.** Haz copias de seguridad cifradas y guarda su contraseña en un lugar seguro.
- Un código corto solo de números (por ejemplo, de 6 cifras) se puede adivinar con un ordenador si alguien **copia** los datos cifrados. Usa 8 o más caracteres con letras.
- Si el teléfono tiene malware con control total mientras la app está **desbloqueada**, ninguna app web puede evitarlo. Mantén el sistema actualizado y el teléfono con bloqueo de pantalla.
- Sin los avisos con la app cerrada activados, los recordatorios solo aparecen al abrir la app. Con ellos, llegan alrededor de las 9:00 (la tarea revisa cada 10 minutos), y dependen de que el sistema del teléfono no bloquee las notificaciones.
- El archivo de Excel exportado **no está cifrado**.
- La espera tras intentos fallidos protege el uso normal de la app; la protección real frente a quien copia los archivos es el cifrado y la longitud de tu código.

## Reportar un problema

Abre un *issue* en este repositorio describiendo el problema, sin incluir datos personales.
