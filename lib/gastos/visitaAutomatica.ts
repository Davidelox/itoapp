/** Un gasto nuevo a mano en una fecha pasada (o hoy, si se confirma) da por hecha la salida: lógica pura. */
import type { CategoriaEvento, DatosEventoNuevo, Hueco } from '@/lib/calendario/evento';
import { MAX_TITULO } from '@/lib/calendario/evento';
import { type Categoria, INFO_CATEGORIA } from '@/lib/gastos/categorias';

/**
 * Categorías rutinarias: no son una salida, así que no crean visita ni evento (llenarían el calendario).
 * Sí cuentan: comer fuera, ocio y otros.
 */
export const CATEGORIAS_RUTINARIAS: readonly Categoria[] = ['home', 'groceries', 'delivery', 'transport', 'subscriptions', 'health', 'gifts'];

export type Accion = 'nada' | 'registrar' | 'preguntar';

/** Fecha pasada → registrar; hoy → preguntar; futura, con plan o categoría rutinaria → nada. */
export function decidirAccion(e: { fecha: string; hoy: string; categoria: Categoria; planId: string | null }): Accion {
  if (e.planId !== null || CATEGORIAS_RUTINARIAS.includes(e.categoria)) return 'nada';
  if (e.fecha < e.hoy) return 'registrar';
  return e.fecha === e.hoy ? 'preguntar' : 'nada';
}

/** Ids fijos derivados del gasto (primer dígito hexadecimal cambiado): reintentar no duplica. */
const derivar = (id: string, mascara: number) => (parseInt(id.charAt(0), 16) ^ mascara).toString(16) + id.slice(1);
export const idVisitaDeGasto = (idGasto: string): string => derivar(idGasto, 0x5);
export const idEventoDeGasto = (idGasto: string): string => derivar(idGasto, 0x3);

export const NOTA_EVENTO_GASTO = 'Añadido desde un gasto';

const CATEGORIA_EVENTO: Partial<Record<Categoria, CategoriaEvento>> = { eating_out: 'eating_out', leisure: 'leisure' };

/** Evento de todo el día de un gasto sin sitio. Privado: secreto y solo de quien lo creó. No pregunta «¿Quién pagó?». */
export function datosEventoGasto(g: { concepto: string; categoria: Categoria; fecha: string; privado: boolean }, yo: Hueco): DatosEventoNuevo {
  return {
    title: (g.concepto.trim() || INFO_CATEGORIA[g.categoria].nombre).slice(0, MAX_TITULO),
    start_date: g.fecha,
    start_time: null,
    end_date: null,
    all_day: true,
    recurrence: 'none',
    attendees: g.privado ? yo : 'both',
    budget_cents: null,
    ask_who_paid: false,
    reminder_minutes: null,
    notes: NOTA_EVENTO_GASTO,
    category: CATEGORIA_EVENTO[g.categoria] ?? 'other',
    birth_year: null,
    place_id: null,
    reserved: false,
    reservation_note: null,
    is_secret: g.privado,
  };
}
