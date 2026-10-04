// Compartir Mi Gestor: solo el enlace de la app (sin invitaciones ni nada de esta sesión), así quien lo abra
// empieza con su app vacía.
export const appLink = () => `${window.location.origin}${import.meta.env.BASE_URL}`;

export const SHARE_TEXT =
  'Te recomiendo Mi Gestor: una app gratis para anotar gastos e ingresos, ver cuánta plata tienes hoy, recordar pagos y guardar tus documentos. Todo queda cifrado en tu propio teléfono. Pruébala aquí:';
