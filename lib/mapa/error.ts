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

/** Mensajes propios de las colecciones: pisan a los del sitio (TW013 y TW060 significan otra cosa aquí). */
const MENSAJES_COLECCION: Record<string, string> = {
  TW013: 'Solo quien creó la colección puede cambiar su visibilidad.',
  TW060: 'Esta colección ya no existe.',
  TW054: 'Una colección compartida no puede volver a ser privada.',
  TW061: 'La colección de un plan se borra con el plan.',
  '23503': 'Esa colección o ese sitio ya no existe.',
  '23514': 'La colección de un plan siempre es visible para los dos.',
};

/** Mensajes propios de las visitas (`place_visits`): pisan a los del sitio (23505 y 23514 significan otra cosa aquí). */
const MENSAJES_VISITA: Record<string, string> = {
  '23505': 'Ya teníais apuntada una visita ese día.',
  '23514': 'Revisa la fecha o acorta la nota (200 caracteres como mucho).',
  TW065: 'La fecha de la visita no puede ser futura.',
};

/** Qué se estaba guardando: cambia el texto de algunos códigos. `true` equivale a `'coleccion'`. */
export type ContextoErrorMapa = 'sitio' | 'coleccion' | 'visita';

/** Código del servidor (`error.code`) de un error cualquiera, si lo trae. */
export const codigoDe = (error: unknown): string | undefined => (error as { code?: string } | null)?.code;

/** Texto listo para mostrar. Un código sin traducción da el mensaje genérico (nunca `error.message`). */
export function mensajeErrorMapa(error: unknown, contexto: ContextoErrorMapa | boolean = 'sitio'): string {
  if (esErrorDeRed(error)) return SIN_CONEXION;
  const codigo = codigoDe(error);
  if (!codigo) return ERROR_GENERICO;
  const propios: Record<string, string> = contexto === true || contexto === 'coleccion' ? MENSAJES_COLECCION : contexto === 'visita' ? MENSAJES_VISITA : {};
  return propios[codigo] || MENSAJES[codigo] || ERROR_GENERICO;
}
