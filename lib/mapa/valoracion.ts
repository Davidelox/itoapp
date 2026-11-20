/** Lógica pura de valoraciones, notas y estadísticas de un sitio (docs/plan-mapa.md F5). Sin red ni React. */
import { formatearEuros } from '@/lib/dinero/importe';
import type { EstadisticasSitio, NotaSitio } from '@/lib/mapa/tipos';

export const MAX_NOTA = 1000;
export const MIN_VALORACION = 0.5;
export const MAX_VALORACION = 5;

/** Ajusta a pasos de 0,5 dentro de 0,5–5; un valor vacío o no numérico es «sin valoración». */
export function normalizarValoracion(v: number | null | undefined): number | null {
  if (v === null || v === undefined || !Number.isFinite(v) || v <= 0) return null;
  return Math.min(MAX_VALORACION, Math.max(MIN_VALORACION, Math.round(v * 2) / 2));
}

/** Tocar la estrella `n`: la pone entera; si ya estaba entera, pasa a media; si ya estaba a media, la quita. */
export function tocarEstrella(actual: number | null, n: number): number | null {
  if (actual === n) return n - 0.5 >= MIN_VALORACION ? n - 0.5 : null;
  if (actual === n - 0.5) return null;
  return n;
}

/** Subir/bajar medio punto (lectores de pantalla). Bajar de 0,5 quita la valoración. */
export const pasoValoracion = (actual: number | null, delta: 0.5 | -0.5): number | null =>
  normalizarValoracion((actual ?? 0) + delta);

/** Las estrellas solo se ponen en un sitio donde ya habéis estado; la nota de texto vale en los dos estados. */
export const puedeValorar = (estado: string): boolean => estado === 'been';

/** Lo que se guarda de mi nota: valoración normalizada y texto recortado (vacío = null). */
export function limpiarNota(rating: number | null, note: string): { rating: number | null; note: string | null } {
  return { rating: normalizarValoracion(rating), note: note.trim().slice(0, MAX_NOTA) || null };
}

/** Sin valoración ni texto no hay nada que guardar: se borra mi fila. */
export const estaVacia = (n: { rating: number | null; note: string | null }): boolean => n.rating === null && n.note === null;

/** Mi fila de `place_notes` en un sitio, si existe. */
export const miNota = (notas: NotaSitio[], userId: string | null | undefined): NotaSitio | undefined =>
  userId ? notas.find((n) => n.user_id === userId) : undefined;

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

/** «vie 22» a partir de `AAAA-MM-DD` (sin zonas horarias). */
export function diaCorto(fecha: string): string {
  const [a, m, d] = fecha.split('-').map(Number);
  return `${DIAS[new Date(a, m - 1, d).getDay()]} ${d}`;
}

/** «Fuisteis 3 veces · 142 € · Próximo plan: vie 22». Solo las partes con datos; sin ninguna, null. */
export function textoEstadisticas(e: EstadisticasSitio | null | undefined): string | null {
  if (!e) return null;
  const partes: string[] = [];
  if (e.visit_count > 0) partes.push(e.visit_count === 1 ? 'Fuisteis 1 vez' : `Fuisteis ${e.visit_count} veces`);
  if (e.total_spent_cents > 0) partes.push(formatearEuros(Number(e.total_spent_cents)));
  if (e.next_event_on) partes.push(`Próximo plan: ${diaCorto(e.next_event_on)}`);
  return partes.length ? partes.join(' · ') : null;
}
