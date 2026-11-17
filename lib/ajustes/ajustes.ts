import { formatearEuros } from '@/lib/dinero/importe';
import { CATEGORIAS, type Categoria, INFO_CATEGORIA } from '@/lib/gastos/categorias';
import { pctDeYo, type RepartoPorDefecto } from '@/lib/gastos/reparto';

/** Una fila de `couple_settings` con las columnas que se ven y se cambian en Ajustes. */
export type FilaAjustes = {
  default_split: RepartoPorDefecto;
  proportional_pct_m1: number;
  pot_enabled: boolean;
  pot_categories: Categoria[];
  pot_funding: 'monthly' | 'manual';
  pot_monthly_cents: number | null;
  pot_day: number | null;
  pot_pct_m1: number;
};

/** Lo que se manda en una propuesta o en la edición directa: solo las columnas que cambian. */
export type Cambios = Partial<FilaAjustes>;

type Hueco = 'm1' | 'm2';

export const NOMBRE_REPARTO: Record<RepartoPorDefecto, string> = {
  mixed: 'Mixto',
  all_pot: 'Todo al bote',
  half: 'A medias',
  proportional: 'Proporcional',
};

const CLAVES: (keyof FilaAjustes)[] = [
  'default_split',
  'proportional_pct_m1',
  'pot_enabled',
  'pot_categories',
  'pot_funding',
  'pot_monthly_cents',
  'pot_day',
  'pot_pct_m1',
];

const mismasCategorias = (a: Categoria[], b: Categoria[]) => a.length === b.length && a.every((c) => b.includes(c));

/** Solo lo que cambia de `actual` a `nuevo` (categorías sin importar el orden). */
export function diferencias(actual: FilaAjustes, nuevo: FilaAjustes): Cambios {
  const cambios: Cambios = {};
  for (const k of CLAVES) {
    const igual = k === 'pot_categories' ? mismasCategorias(actual[k], nuevo[k]) : actual[k] === nuevo[k];
    if (!igual) (cambios as Record<string, unknown>)[k] = nuevo[k];
  }
  return cambios;
}

export const hayCambios = (c: Cambios) => Object.keys(c).length > 0;

/** Ajustes que quedarían tras aplicar los cambios (lo mismo que hace el servidor). */
export const aplicar = (actual: FilaAjustes, cambios: Cambios): FilaAjustes => ({ ...actual, ...cambios });

/** Categorías en el orden de siempre. */
export const ordenarCategorias = (cs: Categoria[]) => CATEGORIAS.filter((c) => cs.includes(c));

/**
 * El mismo control que el servidor (TW032): sin bote no hay Mixto ni Todo al bote, y la aportación
 * mensual necesita importe y día. Devuelve el motivo o null.
 */
export function incoherencia(s: FilaAjustes): string | null {
  if (!s.pot_enabled && (s.default_split === 'mixed' || s.default_split === 'all_pot')) {
    return 'Sin bote común no puede haber reparto Mixto ni Todo al bote.';
  }
  if (s.pot_enabled && s.pot_funding === 'monthly' && (!s.pot_monthly_cents || s.pot_monthly_cents <= 0 || !s.pot_day)) {
    return 'Escribe el importe y el día de la aportación.';
  }
  if (s.pot_day !== null && (s.pot_day < 1 || s.pot_day > 31)) return 'Un día del 1 al 31.';
  return null;
}

/**
 * Cambios de la hoja «Bote común». Al desactivar el bote con Mixto o Todo al bote, el reparto por defecto
 * pasa a A medias en la misma propuesta (si no, el servidor la rechazaría).
 */
export function cambiosBote(
  actual: FilaAjustes,
  bote: { activo: boolean; mensual: boolean; aportacionCents: number | null; dia: number | null; pctM1: number },
): Cambios {
  const nuevo: FilaAjustes = bote.activo
    ? {
        ...actual,
        pot_enabled: true,
        pot_funding: bote.mensual ? 'monthly' : 'manual',
        // A mano se conservan importe y día anteriores: así no cambian si se vuelve a mensual.
        pot_monthly_cents: bote.mensual ? bote.aportacionCents : actual.pot_monthly_cents,
        pot_day: bote.mensual ? bote.dia : actual.pot_day,
        pot_pct_m1: bote.pctM1,
      }
    : {
        ...actual,
        pot_enabled: false,
        default_split: actual.default_split === 'mixed' || actual.default_split === 'all_pot' ? 'half' : actual.default_split,
      };
  return diferencias(actual, nuevo);
}

// -----------------------------------------------------------------------------
// Textos (vistos desde quien mira: «tú» y el nombre de la pareja)
// -----------------------------------------------------------------------------

const pct = (n: number) => `${n} %`;

/** «Tú 60 % · Meri 40 %», o «A medias» si es 50. */
export function textoPorcentaje(pctM1: number, yo: Hueco, nombrePareja: string): string {
  const mio = pctDeYo(yo, pctM1);
  return mio === 50 ? 'A medias' : `Tú ${pct(mio)} · ${nombrePareja} ${pct(100 - mio)}`;
}

/** Valor de la fila «Reparto de los gastos». */
export function resumenReparto(s: FilaAjustes, yo: Hueco, nombrePareja: string): string {
  if (s.default_split !== 'proportional') return NOMBRE_REPARTO[s.default_split];
  return `Proporcional · ${textoPorcentaje(s.proportional_pct_m1, yo, nombrePareja)}`;
}

/** Valor de la fila «Bote común». */
export function resumenBote(s: FilaAjustes): string {
  if (!s.pot_enabled) return 'Sin bote común';
  if (s.pot_funding === 'monthly' && s.pot_monthly_cents && s.pot_day) {
    return `${formatearEuros(s.pot_monthly_cents)} al mes, el día ${s.pot_day}`;
  }
  return 'Se rellena a mano';
}

/** Nombres de categorías unidos: «Hogar, Súper y Suscripciones». */
export function listaCategorias(cs: Categoria[]): string {
  const nombres = ordenarCategorias(cs).map((c) => INFO_CATEGORIA[c].nombre);
  if (nombres.length === 0) return 'Ninguna';
  if (nombres.length === 1) return nombres[0];
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;
}

/**
 * Una línea por cambio, para la tarjeta de Inicio y la banda de Ajustes:
 * «Aportación al bote: 1.000 € → 1.200 € al mes». `actual` son los ajustes de ahora (no los de cuando se propuso).
 */
export function textosCambios(actual: FilaAjustes, cambios: Cambios, yo: Hueco, nombrePareja: string): string[] {
  const lineas: string[] = [];
  const nuevo = aplicar(actual, cambios);
  const c = diferencias(actual, nuevo);

  if ('pot_enabled' in c) lineas.push(nuevo.pot_enabled ? 'Activar el bote común' : 'Desactivar el bote común');
  if ('default_split' in c) {
    lineas.push(`Reparto de los gastos: ${NOMBRE_REPARTO[actual.default_split]} → ${NOMBRE_REPARTO[nuevo.default_split]}`);
  }
  if ('proportional_pct_m1' in c) {
    lineas.push(
      `Proporcional: ${textoPorcentaje(actual.proportional_pct_m1, yo, nombrePareja)} → ${textoPorcentaje(nuevo.proportional_pct_m1, yo, nombrePareja)}`,
    );
  }
  if (nuevo.pot_enabled) {
    if ('pot_funding' in c) {
      lineas.push(nuevo.pot_funding === 'monthly' ? 'El bote se rellena cada mes' : 'El bote se rellena a mano');
    }
    if (nuevo.pot_funding === 'monthly') {
      if ('pot_monthly_cents' in c && nuevo.pot_monthly_cents) {
        lineas.push(
          actual.pot_monthly_cents && actual.pot_funding === 'monthly'
            ? `Aportación al bote: ${formatearEuros(actual.pot_monthly_cents)} → ${formatearEuros(nuevo.pot_monthly_cents)} al mes`
            : `Aportación al bote: ${formatearEuros(nuevo.pot_monthly_cents)} al mes`,
        );
      }
      if ('pot_day' in c && nuevo.pot_day) {
        lineas.push(
          actual.pot_day && actual.pot_funding === 'monthly'
            ? `Día de la aportación: ${actual.pot_day} → ${nuevo.pot_day}`
            : `Día de la aportación: ${nuevo.pot_day}`,
        );
      }
    }
    if ('pot_pct_m1' in c) {
      lineas.push(
        `Cómo aportáis: ${textoPorcentaje(actual.pot_pct_m1, yo, nombrePareja)} → ${textoPorcentaje(nuevo.pot_pct_m1, yo, nombrePareja)}`,
      );
    }
  }
  if ('pot_categories' in c) {
    const entran = ordenarCategorias(nuevo.pot_categories.filter((x) => !actual.pot_categories.includes(x)));
    const salen = ordenarCategorias(actual.pot_categories.filter((x) => !nuevo.pot_categories.includes(x)));
    if (entran.length) lineas.push(`${listaCategorias(entran)} ${entran.length === 1 ? 'pasa' : 'pasan'} al bote`);
    if (salen.length) lineas.push(`${listaCategorias(salen)} ${salen.length === 1 ? 'deja' : 'dejan'} el bote`);
  }
  return lineas;
}
