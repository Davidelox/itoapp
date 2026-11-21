/** Lógica pura del hilo que une a la pareja en la cabecera del Inicio (components/inicio/HiloPareja.tsx). */

/** Caracteres máximos de un nombre bajo su avatar; más largo se recorta con «…». */
export const MAX_NOMBRE = 9;

/** Recorta un nombre a `max` caracteres (espacios sobrantes fuera, «…» al final si no cabe). Vacío: cadena vacía. */
export function recortarNombre(nombre: string, max = MAX_NOMBRE): string {
  const n = nombre.trim().replace(/\s+/g, ' ');
  if (n.length <= max) return n;
  return n.slice(0, max - 1).trimEnd() + '…';
}

/**
 * Los nombres bajo los avatares son lo último que se sacrifica: con letra grande (`fontScale`) o en pantallas muy
 * estrechas se quitan para que quepan el título y los avatares con el hilo.
 */
export function mostrarNombres(anchoPantalla: number, fontScale: number): boolean {
  return anchoPantalla >= 350 && fontScale <= 1.2;
}

/** Etiqueta del botón único de la cabecera. */
export function etiquetaCabecera(yo: string, otra: string | null): string {
  const a = yo.trim() || 'tú';
  const b = otra?.trim();
  return b ? `Ajustes y pareja: ${a} y ${b}` : `Ajustes y pareja: ${a}, tu pareja aún no se ha unido`;
}
