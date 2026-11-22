/** Evento del calendario que acompaña a una visita sin plan previo: lógica pura, sin red ni React. */
import {
  type DatosEventoNuevo,
  type Hueco,
  MAX_TITULO,
} from "@/lib/calendario/evento";
import { CATEGORIA_CALENDARIO } from "@/lib/mapa/categorias";
import type { Sitio } from "@/lib/mapa/tipos";

export const NOTA_EVENTO_VISITA = "Visita registrada";

/** Lo que hace falta del sitio para su evento. */
export type SitioDeVisita = Pick<
  Sitio,
  "id" | "name" | "category" | "visible_to_partner"
>;

/** Id fijo del evento a partir del de la visita (primer dígito hexadecimal invertido): reintentar no duplica. */
export const idEventoDeVisita = (idVisita: string): string =>
  (parseInt(idVisita.charAt(0), 16) ^ 0xf).toString(16) + idVisita.slice(1);

/** ¿Algún evento ya enlazado al sitio cubre ese día? Entonces la visita no crea otro. */
export const hayEventoEseDia = (
  existentes: { start_date: string; end_date: string | null }[],
  fecha: string,
): boolean =>
  existentes.some(
    (e) => e.start_date <= fecha && (e.end_date ?? e.start_date) >= fecha,
  );

/**
 * Evento de todo el día en la fecha de la visita (puede ser pasada). Sitio compartido: evento compartido de los dos.
 * Sitio privado: la pareja no lo ve, así que el evento es secreto y solo de quien lo crea (no filtra el nombre).
 */
export function datosEventoVisita(
  sitio: SitioDeVisita,
  fecha: string,
  yo: Hueco,
): DatosEventoNuevo {
  const privado = !sitio.visible_to_partner;
  return {
    title: sitio.name.trim().slice(0, MAX_TITULO),
    start_date: fecha,
    start_time: null,
    end_date: null,
    all_day: true,
    recurrence: "none",
    attendees: privado ? yo : "both",
    budget_cents: null,
    ask_who_paid: false,
    reminder_minutes: null,
    notes: NOTA_EVENTO_VISITA,
    category: CATEGORIA_CALENDARIO[sitio.category],
    birth_year: null,
    place_id: sitio.id,
    reserved: false,
    reservation_note: null,
    is_secret: privado,
  };
}

/** Lo que hace falta del evento automático de una visita para saber si sigue tal como se creó. */
export type EventoAuto = {
  version: number;
  title: string;
  place_id: string | null;
  start_date: string;
  start_time?: string | null;
  end_date: string | null;
  all_day: boolean;
  notes: string | null;
};

export type AccionEventoVisita =
  | { accion: 'nada' }
  | { accion: 'mover'; version: number }
  | { accion: 'crear' };

/**
 * Qué hacer con el evento de una visita al guardarla. `auto` es el evento con el id derivado de la visita (null si no
 * existe o no se ve); `otros` son los demás eventos enlazados al sitio.
 * - Con evento automático: siempre sigue a su visita (aunque su fecha estuviera desfasada). Solo se respeta si el usuario
 *   lo personalizó (otro título, hora, varios días, otra nota o de otro sitio).
 * - Sin él: se crea solo si la fecha cambió y ese día no hay ya otro del sitio.
 * - Si ya hay otro evento del sitio el día de la visita, no se mueve encima ni se duplica.
 */
export function decidirEventoAlCorregir(
  auto: EventoAuto | null,
  otros: { start_date: string; end_date: string | null }[],
  sitio: { id: string; name: string },
  fechaAntigua: string,
  fechaNueva: string,
): AccionEventoVisita {
  if (!auto) {
    if (fechaAntigua === fechaNueva || hayEventoEseDia(otros, fechaNueva)) return { accion: 'nada' };
    return { accion: 'crear' };
  }
  if (auto.start_date === fechaNueva) return { accion: 'nada' };
  if (hayEventoEseDia(otros, fechaNueva)) return { accion: 'nada' };
  const sinPersonalizar =
    auto.place_id === sitio.id &&
    auto.all_day &&
    !auto.start_time &&
    auto.end_date === null &&
    auto.notes === NOTA_EVENTO_VISITA &&
    auto.title === sitio.name.trim().slice(0, MAX_TITULO);
  return sinPersonalizar ? { accion: 'mover', version: auto.version } : { accion: 'nada' };
}
