/**
 * Precarga del formulario de un plan nuevo desde otra pantalla (docs/plan-planificador.md §F8 y §F10): «Convertir en plan»
 * (una idea) y «Duplicar plan». Llega por parámetros de ruta, que son texto de fuera: se validan uno a uno y lo que no vale se
 * descarta. Sin red ni React.
 */
import { leerEuros } from '@/lib/dinero/importe';
import { MAX_ICONO, pareceEmoji } from '@/lib/mapa/colecciones';
import { sitioDeParametro } from '@/lib/mapa/conexiones';
import type { Idea } from '@/lib/planificador/ideas';
import { iconoDeIdea } from '@/lib/planificador/ideas';
import { MAX_NOMBRE_PLAN, MAX_NOTAS_PLAN, TIPOS_PLAN, type FormularioPlan, formularioDePlan, iconoDeTipo } from '@/lib/planificador/plan';
import type { Plan, TipoPlan } from '@/lib/planificador/tipos';

export type Precarga = Partial<Pick<FormularioPlan, 'tipo' | 'nombre' | 'icono' | 'notas' | 'destino' | 'presupuesto'>> & {
  /** Idea de la que viene: se borra al crear el plan. */
  idea?: string;
  /** Sitio de la idea: va a la colección del plan. */
  sitio?: string;
};

type Parametros = Record<string, string | string[] | undefined>;
const primero = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

/** Parámetros de ruta de «Convertir en plan». */
export function parametrosDeIdea(i: Idea): Record<string, string> {
  const p: Record<string, string> = { idea: i.id, nombre: i.title.slice(0, MAX_NOMBRE_PLAN), tipo: i.type, icono: iconoDeIdea(i) };
  if (i.notes) p.notas = i.notes;
  if (i.place_id) p.sitio = i.place_id;
  return p;
}

/** Parámetros de ruta de «Duplicar plan»: lo reutilizable (sin fechas ni notas). Las tareas sugeridas salen solas por el tipo. */
export function parametrosDePlan(plan: Plan): Record<string, string> {
  const f = formularioDePlan(plan, 'm1');
  const p: Record<string, string> = { nombre: f.nombre, tipo: f.tipo, icono: f.icono };
  if (f.destino) p.destino = f.destino;
  if (f.presupuesto) p.presupuesto = f.presupuesto;
  return p;
}

/** Valida los parámetros de ruta; `null` si no trae nada aprovechable (el formulario queda como uno nuevo). */
export function precargaDeParametros(params: Parametros): Precarga | null {
  const r: Precarga = {};
  const tipo = primero(params.tipo);
  if (TIPOS_PLAN.some((t) => t.valor === tipo)) r.tipo = tipo as TipoPlan;
  const nombre = primero(params.nombre)?.trim().slice(0, MAX_NOMBRE_PLAN);
  if (nombre) r.nombre = nombre;
  const icono = primero(params.icono);
  if (icono && pareceEmoji(icono) && Array.from(icono).length <= MAX_ICONO) r.icono = icono;
  const notas = primero(params.notas)?.slice(0, MAX_NOTAS_PLAN);
  if (notas) r.notas = notas;
  const destino = primero(params.destino)?.trim().slice(0, MAX_NOMBRE_PLAN);
  if (destino) r.destino = destino;
  const presupuesto = primero(params.presupuesto);
  if (presupuesto && leerEuros(presupuesto) !== null) r.presupuesto = presupuesto;
  const idea = sitioDeParametro(primero(params.idea));
  if (idea) r.idea = idea;
  const sitio = sitioDeParametro(primero(params.sitio));
  if (sitio) r.sitio = sitio;
  return Object.keys(r).length === 0 ? null : r;
}

/** Formulario nuevo con la precarga aplicada: sin icono propio, vale el del tipo; una celebración dura un día. */
export function aplicarPrecarga(base: FormularioPlan, pre: Precarga | null): FormularioPlan {
  if (!pre) return base;
  const tipo = pre.tipo ?? base.tipo;
  return {
    ...base,
    tipo,
    nombre: pre.nombre ?? base.nombre,
    icono: pre.icono ?? iconoDeTipo(tipo),
    notas: pre.notas ?? base.notas,
    destino: tipo === 'trip' ? (pre.destino ?? base.destino) : '',
    presupuesto: pre.presupuesto ?? base.presupuesto,
    fin: tipo === 'celebration' ? base.inicio : base.fin,
  };
}
