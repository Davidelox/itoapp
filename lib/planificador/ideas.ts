/** Ideas del Planificador (docs/plan-planificador.md §F8): cosas «para cuando os apetezca», sin fecha. Lógica pura, sin red ni React. */
import { MAX_ICONO, pareceEmoji } from '@/lib/mapa/colecciones';
import { MAX_NOTAS_PLAN, etiquetaTipo, iconoDeTipo } from '@/lib/planificador/plan';
import type { TipoPlan } from '@/lib/planificador/tipos';

export const MAX_TITULO_IDEA = 120;
export const MAX_NOTAS_IDEA = MAX_NOTAS_PLAN;

/** Fila de `ideas` tal como la lee la app. El icono puede faltar en la base: entonces vale el del tipo. */
export type Idea = {
  id: string;
  title: string;
  icon: string | null;
  type: TipoPlan;
  place_id: string | null;
  notes: string | null;
  created_by: string | null;
  version: number;
  created_at: string;
};

/** Lo que se escribe en `ideas` al crear o editar. */
export type FilaIdea = Pick<Idea, 'title' | 'icon' | 'type' | 'place_id' | 'notes'>;

export type FormularioIdea = { titulo: string; tipo: TipoPlan; icono: string; nota: string; sitio: string | null };

export const formularioIdeaNuevo = (): FormularioIdea => ({ titulo: '', tipo: 'trip', icono: iconoDeTipo('trip'), nota: '', sitio: null });

export const iconoDeIdea = (i: Pick<Idea, 'icon' | 'type'>): string => i.icon ?? iconoDeTipo(i.type);

export const formularioDeIdea = (i: Idea): FormularioIdea => ({ titulo: i.title, tipo: i.type, icono: iconoDeIdea(i), nota: i.notes ?? '', sitio: i.place_id });

/** Cambia el tipo; el icono lo acompaña solo si aún era el del tipo anterior (no se pisa uno elegido). */
export const conTipoIdea = (f: FormularioIdea, tipo: TipoPlan): FormularioIdea => ({
  ...f,
  tipo,
  icono: f.icono === iconoDeTipo(f.tipo) ? iconoDeTipo(tipo) : f.icono,
});

export type ErroresIdea = { titulo: string | null; icono: string | null; nota: string | null };

export function validarIdea(f: FormularioIdea): ErroresIdea {
  const titulo = f.titulo.trim();
  return {
    titulo: titulo.length === 0 ? 'Ponle un título a la idea.' : titulo.length > MAX_TITULO_IDEA ? `El título admite hasta ${MAX_TITULO_IDEA} letras.` : null,
    icono: pareceEmoji(f.icono) && Array.from(f.icono).length <= MAX_ICONO ? null : 'Elige un icono: uno de los sugeridos o un emoji del teclado.',
    nota: f.nota.trim().length > MAX_NOTAS_IDEA ? `La nota admite hasta ${MAX_NOTAS_IDEA} letras.` : null,
  };
}

export const hayErroresIdea = (e: ErroresIdea) => Object.values(e).some((x) => x !== null);

export function filaDeIdea(f: FormularioIdea): FilaIdea {
  const nota = f.nota.trim();
  return { title: f.titulo.trim(), icon: f.icono, type: f.tipo, place_id: f.sitio, notes: nota === '' ? null : nota };
}

/** Las más recientes primero (a igualdad, por título). */
export const ordenarIdeas = <T extends Pick<Idea, 'created_at' | 'title'>>(ideas: T[]): T[] =>
  [...ideas].sort((a, b) => b.created_at.localeCompare(a.created_at) || a.title.localeCompare(b.title, 'es'));

/** «Viaje · sin fecha». */
export const textoIdea = (i: Pick<Idea, 'type'>): string => `${etiquetaTipo(i.type)} · sin fecha`;

/** Etiqueta de lector de pantalla de una idea. */
export const etiquetaIdea = (i: Pick<Idea, 'title' | 'type' | 'notes'>): string =>
  [i.title, etiquetaTipo(i.type).toLowerCase(), 'sin fecha', i.notes?.trim()].filter(Boolean).join(', ');
