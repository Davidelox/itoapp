/** Traducción neutra de los errores de Supabase Auth: las pantallas nunca muestran `error.message`. */

export type Resultado = { ok: true } | { ok: false; mensaje: string; reintentarEn?: number; codigo?: string };

export const MENSAJES = {
  credenciales: 'El email o la contraseña no son correctos.',
  noConfirmado: 'Confirma tu email para entrar. Te enviamos un código.',
  contrasenaDebil: 'Tu contraseña necesita al menos 8 caracteres, con letras y números.',
  codigoInvalido: 'El código no es válido o ha caducado. Pide uno nuevo.',
  demasiados: 'Has hecho demasiados intentos. Espera unos minutos.',
  sinConexion: 'No hay conexión. Inténtalo de nuevo.',
  servidor: 'Ahora mismo no podemos completarlo. Inténtalo en unos minutos.',
  otro: 'Algo ha fallado. Inténtalo de nuevo.',
  mismaContrasena: 'Elige una contraseña distinta a la anterior.',
} as const;

type ErrorAuth = { code?: unknown; status?: unknown; name?: unknown; message?: unknown };

const esTexto = (v: unknown): v is string => typeof v === 'string';

/** ¿Es un fallo de red (sin respuesta del servidor)? Un 5xx sí es respuesta: el servidor falló. */
export function esErrorDeRed(error: unknown): boolean {
  const e = (typeof error === 'object' && error !== null ? error : {}) as ErrorAuth;
  if (typeof e.status === 'number' && e.status >= 500) return false;
  if (e.name === 'AuthRetryableFetchError') return true;
  if (e.name === 'TypeError' || e.name === 'AuthUnknownError') return true;
  return e.status === 0;
}

/** ¿Respondió el servidor con un fallo propio (5xx)? En el alta suele ser el envío del correo. */
export function esErrorDeServidor(error: unknown): boolean {
  const e = (typeof error === 'object' && error !== null ? error : {}) as ErrorAuth;
  return typeof e.status === 'number' && e.status >= 500;
}

/** Texto para mostrar. Se decide solo por `code`, `status` y `name`; el `message` no se mira. */
export function traducirErrorAuth(error: unknown): string {
  const e = (typeof error === 'object' && error !== null ? error : {}) as ErrorAuth;
  const code = esTexto(e.code) ? e.code : '';
  if (code === 'invalid_credentials') return MENSAJES.credenciales;
  if (code === 'email_not_confirmed') return MENSAJES.noConfirmado;
  if (code === 'weak_password') return MENSAJES.contrasenaDebil;
  if (code === 'same_password') return MENSAJES.mismaContrasena;
  if (code === 'otp_expired' || code === 'otp_disabled' || code === 'validation_failed') return MENSAJES.codigoInvalido;
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || e.status === 429) {
    return MENSAJES.demasiados;
  }
  if (esErrorDeServidor(error)) return MENSAJES.servidor;
  if (esErrorDeRed(error)) return MENSAJES.sinConexion;
  return MENSAJES.otro;
}

/** ¿El error indica que el código no valía (y no un fallo de red o un límite)? */
export function esCodigoNoValido(error: unknown): boolean {
  const e = (typeof error === 'object' && error !== null ? error : {}) as ErrorAuth;
  return traducirErrorAuth(error) === MENSAJES.codigoInvalido || e.status === 403 || e.status === 400 || e.status === 422;
}
