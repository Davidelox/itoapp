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

/**
 * Zona horaria de la pareja (`couples.time_zone`). La fija EstadoProvider al cargar la pareja: así «hoy»
 * es el mismo día que usa el job del servidor para aportaciones y cobros (revisión M3), aunque el móvil
 * esté en otra zona. Sin zona (o si el motor no la soporta), se usa la del dispositivo.
 */
let zonaPareja: string | null = null;
// Crear un Intl.DateTimeFormat es caro en Hermes y hoyISO se llama por cada fila de las listas: uno por zona.
let formato: { zona: string; f: Intl.DateTimeFormat } | null = null;
export function fijarZonaHoraria(zona: string | null) {
  zonaPareja = zona;
}

/** `YYYY-MM-DD` de un instante en la zona de la pareja. */
export function fechaEnZona(instante: Date): string {
  if (zonaPareja) {
    try {
      if (!formato || formato.zona !== zonaPareja) {
        formato = {
          zona: zonaPareja,
          f: new Intl.DateTimeFormat('en-US', { timeZone: zonaPareja, year: 'numeric', month: '2-digit', day: '2-digit' }),
        };
      }
      const partes = formato.f.formatToParts(instante);
      const v = (t: string) => partes.find((x) => x.type === t)?.value;
      const y = v('year');
      const m = v('month');
      const d = v('day');
      if (y && m && d) return `${y}-${m}-${d}`;
    } catch {
      // Zona no soportada: la del dispositivo.
    }
  }
  return aISO(instante);
}

export const hoyISO = (ahora = new Date()) => fechaEnZona(ahora);

export function ayerISO(ahora = new Date()) {
  const hoy = deISO(hoyISO(ahora));
  return aISO(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 1));
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
