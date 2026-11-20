/** «Mi ubicación» (docs/plan-mapa.md §6): estados y textos. La posición no se guarda ni se envía: solo centra el mapa. */
export type EstadoUbicacion = 'libre' | 'buscando' | 'denegado' | 'apagado' | 'error';

/** Zoom al centrar en el usuario (calle/barrio). */
export const DELTA_UBICACION = 0.01;

/** Resultado de pedir el permiso, reducido a lo que necesita la pantalla. */
export function estadoTrasPermiso(concedido: boolean): EstadoUbicacion {
  return concedido ? 'buscando' : 'denegado';
}

export function textoAviso(estado: EstadoUbicacion): string | null {
  switch (estado) {
    case 'denegado':
      return 'Sin permiso de ubicación. Puedes activarlo en Ajustes; solo se usa para centrar el mapa y nunca se guarda.';
    case 'apagado':
      return 'El servicio de ubicación está apagado. Actívalo en los ajustes del móvil.';
    case 'error':
      return 'No hemos podido obtener tu ubicación. Inténtalo de nuevo.';
    default:
      return null;
  }
}

/** Solo en «denegado» tiene sentido el enlace a Ajustes. */
export function ofreceAjustes(estado: EstadoUbicacion): boolean {
  return estado === 'denegado' || estado === 'apagado';
}
