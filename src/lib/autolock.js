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
