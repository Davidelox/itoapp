/**
 * Relevo del hilo entre la pantalla de inicio y la barra de pestañas: la barra publica dónde
 * descansa su hilo (el ancla) y el splash avisa cuando le entrega el tramo final.
 * Es un almacén mínimo a nivel de módulo; no guarda nada entre arranques.
 */

/** Largo del hilo de la barra en reposo y su grosor, en píxeles. El splash termina con estas medidas. */
export const ANCHO_INDICADOR = 52;
export const GROSOR_INDICADOR = 2.25;

/** Centro del hilo de la barra en reposo, en coordenadas de la ventana. */
export type AnclaHilo = { x: number; y: number };

let ancla: AnclaHilo | null = null;
const oyentesAncla = new Set<() => void>();

export function publicarAncla(nueva: AnclaHilo) {
  if (ancla && Math.abs(ancla.x - nueva.x) < 0.25 && Math.abs(ancla.y - nueva.y) < 0.25) return;
  ancla = nueva;
  oyentesAncla.forEach((oyente) => oyente());
}

/** Última ancla publicada, o null si la barra aún no se ha medido. Estable entre cambios (useSyncExternalStore). */
export function leerAncla(): AnclaHilo | null {
  return ancla;
}

export function suscribirAncla(oyente: () => void): () => void {
  oyentesAncla.add(oyente);
  return () => oyentesAncla.delete(oyente);
}

let medidor: (() => void) | null = null;

/** La barra de pestañas registra cómo volver a medir su ancla. Devuelve la función para darse de baja. */
export function registrarMedidor(medir: () => void): () => void {
  medidor = medir;
  return () => {
    if (medidor === medir) medidor = null;
  };
}

/** Pide a la barra que vuelva a medir y publicar su ancla (si está montada). */
export function pedirAncla() {
  medidor?.();
}

// Al arrancar la app siempre hay un splash que entregará el hilo; hasta entonces la barra lo espera sin rizo.
let entregaPendiente = true;
const oyentesEntrega = new Set<() => void>();

/** ¿Sigue la barra esperando a que el splash le entregue el hilo? */
export function hayEntregaPendiente(): boolean {
  return entregaPendiente;
}

/** El splash ha dejado el hilo en la barra (o se ha saltado): la barra puede hacer su rizo. Solo cuenta la primera vez. */
export function entregarHilo() {
  if (!entregaPendiente) return;
  entregaPendiente = false;
  oyentesEntrega.forEach((oyente) => oyente());
}

export function alEntregarHilo(oyente: () => void): () => void {
  oyentesEntrega.add(oyente);
  return () => oyentesEntrega.delete(oyente);
}
