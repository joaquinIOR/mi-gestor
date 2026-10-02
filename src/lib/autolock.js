// Al elegir una foto o un archivo, el teléfono deja la app en segundo plano.
// Esto evita que ese momento cuente como "salir de la app" para el bloqueo automático.
// La gracia dura como máximo 2 minutos y se termina al volver o al elegir el archivo.
let allowedUntil = 0;

export const allowBackgroundBriefly = () => {
  allowedUntil = Date.now() + 2 * 60 * 1000;
};

export const backgroundAllowed = () => Date.now() < allowedUntil;

export const graceUntil = () => allowedUntil;

export const endBackgroundAllowance = () => {
  allowedUntil = 0;
};

// Mientras se muestra un código de recuperación nuevo (hay que anotarlo), la app no se bloquea sola:
// si se bloqueara antes de «Continuar», ese código no quedaría activo. Como máximo 10 minutos.
let heldSince = 0;
export const holdAutoLock = (on) => {
  heldSince = on ? Date.now() : 0;
};
export const autoLockHeld = () => heldSince > 0 && Date.now() - heldSince < 10 * 60 * 1000;
