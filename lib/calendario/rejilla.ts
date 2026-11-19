/**
 * Rejilla del calendario: semanas de lunes a domingo y movimiento por mes o semana. Todas las fechas son
 * `YYYY-MM-DD` (hora de pared de la pareja), sin pasar nunca por UTC.
 */
import { MESES, aISO, deISO } from '@/lib/gastos/fechas';

export type Vista = 'mes' | 'semana';

export const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
/** Iniciales de la cabecera de la rejilla, de lunes a domingo. */
export const INICIALES_SEMANA = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];

/** Suma (o resta) días a una fecha. */
export function sumarDias(iso: string, dias: number): string {
  const d = deISO(iso);
  return aISO(new Date(d.getFullYear(), d.getMonth(), d.getDate() + dias));
}

/** Días de `a` a `b` (positivo si `b` es posterior). */
export function diasEntre(a: string, b: string): number {
  const x = deISO(a);
  const y = deISO(b);
  return Math.round((Date.UTC(y.getFullYear(), y.getMonth(), y.getDate()) - Date.UTC(x.getFullYear(), x.getMonth(), x.getDate())) / 86_400_000);
}

/** Lunes de la semana de una fecha. */
export function inicioSemana(iso: string): string {
  const d = deISO(iso);
  return sumarDias(iso, -((d.getDay() + 6) % 7));
}

/** Los 7 días (lunes a domingo) de la semana de una fecha. */
export function semanaDe(iso: string): string[] {
  const lunes = inicioSemana(iso);
  return Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i));
}

export const primeroDelMes = (iso: string) => `${iso.slice(0, 7)}-01`;

export function ultimoDelMes(iso: string): string {
  const d = deISO(iso);
  return aISO(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

/** Semanas (de 4 a 6) que hacen falta para ver el mes de una fecha; incluyen días de los meses vecinos. */
export function semanasDelMes(iso: string): string[][] {
  const primero = primeroDelMes(iso);
  const ultimo = ultimoDelMes(iso);
  const semanas: string[][] = [];
  for (let lunes = inicioSemana(primero); lunes <= ultimo; lunes = sumarDias(lunes, 7)) {
    semanas.push(semanaDe(lunes));
  }
  return semanas;
}

/** Primer y último día que se ven en pantalla (la consulta pide solo eso: como mucho 42 días). */
export function rangoVisible(vista: Vista, iso: string): { desde: string; hasta: string } {
  if (vista === 'semana') {
    const s = semanaDe(iso);
    return { desde: s[0], hasta: s[6] };
  }
  const semanas = semanasDelMes(iso);
  return { desde: semanas[0][0], hasta: semanas[semanas.length - 1][6] };
}

/** Mismo día del mes `n` meses después (o antes); si no existe, el último del mes (31 ene → 28 feb). */
export function moverMes(iso: string, n: number): string {
  const d = deISO(iso);
  const ultimo = new Date(d.getFullYear(), d.getMonth() + n + 1, 0).getDate();
  return aISO(new Date(d.getFullYear(), d.getMonth() + n, Math.min(d.getDate(), ultimo)));
}

export const moverSemana = (iso: string, n: number) => sumarDias(iso, 7 * n);

export const mover = (vista: Vista, iso: string, n: number) => (vista === 'mes' ? moverMes(iso, n) : moverSemana(iso, n));

/** ¿Está `iso` dentro del periodo (mes o semana) que muestra `ancla`? */
export function mismoPeriodo(vista: Vista, ancla: string, iso: string): boolean {
  return vista === 'mes' ? ancla.slice(0, 7) === iso.slice(0, 7) : inicioSemana(ancla) === inicioSemana(iso);
}

/** «9 – 15 nov», «28 dic – 3 ene»; con `anioRef`, añade el año si no es ese («28 dic – 3 ene 2027»). */
export function etiquetaSemana(iso: string, anioRef?: number): string {
  const s = semanaDe(iso);
  const a = deISO(s[0]);
  const b = deISO(s[6]);
  const sufijo = anioRef !== undefined && b.getFullYear() !== anioRef ? ` ${b.getFullYear()}` : '';
  if (a.getMonth() === b.getMonth()) return `${a.getDate()} – ${b.getDate()} ${MESES_CORTOS[b.getMonth()]}${sufijo}`;
  return `${a.getDate()} ${MESES_CORTOS[a.getMonth()]} – ${b.getDate()} ${MESES_CORTOS[b.getMonth()]}${sufijo}`;
}

export function etiquetaMes(iso: string): string {
  const d = deISO(iso);
  return `${MESES[d.getMonth()]} ${d.getFullYear()}`;
}

/** Texto del periodo de la cabecera: «Noviembre 2026» o «9 – 15 nov». */
export function etiquetaPeriodo(vista: Vista, iso: string, anioRef?: number): string {
  return vista === 'mes' ? etiquetaMes(iso) : etiquetaSemana(iso, anioRef);
}

/** Etiqueta del periodo para la barra del calendario, en dos líneas: la principal y, debajo, el año. */
export type EtiquetaCorta = { principal: string; secundaria: string; accesible: string };

/**
 * Etiqueta corta del periodo: mes → «Noviembre» / «2026»; semana → «23–29 nov» / «2026», «28 dic–3 ene» (guion largo,
 * sin espacios) y, si cruza de año, «2026–27» debajo. `accesible` es el texto largo para los lectores de pantalla.
 */
export function etiquetaPeriodoCorta(vista: Vista, iso: string): EtiquetaCorta {
  if (vista === 'mes') {
    const d = deISO(iso);
    const largo = `${MESES[d.getMonth()]} ${d.getFullYear()}`;
    return { principal: MESES[d.getMonth()], secundaria: String(d.getFullYear()), accesible: largo };
  }
  const s = semanaDe(iso);
  const a = deISO(s[0]);
  const b = deISO(s[6]);
  const mesLargo = (d: Date) => MESES[d.getMonth()].toLowerCase();
  if (a.getFullYear() !== b.getFullYear()) {
    return {
      principal: `${a.getDate()} ${MESES_CORTOS[a.getMonth()]}–${b.getDate()} ${MESES_CORTOS[b.getMonth()]}`,
      secundaria: `${a.getFullYear()}–${String(b.getFullYear()).slice(2)}`,
      accesible: `del ${a.getDate()} de ${mesLargo(a)} de ${a.getFullYear()} al ${b.getDate()} de ${mesLargo(b)} de ${b.getFullYear()}`,
    };
  }
  const anio = String(b.getFullYear());
  if (a.getMonth() === b.getMonth()) {
    return {
      principal: `${a.getDate()}–${b.getDate()} ${MESES_CORTOS[b.getMonth()]}`,
      secundaria: anio,
      accesible: `del ${a.getDate()} al ${b.getDate()} de ${mesLargo(b)} de ${anio}`,
    };
  }
  return {
    principal: `${a.getDate()} ${MESES_CORTOS[a.getMonth()]}–${b.getDate()} ${MESES_CORTOS[b.getMonth()]}`,
    secundaria: anio,
    accesible: `del ${a.getDate()} de ${mesLargo(a)} al ${b.getDate()} de ${mesLargo(b)} de ${anio}`,
  };
}

/** «Sábado 14». */
export function tituloDia(iso: string): string {
  const d = deISO(iso);
  return `${DIAS_SEMANA[d.getDay()]} ${d.getDate()}`;
}

/** «14 de noviembre» (para etiquetas de accesibilidad). */
export function diaDeMes(iso: string): string {
  const d = deISO(iso);
  return `${d.getDate()} de ${MESES[d.getMonth()].toLowerCase()}`;
}

/** «Lun», «Sáb»: abreviatura del día de la semana. */
export function abreviaturaDia(iso: string): string {
  return DIAS_SEMANA[deISO(iso).getDay()].slice(0, 3);
}

export const numeroDia = (iso: string) => Number(iso.slice(8, 10));

/** «vie 14»: día de la semana abreviado (en minúsculas) y número. */
export function diaCorto(iso: string): string {
  const d = deISO(iso);
  return `${DIAS_SEMANA[d.getDay()].slice(0, 3).toLowerCase()} ${d.getDate()}`;
}

/** «14 dic». */
export function diaMesCorto(iso: string): string {
  const d = deISO(iso);
  return `${d.getDate()} ${MESES_CORTOS[d.getMonth()]}`;
}

/** «14 – 18 nov», «28 oct – 3 nov». */
export function rangoCorto(inicio: string, fin: string): string {
  const [dia1, mes1] = diaMesCorto(inicio).split(' ');
  const [dia2, mes2] = diaMesCorto(fin).split(' ');
  return mes1 === mes2 ? `${dia1} – ${dia2} ${mes2}` : `${dia1} ${mes1} – ${dia2} ${mes2}`;
}

/** Cómo se pinta el selector Mes|Semana de la barra: con texto, o con iconos si no cabe (pantalla estrecha o letra grande). */
export type ModoBarra = 'texto' | 'iconos';

/** `'iconos'` si la ventana mide menos de 370 pt o la letra del sistema está al 130 % o más. */
export const modoBarra = (anchoVentana: number, fontScale: number): ModoBarra => (anchoVentana < 370 || fontScale >= 1.3 ? 'iconos' : 'texto');

/**
 * Columnas (0–6) contiguas de una semana que son de otro mes (`mes` = `YYYY-MM`), o null si todas son del mes.
 * Siempre están al principio (`desde` = 0) o al final (`hasta` = 6) de la semana.
 */
export function tramoFueraDeMes(semana: string[], mes: string): { desde: number; hasta: number } | null {
  const fuera = semana.flatMap((iso, i) => (iso.slice(0, 7) === mes ? [] : [i]));
  if (fuera.length === 0) return null;
  return { desde: fuera[0], hasta: fuera[fuera.length - 1] };
}
