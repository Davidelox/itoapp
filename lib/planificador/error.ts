/** Errores del Planificador en español. Sin red ni React: solo traduce el código del servidor (nunca `error.message`). */
import { esErrorDeRed } from '@/lib/auth/errores';
import { ERROR_GENERICO, SIN_CONEXION, codigoDe } from '@/lib/mapa/error';

const MENSAJES: Record<string, string> = {
  TW012: 'El bote común no está activo. Elige otra forma de pagar.',
  TW060: 'Este plan ya no existe.',
  TW064: 'Ese sitio ya no está disponible.',
  // Itinerario (F6): elemento fuera de las fechas del plan; move_plan con una versión vieja; plan_id solo al crear.
  TW067: 'Ese día está fuera de las fechas del plan. Elige uno del plan.',
  TW068: 'Tu pareja ha cambiado el plan mientras tanto. Revisa las fechas y vuelve a guardar.',
  TW069: 'Un evento no puede cambiar de plan. Bórralo y créalo en el otro plan.',
  '23503': 'El plan o el sitio ya no existe.',
  '23514': 'Revisa las fechas (un plan dura como mucho 60 días) y el reparto.',
};

export function mensajeErrorPlan(error: unknown): string {
  if (esErrorDeRed(error)) return SIN_CONEXION;
  const codigo = codigoDe(error);
  return (codigo && MENSAJES[codigo]) || ERROR_GENERICO;
}
