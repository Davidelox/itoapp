/**
 * Gastos de un plan agrupados en UNA fila en las listas de Gastos (Últimos e Historial). Solo presentación: el saldo, los repartos
 * y los totales por categoría siguen contando cada gasto por separado. Lógica pura, en céntimos enteros.
 */
import { type GastoConPlan, type PlanDelGasto, planDe } from '@/lib/gastos/planes';

/** Lo acumulado de un plan (`plan_summaries`): todos sus gastos, estén o no cargados en la lista. */
export type ResumenPlan = { gastadoCents: number; cuantos: number };

export type FilaLista<G> =
  | { tipo: 'gasto'; gasto: G }
  | {
      tipo: 'plan';
      /** El plan vivo (con id: se puede abrir). */
      plan: PlanDelGasto & { id: string };
      /** Total y número de gastos de TODO el plan (no solo los cargados). */
      resumen: ResumenPlan;
      /** Fecha del gasto más reciente del plan entre los cargados: fija la posición de la fila. */
      fecha: string;
      /** Gastos del plan que ya están cargados en la lista (para el orden y los tests; el desglose completo está en el plan). */
      gastos: G[];
    };

/** `plan_summaries` (lista de filas) → mapa por plan. Importes siempre enteros. */
export function mapaResumenes(filas: { plan_id: string; spent_cents: number | string; expense_count: number | string }[]): Map<string, ResumenPlan> {
  return new Map(filas.map((f) => [f.plan_id, { gastadoCents: Number(f.spent_cents), cuantos: Number(f.expense_count) }]));
}

type Agrupable = GastoConPlan & { id: string; spent_on: string };

/**
 * Un plan = UNA fila, en el sitio de su gasto más reciente (la lista llega ordenada del más nuevo al más antiguo, así que es el
 * primero que aparece; los demás gastos del plan, estén en esta página o en otra, se absorben sin repetir la fila). Los gastos sin plan,
 * los de un plan ya borrado y los de un plan sin resumen (vista caída) quedan sueltos: nunca se inventa un total.
 * `resumenes` = null (o vacío) → no se agrupa nada.
 */
export function agruparPorPlan<G extends Agrupable>(lista: G[], resumenes: ReadonlyMap<string, ResumenPlan> | null | undefined): FilaLista<G>[] {
  const filas: FilaLista<G>[] = [];
  const grupos = new Map<string, G[]>();
  for (const g of lista) {
    const plan = planDe(g);
    const resumen = g.plan_id ? resumenes?.get(g.plan_id) : undefined;
    if (!plan?.id || !g.plan_id || !resumen) {
      filas.push({ tipo: 'gasto', gasto: g });
    } else if (grupos.has(g.plan_id)) {
      grupos.get(g.plan_id)?.push(g);
    } else {
      const gastos = [g];
      grupos.set(g.plan_id, gastos);
      filas.push({ tipo: 'plan', plan: { ...plan, id: plan.id }, resumen, fecha: g.spent_on, gastos });
    }
  }
  return filas;
}

/** Clave estable de una fila (para listas): el id del gasto o `plan-<id>`. */
export const claveFila = <G extends { id: string }>(f: FilaLista<G>) => (f.tipo === 'gasto' ? f.gasto.id : `plan-${f.plan.id}`);
