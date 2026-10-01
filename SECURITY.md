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

Todo usa la Web Crypto API del navegador. No hay servidor: los datos nunca salen del teléfono, salvo en la copia de seguridad que tú descargas.

## Límites (léelos)

- **Si olvidas el código no hay recuperación.** Haz copias de seguridad cifradas y guarda su contraseña en un lugar seguro.
- Un código corto solo de números (por ejemplo, de 6 cifras) se puede adivinar con un ordenador si alguien **copia** los datos cifrados. Usa 8 o más caracteres con letras.
- Si el teléfono tiene malware con control total mientras la app está **desbloqueada**, ninguna app web puede evitarlo. Mantén el sistema actualizado y el teléfono con bloqueo de pantalla.
- Los avisos de recordatorio solo aparecen al abrir la app.
- La espera tras intentos fallidos protege el uso normal de la app; la protección real frente a quien copia los archivos es el cifrado y la longitud de tu código.

## Reportar un problema

Abre un *issue* en este repositorio describiendo el problema, sin incluir datos personales.
