/**
 * Repetición de eventos: copia en TypeScript de `private.occurrence_dates` (esquema inicial) y los textos
 * que se enseñan. Se calcula siempre desde la fecha original, sin deriva: un mensual del 31 de enero cae el
 * 28 (o 29) de febrero y vuelve al 31 en marzo; un anual del 29 de febrero cae el 28 los años no bisiestos.
 */
import { MESES, aISO, deISO } from '@/lib/gastos/fechas';
import { DIAS_SEMANA, diasEntre, sumarDias } from '@/lib/calendario/rejilla';

export type Repeticion = 'none' | 'weekly' | 'monthly' | 'yearly';

const diasDelMes = (anio: number, mes0: number) => new Date(anio, mes0 + 1, 0).getDate();

/** `inicio` + `n` meses (como `timestamp + make_interval(months => n)`): si el día no existe, el último. */
function sumarMeses(inicio: string, n: number): string {
  const d = deISO(inicio);
  const total = d.getMonth() + n;
  const anio = d.getFullYear() + Math.floor(total / 12);
  const mes = ((total % 12) + 12) % 12;
  return aISO(new Date(anio, mes, Math.min(d.getDate(), diasDelMes(anio, mes))));
}

/**
 * Fechas en que ocurre un evento dentro de [`desde`, `hasta`] (las dos incluidas), ordenadas.
 * `repetirHasta`: última fecha permitida de la serie, o null.
 */
export function fechasRepeticion(
  inicio: string,
  repeticion: Repeticion,
  repetirHasta: string | null,
  desde: string,
  hasta: string,
): string[] {
  const candidatas: string[] = [];
  if (repeticion === 'weekly') {
    for (let n = Math.max(0, Math.ceil(diasEntre(inicio, desde) / 7)); ; n++) {
      const d = sumarDias(inicio, 7 * n);
      if (d > hasta) break;
      candidatas.push(d);
    }
  } else if (repeticion === 'monthly') {
    const a = deISO(inicio);
    const b = deISO(hasta);
    const maximo = (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth();
    for (let n = 0; n <= maximo; n++) candidatas.push(sumarMeses(inicio, n));
  } else if (repeticion === 'yearly') {
    const maximo = deISO(hasta).getFullYear() - deISO(inicio).getFullYear();
    for (let n = 0; n <= maximo; n++) candidatas.push(sumarMeses(inicio, 12 * n));
  } else {
    candidatas.push(inicio);
  }
  return candidatas.filter((d) => d >= desde && d <= hasta && (!repetirHasta || d <= repetirHasta));
}

/**
 * Primera repetición del evento que sigue en curso en `desde`: la que empieza ese día o después y, si
 * `duracion` > 0 (días que se suman al primero: un viaje del 14 al 18 dura 4), también la que empezó hasta
 * `duracion` días antes y todavía no ha terminado. Null si ya no ocurre más.
 */
export function proximaRepeticion(
  inicio: string,
  repeticion: Repeticion,
  repetirHasta: string | null,
  desde: string,
  duracion = 0,
): string | null {
  const primera = duracion > 0 ? sumarDias(desde, -duracion) : desde;
  const ventana = repeticion === 'weekly' ? 7 : repeticion === 'monthly' ? 62 : repeticion === 'yearly' ? 400 : 0;
  const tope = repeticion === 'none' ? inicio : sumarDias(primera > inicio ? primera : inicio, ventana);
  return fechasRepeticion(inicio, repeticion, repetirHasta, primera, tope < primera ? primera : tope)[0] ?? null;
}

/** ¿Es bisiesto el año? */
export const esBisiesto = (anio: number) => (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0;

/**
 * Años que cumple alguien en la repetición de `fecha` («cumple 60»): año de la fecha menos el de nacimiento.
 * Null si no se sabe el año de nacimiento o la cuenta no es positiva (una repetición anterior a nacer).
 */
export function edad(anioNacimiento: number | null | undefined, fecha: string): number | null {
  if (anioNacimiento === null || anioNacimiento === undefined) return null;
  const años = Number(fecha.slice(0, 4)) - anioNacimiento;
  return años > 0 ? años : null;
}

/** «cada semana», «cada mes», «cada año»; null si no se repite. */
export function textoCorto(repeticion: Repeticion | null | undefined): string | null {
  if (repeticion === 'weekly') return 'cada semana';
  if (repeticion === 'monthly') return 'cada mes';
  if (repeticion === 'yearly') return 'cada año';
  return null;
}

/** Plural del día de la semana: «los lunes», «los sábados». */
const losDias = (diaSemana: number) => {
  const nombre = DIAS_SEMANA[diaSemana].toLowerCase();
  return nombre.endsWith('s') ? nombre : `${nombre}s`;
};

/** «No se repite», «Cada semana, los lunes», «Cada mes, el día 15», «Cada año, el 15 de marzo». */
export function textoRepeticion(repeticion: Repeticion, inicio: string): string {
  const d = deISO(inicio);
  const dia = d.getDate();
  switch (repeticion) {
    case 'weekly':
      return `Cada semana, los ${losDias(d.getDay())}`;
    case 'monthly':
      return dia >= 29 ? `Cada mes, el día ${dia} o el último del mes` : `Cada mes, el día ${dia}`;
    case 'yearly': {
      const mes = MESES[d.getMonth()].toLowerCase();
      return dia === 29 && d.getMonth() === 1
        ? 'Cada año, el 29 de febrero (el 28 si no es bisiesto)'
        : `Cada año, el ${dia} de ${mes}`;
    }
    default:
      return 'No se repite';
  }
}
