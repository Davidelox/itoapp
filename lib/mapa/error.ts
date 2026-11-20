/** Errores del Mapa en español (docs/plan-mapa.md §4). Sin red ni React: solo traduce el código del servidor. */
import { esErrorDeRed } from '@/lib/auth/errores';

export const SIN_CONEXION = 'No hay conexión. Inténtalo de nuevo.';
export const ERROR_GENERICO = 'No se ha podido guardar. Inténtalo de nuevo.';

const MENSAJES: Record<string, string> = {
  '23505': 'Ya está en vuestro mapa.',
  TW013: 'Solo quien guardó el sitio puede cambiar su visibilidad.',
  TW053: 'Un sitio compartido no puede volver a ser privado.',
  TW060: 'Este sitio ya no existe.',
  TW062: 'Esta solicitud ya está resuelta o ha caducado.',
  TW063: 'Esta solicitud la tiene que aprobar tu pareja.',
  TW064: 'Ese sitio ya no está disponible.',
};

/** Código del servidor (`error.code`) de un error cualquiera, si lo trae. */
export const codigoDe = (error: unknown): string | undefined => (error as { code?: string } | null)?.code;

/** Texto listo para mostrar. Un código sin traducción da el mensaje genérico (nunca `error.message`). */
export function mensajeErrorMapa(error: unknown): string {
  if (esErrorDeRed(error)) return SIN_CONEXION;
  const codigo = codigoDe(error);
  return (codigo && MENSAJES[codigo]) || ERROR_GENERICO;
}
