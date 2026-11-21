/** Lógica pura de las tareas y reservas de un plan (docs/plan-planificador.md §F3). Sin red ni React. */
import { diaMesCorto } from '@/lib/calendario/rejilla';
import type { FilaTarea, Tarea, TipoTarea } from '@/lib/planificador/tipos';

export const MAX_TITULO_TAREA = 120;
export const MAX_NOTA_TAREA = 200;

export const TIPOS_TAREA: readonly { valor: TipoTarea; etiqueta: string }[] = [
  { valor: 'task', etiqueta: 'Tarea' },
  { valor: 'booking', etiqueta: 'Reserva' },
];

/** Pendientes primero (con fecha antes que sin ella, por fecha y `position`), luego las hechas por `position`. */
export function ordenarTareas<T extends Pick<Tarea, 'status' | 'due_date' | 'position'>>(tareas: T[]): T[] {
  const clave = (t: T) => (t.due_date ?? '9999-99-99');
  return [...tareas].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'pending' ? -1 : 1;
    if (a.status === 'pending' && clave(a) !== clave(b)) return clave(a) < clave(b) ? -1 : 1;
    return a.position - b.position;
  });
}

/** «1 de 3 hechas»; `null` si no hay tareas (no se pinta). */
export function contadorTareas(tareas: Pick<Tarea, 'status'>[]): string | null {
  if (tareas.length === 0) return null;
  const hechas = tareas.filter((t) => t.status === 'done').length;
  return `${hechas} de ${tareas.length} ${tareas.length === 1 ? 'hecha' : 'hechas'}`;
}

export const pendientesDe = (tareas: Pick<Tarea, 'status'>[]): number => tareas.filter((t) => t.status === 'pending').length;

/** Posición de una tarea nueva: al final de las del plan. */
export const siguientePosicion = (tareas: Pick<Tarea, 'position'>[]): number => tareas.reduce((m, t) => Math.max(m, t.position + 1), 0);

/** Agrupa por plan (una sola lectura de `plan_tasks` sirve a la lista y al detalle). */
export function tareasPorPlan(tareas: Tarea[]): Map<string, Tarea[]> {
  const mapa = new Map<string, Tarea[]>();
  for (const t of tareas) mapa.set(t.plan_id, [...(mapa.get(t.plan_id) ?? []), t]);
  return mapa;
}

/** Estado de edición de una tarea. `asignada`: a quién (relativo a quien mira) o nadie. */
export type FormularioTarea = {
  titulo: string;
  tipo: TipoTarea;
  asignada: 'yo' | 'pareja' | null;
  fecha: string | null;
  nota: string;
  sitio: string | null;
};

export const formularioTareaNuevo = (): FormularioTarea => ({ titulo: '', tipo: 'task', asignada: null, fecha: null, nota: '', sitio: null });

export function formularioDeTarea(t: Tarea, yo: 'm1' | 'm2'): FormularioTarea {
  return {
    titulo: t.title,
    tipo: t.kind,
    asignada: t.assignee === null ? null : t.assignee === yo ? 'yo' : 'pareja',
    fecha: t.due_date,
    nota: t.detail ?? '',
    sitio: t.place_id,
  };
}

/** Solo las reservas llevan sitio: al pasar a «Tarea» se descarta. */
export function filaDeTarea(f: FormularioTarea, yo: 'm1' | 'm2'): FilaTarea {
  const otra = yo === 'm1' ? 'm2' : 'm1';
  return {
    kind: f.tipo,
    title: f.titulo.trim(),
    detail: f.nota.trim() || null,
    assignee: f.asignada === 'yo' ? yo : f.asignada === 'pareja' ? otra : null,
    due_date: f.fecha,
    place_id: f.tipo === 'booking' ? f.sitio : null,
  };
}

export function errorTitulo(titulo: string): string | null {
  const n = titulo.trim().length;
  if (n === 0) return 'Escribe un título.';
  if (n > MAX_TITULO_TAREA) return `El título admite hasta ${MAX_TITULO_TAREA} caracteres.`;
  return null;
}

export function errorNotaTarea(nota: string): string | null {
  return nota.trim().length > MAX_NOTA_TAREA ? `La nota admite hasta ${MAX_NOTA_TAREA} caracteres.` : null;
}

/** Quién aparece en la segunda línea de una fila y de qué color: `de` es relativo a quien mira. */
export type LineaTarea = { prefijo: string; nombre: string | null; de: 'yo' | 'pareja' | null; fecha: string | null };

/** «Asignada · Tú», «Asignada · María», «Hecho por ti», «Hecho por María»; sin asignar y pendiente: «Sin asignar». */
export function lineaTarea(t: Tarea, yo: { slot: 'm1' | 'm2'; userId: string }, nombrePareja: string): LineaTarea {
  const fecha = t.due_date && t.status === 'pending' ? diaMesCorto(t.due_date) : null;
  if (t.status === 'done') {
    if (!t.done_by) return { prefijo: 'Hecha', nombre: null, de: null, fecha: null };
    return t.done_by === yo.userId
      ? { prefijo: 'Hecho por ', nombre: 'ti', de: 'yo', fecha: null }
      : { prefijo: 'Hecho por ', nombre: nombrePareja, de: 'pareja', fecha: null };
  }
  if (t.assignee === null) return { prefijo: 'Sin asignar', nombre: null, de: null, fecha };
  return t.assignee === yo.slot ? { prefijo: 'Asignada · ', nombre: 'Tú', de: 'yo', fecha } : { prefijo: 'Asignada · ', nombre: nombrePareja, de: 'pareja', fecha };
}

/** «Reservar cena, reserva, asignada a ti, pendiente, para el 12 dic». */
export function etiquetaTarea(t: Tarea, yo: { slot: 'm1' | 'm2'; userId: string }, nombrePareja: string): string {
  const l = lineaTarea(t, yo, nombrePareja);
  const quien =
    t.status === 'done'
      ? l.nombre
        ? `hecha por ${l.nombre}`
        : 'hecha'
      : t.assignee === null
        ? 'sin asignar, pendiente'
        : `asignada a ${l.de === 'yo' ? 'ti' : nombrePareja}, pendiente`;
  return [t.title, t.kind === 'booking' ? 'reserva' : null, quien, l.fecha ? `para el ${l.fecha}` : null].filter(Boolean).join(', ');
}

export const etiquetaMarcar = (t: Pick<Tarea, 'title' | 'status'>): string =>
  t.status === 'done' ? `Marcar como pendiente: ${t.title}` : `Marcar como hecha: ${t.title}`;

export type ChipsTarjeta = { hechas: string[]; masHechas: number; siguiente: string | null };

/** Chips de la tarjeta: hasta `max` tareas hechas (+N) y la siguiente pendiente asignada a quien mira («Reservar cena — Tú»). */
export function chipsTarjeta(tareas: Tarea[], yo: 'm1' | 'm2', max = 2): ChipsTarjeta {
  const ordenadas = ordenarTareas(tareas);
  const hechas = ordenadas.filter((t) => t.status === 'done');
  const mia = ordenadas.find((t) => t.status === 'pending' && t.assignee === yo);
  return {
    hechas: hechas.slice(0, max).map((t) => t.title),
    masHechas: Math.max(0, hechas.length - max),
    siguiente: mia ? `${mia.title} — Tú` : null,
  };
}
