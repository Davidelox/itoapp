/** Tareas sugeridas por tipo de plan (docs/plan-planificador.md §F3). Fijas, no editables. Sin red ni React. */
import type { FilaTarea, TipoPlan, TipoTarea } from '@/lib/planificador/tipos';

export type Sugerida = { titulo: string; tipo: TipoTarea };

export const PLANTILLAS: Record<TipoPlan, readonly Sugerida[]> = {
  trip: [
    { titulo: 'Vuelos', tipo: 'booking' },
    { titulo: 'Alojamiento', tipo: 'booking' },
    { titulo: 'Coche', tipo: 'booking' },
    { titulo: 'Seguro de viaje', tipo: 'booking' },
    { titulo: 'Actividades', tipo: 'booking' },
  ],
  celebration: [
    { titulo: 'Regalo', tipo: 'task' },
    { titulo: 'Reserva', tipo: 'booking' },
    { titulo: 'Invitaciones', tipo: 'task' },
  ],
  other: [],
};

/** Máximo de sugeridas de cualquier tipo (ids de cliente que se fijan al abrir el formulario). */
export const MAX_SUGERIDAS = Math.max(...Object.values(PLANTILLAS).map((p) => p.length));

/** Las que siguen marcadas: todas salvo las desmarcadas, por título. */
export const elegidas = (tipo: TipoPlan, desmarcadas: readonly string[]): Sugerida[] => PLANTILLAS[tipo].filter((s) => !desmarcadas.includes(s.titulo));

export const alternarSugerida = (desmarcadas: readonly string[], titulo: string): string[] =>
  desmarcadas.includes(titulo) ? desmarcadas.filter((t) => t !== titulo) : [...desmarcadas, titulo];

/** Filas listas para insertar, sin asignar ni fecha, con `position` correlativo desde `desde`. El id de cada una es el de su hueco. */
export function filasSugeridas(sugeridas: readonly Sugerida[], ids: readonly string[], desde = 0) {
  return sugeridas.map((s, i) => ({
    id: ids[i],
    position: desde + i,
    ...({ kind: s.tipo, title: s.titulo, detail: null, assignee: null, due_date: null, place_id: null } satisfies FilaTarea),
  }));
}
