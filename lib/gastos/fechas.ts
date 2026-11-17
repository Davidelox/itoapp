/** Fechas de gasto: `spent_on` es una fecha sin hora (`YYYY-MM-DD`), siempre en hora local. */

const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];
export const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const dos = (n: number) => String(n).padStart(2, '0');

/** Date local → `YYYY-MM-DD`. */
export const aISO = (d: Date) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;

/** `YYYY-MM-DD` → Date local a medianoche (no `new Date(iso)`, que lo leería en UTC). */
export function deISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export const hoyISO = (ahora = new Date()) => aISO(ahora);

export function ayerISO(ahora = new Date()) {
  const d = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - 1);
  return aISO(d);
}

/** «Hoy», «Ayer» o «Sáb 7 nov» (con el año si no es el actual). */
export function fechaCorta(iso: string, ahora = new Date()): string {
  if (iso === hoyISO(ahora)) return 'Hoy';
  if (iso === ayerISO(ahora)) return 'Ayer';
  const d = deISO(iso);
  const base = `${DIAS_CORTOS[d.getDay()]} ${d.getDate()} ${MESES_CORTOS[d.getMonth()]}`;
  return d.getFullYear() === ahora.getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

/** «Sábado 7 nov» (con el año si no es el actual). */
export function fechaLarga(iso: string, ahora = new Date()): string {
  const d = deISO(iso);
  const base = `${DIAS[d.getDay()]} ${d.getDate()} ${MESES_CORTOS[d.getMonth()]}`;
  return d.getFullYear() === ahora.getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

/** «Noviembre 2026»: cabecera de mes del historial. */
export function nombreMes(iso: string): string {
  const d = deISO(iso);
  return `${MESES[d.getMonth()]} ${d.getFullYear()}`;
}
