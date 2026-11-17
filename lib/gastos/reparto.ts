/**
 * Reparto de un gasto: traducción entre lo que ve cada persona («tú», «tu pareja») y lo que se guarda
 * por hueco (m1, m2, bote), vista previa de las partes y frase del resultado (docs/plan-gastos.md §1).
 *
 * La regla de redondeo es la de `private.compute_shares` en la base de datos:
 *   m1 = round(total × pct / 100) (mitades hacia arriba), m2 = total − m1.
 * Las partes que se guardan las calcula siempre el servidor; esto es solo la vista previa.
 */
import { formatearImporte as formatearEuros } from '@/lib/dinero/importe';
import type { Categoria } from '@/lib/gastos/categorias';

export type Hueco = 'm1' | 'm2';
export type Party = Hueco | 'pot';
export type SplitMode = 'half' | 'proportional' | 'custom' | 'only_m1' | 'only_m2' | 'pot';
export type RepartoPorDefecto = 'mixed' | 'all_pot' | 'half' | 'proportional';

/** Quién pagó, visto por quien usa la app. */
export type Pagador = 'yo' | 'pareja' | 'bote';
/** De quién es el gasto, visto por quien usa la app. */
export type Reparto = 'medias' | 'proporcional' | 'personalizado' | 'solo_yo' | 'solo_pareja' | 'bote';

export const otroHueco = (h: Hueco): Hueco => (h === 'm1' ? 'm2' : 'm1');

/** % de m1 ↔ % de quien mira. */
export const pctDeYo = (yo: Hueco, pctM1: number) => (yo === 'm1' ? pctM1 : 100 - pctM1);
export const pctM1DesdeYo = (yo: Hueco, pctYo: number) => (yo === 'm1' ? pctYo : 100 - pctYo);

export type GastoEnDatos = { paid_by: Party; split_mode: SplitMode; split_pct_m1: number | null };

/** Lo que elige la persona → columnas de `expenses`. `pctYo` solo cuenta en «personalizado». */
export function aDatos(
  yo: Hueco,
  pagador: Pagador,
  reparto: Reparto,
  pctYo: number,
  pctProporcionalM1: number,
): GastoEnDatos {
  const otro = otroHueco(yo);
  const paid_by: Party = pagador === 'yo' ? yo : pagador === 'pareja' ? otro : 'pot';
  switch (reparto) {
    case 'medias':
      return { paid_by, split_mode: 'half', split_pct_m1: 50 };
    case 'proporcional':
      return { paid_by, split_mode: 'proportional', split_pct_m1: pctProporcionalM1 };
    case 'personalizado':
      return { paid_by, split_mode: 'custom', split_pct_m1: pctM1DesdeYo(yo, pctYo) };
    case 'solo_yo':
      return { paid_by, split_mode: yo === 'm1' ? 'only_m1' : 'only_m2', split_pct_m1: null };
    case 'solo_pareja':
      return { paid_by, split_mode: otro === 'm1' ? 'only_m1' : 'only_m2', split_pct_m1: null };
    case 'bote':
      return { paid_by, split_mode: 'pot', split_pct_m1: null };
  }
}

/** Columnas de `expenses` → lo que ve la persona (para editar). */
export function deDatos(yo: Hueco, g: GastoEnDatos): { pagador: Pagador; reparto: Reparto; pctYo: number } {
  const pagador: Pagador = g.paid_by === 'pot' ? 'bote' : g.paid_by === yo ? 'yo' : 'pareja';
  const pctYo = g.split_pct_m1 === null ? 50 : pctDeYo(yo, g.split_pct_m1);
  switch (g.split_mode) {
    case 'half':
      return { pagador, reparto: 'medias', pctYo: 50 };
    case 'proportional':
      return { pagador, reparto: 'proporcional', pctYo };
    case 'custom':
      return { pagador, reparto: 'personalizado', pctYo };
    case 'pot':
      return { pagador, reparto: 'bote', pctYo: 50 };
    default:
      return { pagador, reparto: g.split_mode === `only_${yo}` ? 'solo_yo' : 'solo_pareja', pctYo: 50 };
  }
}

export type Partes = { m1: number; m2: number; pot: number };

/** Partes en céntimos, igual que `private.compute_shares`. */
export function partes(totalCents: number, modo: SplitMode, pctM1: number | null): Partes {
  switch (modo) {
    case 'pot':
      return { m1: 0, m2: 0, pot: totalCents };
    case 'only_m1':
      return { m1: totalCents, m2: 0, pot: 0 };
    case 'only_m2':
      return { m1: 0, m2: totalCents, pot: 0 };
    default: {
      const pct = modo === 'half' ? 50 : (pctM1 ?? 50);
      const m1 = Math.round((totalCents * pct) / 100);
      return { m1, m2: totalCents - m1, pot: 0 };
    }
  }
}

/** Partes vistas por quien mira. */
export const partesDeYo = (yo: Hueco, p: Partes) => ({
  yo: yo === 'm1' ? p.m1 : p.m2,
  pareja: yo === 'm1' ? p.m2 : p.m1,
  bote: p.pot,
});

/**
 * Efecto en las deudas visto por quien mira, con la convención de `expense_effects`.
 * `parejaMeDebe` > 0: la pareja te debe; < 0: debes tú. `boteMeDebe` / `boteLeDebe`: lo adelantado al bote.
 */
export function efecto(yo: Hueco, paidBy: Party, p: Partes) {
  const m2DebeAm1 = paidBy === 'm1' ? p.m2 : paidBy === 'm2' ? -p.m1 : 0;
  const parejaMeDebe = yo === 'm1' ? m2DebeAm1 : -m2DebeAm1;
  const boteDebeA = paidBy === 'pot' ? null : paidBy;
  return {
    parejaMeDebe,
    boteMeDebe: boteDebeA === yo ? p.pot : 0,
    boteLeDebe: boteDebeA !== null && boteDebeA !== yo ? p.pot : 0,
  };
}

export type Resultado = { texto: string; quien: 'pareja' | 'bote' | 'nadie' };

/**
 * Frase del resultado (mockup AnadirGasto). `tiempo: 'futuro'` en el formulario («te deberá»),
 * `'presente'` en el detalle («te debe»).
 */
export function fraseResultado(
  yo: Hueco,
  paidBy: Party,
  p: Partes,
  nombrePareja: string,
  tiempo: 'futuro' | 'presente',
): Resultado {
  const total = p.m1 + p.m2 + p.pot;
  if (total <= 0) return { texto: 'Escribe un importe para ver el reparto', quien: 'nadie' };
  const f = tiempo === 'futuro';
  const ef = efecto(yo, paidBy, p);
  const mias = partesDeYo(yo, p);

  if (paidBy === 'pot') {
    if (p.pot === total) return { texto: 'Sale del bote común. Sin deudas', quien: 'bote' };
    return {
      texto: `Sale del bote común. Tu parte ${formatearEuros(mias.yo)} y la de ${nombrePareja} ${formatearEuros(mias.pareja)}, sin deudas entre vosotros`,
      quien: 'bote',
    };
  }
  if (p.pot > 0) {
    return ef.boteMeDebe > 0
      ? { texto: `El bote te ${f ? 'deberá' : 'debe'} ${formatearEuros(ef.boteMeDebe)}`, quien: 'bote' }
      : { texto: `El bote le ${f ? 'deberá' : 'debe'} ${formatearEuros(ef.boteLeDebe)} a ${nombrePareja}`, quien: 'bote' };
  }
  if (ef.parejaMeDebe > 0) {
    return { texto: `${nombrePareja} te ${f ? 'deberá' : 'debe'} ${formatearEuros(ef.parejaMeDebe)}`, quien: 'pareja' };
  }
  if (ef.parejaMeDebe < 0) {
    return { texto: `${f ? 'Deberás' : 'Debes'} ${formatearEuros(-ef.parejaMeDebe)} a ${nombrePareja}`, quien: 'pareja' };
  }
  return paidBy === yo
    ? { texto: 'Gasto solo tuyo. No genera deuda', quien: 'nadie' }
    : { texto: `Gasto solo de ${nombrePareja}. No genera deuda`, quien: 'nadie' };
}

/** Reparto y pagador iniciales de un gasto nuevo según los ajustes de la pareja (docs/plan-gastos.md §3.2). */
export function valoresPorDefecto(
  ajustes: { reparto: RepartoPorDefecto; boteActivo: boolean; categoriasBote: Categoria[] },
  categoria: Categoria | null,
): { pagador: Pagador; reparto: Reparto } {
  const aMedias = { pagador: 'yo', reparto: 'medias' } as const;
  if (!ajustes.boteActivo) {
    return ajustes.reparto === 'proportional' ? { pagador: 'yo', reparto: 'proporcional' } : aMedias;
  }
  switch (ajustes.reparto) {
    case 'half':
      return aMedias;
    case 'proportional':
      return { pagador: 'yo', reparto: 'proporcional' };
    case 'all_pot':
      return { pagador: 'bote', reparto: 'bote' };
    case 'mixed':
      return categoria && ajustes.categoriasBote.includes(categoria) ? { pagador: 'bote', reparto: 'bote' } : aMedias;
  }
}

/**
 * El chip «Proporcional 50/50» sobra cuando es igual que «A medias»: se oculta si el % es 50,
 * salvo que lo que se edita ya esté guardado como proporcional (para que quede un chip marcado).
 */
export const ocultaProporcional = (pctProporcionalM1: number, guardadoComoProporcional: boolean) =>
  pctProporcionalM1 === 50 && !guardadoComoProporcional;

/** Con el chip «Proporcional» oculto, el reparto «proporcional» pasa a «a medias». */
export const sinProporcionalOculto = (reparto: Reparto, oculto: boolean): Reparto =>
  oculto && reparto === 'proporcional' ? 'medias' : reparto;

/** Solo un gasto pagado por ti y solo tuyo puede ser privado (CHECK de `expenses`). */
export const puedeSerPrivado = (pagador: Pagador, reparto: Reparto) => pagador === 'yo' && reparto === 'solo_yo';

/** Línea corta de la lista: «Pagaste tú · a medias», «Pagó Meri · del bote». */
export function etiquetaReparto(modo: SplitMode, yo: Hueco, pctM1: number | null, nombrePareja: string): string {
  switch (modo) {
    case 'half':
      return 'a medias';
    case 'proportional':
    case 'custom': {
      const mio = pctDeYo(yo, pctM1 ?? 50);
      return `${modo === 'proportional' ? 'proporcional' : 'personalizado'} ${mio}/${100 - mio}`;
    }
    case 'pot':
      return 'del bote';
    default:
      return modo === `only_${yo}` ? 'solo tuyo' : `solo de ${nombrePareja}`;
  }
}
