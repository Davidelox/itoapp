/**
 * Gastos de un plan (docs/plan-planificador.md §F4, «Dinero: cómo cuenta un plan»). Lógica pura, en céntimos enteros:
 * el saldo de un plan es parte del saldo global (no hay otro guardado) y se calcula con la misma función que `HojaSaldar`.
 */
import { formatearImporte } from '@/lib/dinero/importe';
import { type Hueco, type Pagador, type Reparto, pctDeYo } from '@/lib/gastos/reparto';
import { type GastoSaldable, saldables, totalDe } from '@/lib/gastos/saldar';
import { textoSaldo } from '@/lib/gastos/textoSaldo';
import { proximos } from '@/lib/planificador/plan';
import type { Plan } from '@/lib/planificador/tipos';

/** Lo mínimo de un gasto para saber a qué plan pertenece. */
export type GastoConPlan = {
  plan_id: string | null;
  /** El plan, si sigue existiendo (embebido en la lectura). */
  plan?: { id: string; name: string; icon: string } | null;
  /** Lo que guardó el servidor al borrar el plan. */
  plan_name_snapshot?: string | null;
  plan_icon_snapshot?: string | null;
};

export type PlanDelGasto = { id: string | null; nombre: string; icono: string };

const ICONO_POR_DEFECTO = '⭐';

/** El plan de un gasto: el vivo, o el que quedó guardado si se borró (entonces `id` es null y no se puede abrir). */
export function planDe(g: GastoConPlan): PlanDelGasto | null {
  if (g.plan_id && g.plan) return { id: g.plan.id, nombre: g.plan.name, icono: g.plan.icon };
  if (g.plan_name_snapshot) return { id: null, nombre: g.plan_name_snapshot, icono: g.plan_icon_snapshot || ICONO_POR_DEFECTO };
  return null;
}

/** «🎂 Cumpleaños de Marta»: la línea secundaria de un gasto con plan. */
export const lineaPlan = (p: PlanDelGasto) => `${p.icono} ${p.nombre}`;

/** Una fila de «Saldar»: un gasto suelto o todos los gastos de un plan agrupados. */
export type FilaSaldar<G> = { tipo: 'gasto'; gasto: G } | { tipo: 'plan'; planId: string; gastos: G[] };

/** Un plan = UNA fila (en el sitio de su primer gasto); el resto, sueltos. El orden de entrada se respeta. */
export function agruparSaldables<G extends { plan_id: string | null }>(lista: G[]): FilaSaldar<G>[] {
  const filas: FilaSaldar<G>[] = [];
  const grupos = new Map<string, G[]>();
  for (const g of lista) {
    if (!g.plan_id) {
      filas.push({ tipo: 'gasto', gasto: g });
    } else if (grupos.has(g.plan_id)) {
      grupos.get(g.plan_id)?.push(g);
    } else {
      const gastos = [g];
      grupos.set(g.plan_id, gastos);
      filas.push({ tipo: 'plan', planId: g.plan_id, gastos });
    }
  }
  return filas;
}

export type EstadoGrupo = 'todos' | 'ninguno' | 'algunos';

/** Casilla de grupo: marcada si lo están todos sus gastos, vacía si ninguno, «mixta» si solo algunos. */
export function estadoGrupo(ids: readonly string[], marcados: ReadonlySet<string> | null): EstadoGrupo {
  const n = ids.filter((id) => marcados?.has(id)).length;
  return n === 0 ? 'ninguno' : n === ids.length ? 'todos' : 'algunos';
}

/** Al pulsar la casilla de grupo: si estaban todos, los quita; si no (ninguno o algunos), los marca todos. Solo toca los ids del grupo. */
export function alternarGrupo(marcados: ReadonlySet<string> | null, ids: readonly string[]): Set<string> {
  const nuevo = new Set(marcados);
  if (estadoGrupo(ids, marcados) === 'todos') for (const id of ids) nuevo.delete(id);
  else for (const id of ids) nuevo.add(id);
  return nuevo;
}

type GastoDePlan = GastoSaldable & Pick<GastoConPlan, 'plan_id'>;

/** Lo que se podría saldar de un plan: sin saldar, visible, con deuda entre los dos y sin solicitud de borrado pendiente. */
export const saldablesDelPlan = <G extends GastoDePlan>(yo: Hueco, planId: string, gastos: G[], pendientesDeBorrar: Set<string>): G[] =>
  saldables(
    yo,
    gastos.filter((g) => g.plan_id === planId),
    pendientesDeBorrar,
  );

/**
 * Saldo de un plan visto por `yo` (> 0: te deben): la suma del efecto de cada gasto saldable del plan, con la misma función que
 * `HojaSaldar`. Lo que está en un pago pendiente de confirmar queda fuera (se enseña aparte).
 */
export const saldoDelPlan = (yo: Hueco, planId: string, gastos: GastoDePlan[], pendientesDeBorrar: Set<string>): number =>
  totalDe(yo, saldablesDelPlan(yo, planId, gastos, pendientesDeBorrar));

/** Lo del plan que está en un pago pendiente de confirmar (se enseña aparte). */
export function pendienteDeConfirmarDelPlan(
  yo: Hueco,
  planId: string,
  gastos: (GastoDePlan & { liquidacion: { status: string } | null })[],
): number {
  return totalDe(
    yo,
    gastos.filter((g) => g.plan_id === planId && g.settlement_id !== null && g.liquidacion?.status === 'pending'),
  );
}

/** Suma de importes (céntimos) de los gastos del plan. */
export const totalGastadoDelPlan = (gastos: { amount_cents: number }[]) => gastos.reduce((s, g) => s + g.amount_cents, 0);

export const leyendaPlan = (totalCents: number) => `Este plan cuenta como un único gasto de ${formatearImporte(totalCents)} en Gastos`;

/** «Debes 17,50 € a María» / «María te debe 17,50 €» / «En paz». */
export function fraseSaldoPlan(neto: number, nombrePareja: string, hayPareja = true): string {
  const t = textoSaldo(neto, hayPareja);
  if (t.tipo === 'teDebe') return `${nombrePareja} te debe ${formatearImporte(t.cents)}`;
  if (t.tipo === 'debes') return `Debes ${formatearImporte(t.cents)} a ${nombrePareja}`;
  return 'En paz';
}

/** Fila de «Saldar» de un plan: «🎂 Cumpleaños de Marta» y «2 gastos». */
export const cuentaGastos = (n: number) => (n === 1 ? '1 gasto' : `${n} gastos`);

/**
 * Reparto y pagador iniciales de un gasto nuevo en un plan (`default_split_mode` y %). Paga quien lo apunta. El bote solo si
 * sigue activo (si no, a medias); `custom` sin % no debería existir, y se queda a medias. Proporcional usa el % de la pareja
 * (lo aplica `aDatos` con `pctProporcionalM1`).
 */
export function repartoInicialDePlan(
  plan: Pick<Plan, 'default_split_mode' | 'default_split_pct_m1'>,
  yo: Hueco,
  boteActivo: boolean,
): { pagador: Pagador; reparto: Reparto; pctYo: number } {
  const aMedias = { pagador: 'yo', reparto: 'medias', pctYo: 50 } as const;
  switch (plan.default_split_mode) {
    case 'proportional':
      return { pagador: 'yo', reparto: 'proporcional', pctYo: 50 };
    case 'custom':
      return plan.default_split_pct_m1 === null ? aMedias : { pagador: 'yo', reparto: 'personalizado', pctYo: pctDeYo(yo, plan.default_split_pct_m1) };
    case 'pot':
      return boteActivo ? { pagador: 'bote', reparto: 'bote', pctYo: 50 } : aMedias;
    default:
      return aMedias;
  }
}

/** Parámetro de ruta `plan=<uuid>`: solo se acepta un uuid bien formado (nada de inventar rutas ni consultas). */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const idDePlanValido = (v: unknown): string | null => (typeof v === 'string' && UUID.test(v) ? v.toLowerCase() : null);

/** Planes que se ofrecen al apuntar un gasto: en curso y próximos, más el que ya tiene el gasto aunque haya terminado. */
export function planesElegibles<T extends Pick<Plan, 'id' | 'start_date' | 'end_date' | 'name'>>(planes: T[], hoy: string, actualId: string | null): T[] {
  const lista = proximos(planes, hoy);
  const actual = actualId && !lista.some((p) => p.id === actualId) ? planes.find((p) => p.id === actualId) : undefined;
  return actual ? [actual, ...lista] : lista;
}
