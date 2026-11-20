/** Estado del permiso de avisos tal y como lo enseña Ajustes. */
export type EstadoPermiso = 'concedido' | 'pendiente' | 'denegado' | 'no_disponible';

/** Estado del sistema (`granted`, `undetermined`, `denied`) a nuestro estado. */
export function estadoPermisoDe(status: string | null | undefined, canAskAgain = true): EstadoPermiso {
  if (status === 'granted') return 'concedido';
  if (status === 'denied') return canAskAgain ? 'pendiente' : 'denegado';
  if (status === 'undetermined') return 'pendiente';
  return 'no_disponible';
}

export const AVISO_EXPO_GO = 'Los avisos necesitan la app instalada, no funcionan en Expo Go.';

/** Push remoto: solo en la app instalada (no Expo Go, no web) y en un dispositivo real. */
export function puedeRecibirPushDe(e: { web: boolean; expoGo: boolean; dispositivoReal: boolean }): boolean {
  return !e.web && !e.expoGo && e.dispositivoReal;
}

export function textoEstadoPermiso(estado: EstadoPermiso, enExpoGo: boolean): string {
  if (estado === 'no_disponible') return enExpoGo ? AVISO_EXPO_GO : 'Los avisos solo funcionan en la app del móvil.';
  if (estado === 'concedido') return 'Activados en este móvil';
  if (estado === 'denegado') return 'Desactivados en los ajustes del móvil';
  return 'Sin activar en este móvil';
}

/** Cada interruptor de Ajustes → Avisos con su columna de `couple_members`. */
export const AVISOS = [
  { campo: 'notify_payment_reminder', titulo: 'Cobros y pagos', ayuda: 'Cobros próximos e importes variables sin poner.' },
  { campo: 'notify_events', titulo: 'Eventos y cumpleaños', ayuda: 'El recordatorio que elijas en cada evento.' },
  { campo: 'notify_who_paid', titulo: '¿Quién pagó?', ayuda: 'Al terminar un evento que lo pregunta.' },
  { campo: 'notify_partner_expense', titulo: 'Gastos de tu pareja', ayuda: 'Cuando añade un gasto compartido.' },
  { campo: 'notify_settlements', titulo: 'Liquidaciones', ayuda: 'Cuando te piden confirmar un pago o responden al tuyo.' },
  { campo: 'notify_requests', titulo: 'Peticiones de tu pareja', ayuda: 'Pedir borrar algo o cambiar los ajustes.' },
] as const;

export type CampoAviso = (typeof AVISOS)[number]['campo'];
export type PreferenciasAvisos = Record<CampoAviso, boolean>;

/** Fila de `couple_members` → preferencias. Lo que falte (columna sin leer) cuenta como activado, como en el servidor. */
export function aPreferencias(fila: Partial<Record<CampoAviso, unknown>> | null | undefined): PreferenciasAvisos {
  const r = {} as PreferenciasAvisos;
  for (const { campo } of AVISOS) r[campo] = fila?.[campo] !== false;
  return r;
}
