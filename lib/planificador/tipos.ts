/** Tipos del Planificador (tabla `plans` y vista `plan_summaries`; docs/plan-planificador.md §2). */

export type TipoPlan = 'trip' | 'celebration' | 'other';
/** `plans.default_split_mode`: cómo se pagan por defecto los gastos del plan. */
export type DivisionPlan = 'half' | 'proportional' | 'custom' | 'pot';

export type Plan = {
  id: string;
  type: TipoPlan;
  name: string;
  icon: string;
  destination: string | null;
  start_date: string;
  end_date: string;
  budget_cents: number | null;
  default_split_mode: DivisionPlan;
  default_split_pct_m1: number | null;
  notes: string | null;
  created_by: string | null;
  version: number;
};

/** Un plan con lo gastado (`plan_summaries.spent_cents`); `null` si la vista no ha respondido (no se inventa). */
export type PlanLista = Plan & { gastado_cents: number | null };

/** Lo que se escribe en `plans` al crear o editar (sin id, pareja ni versión). */
export type FilaPlan = Pick<
  Plan,
  'type' | 'name' | 'icon' | 'destination' | 'start_date' | 'end_date' | 'budget_cents' | 'default_split_mode' | 'default_split_pct_m1' | 'notes'
>;

export type TipoTarea = 'task' | 'booking';

/** Fila de `plan_tasks` tal como la lee la app (con el elemento del itinerario enlazado; el gasto enlazado llega aparte). */
export type Tarea = {
  id: string;
  plan_id: string;
  kind: TipoTarea;
  title: string;
  detail: string | null;
  assignee: 'm1' | 'm2' | null;
  status: 'pending' | 'done';
  done_by: string | null;
  due_date: string | null;
  place_id: string | null;
  /** Reserva: elemento del itinerario (evento de este plan) al que está enlazada. */
  event_id: string | null;
  position: number;
  version: number;
};

/** Lo que se escribe al crear o editar una tarea (el estado de hecha se cambia aparte). */
export type FilaTarea = Pick<Tarea, 'kind' | 'title' | 'detail' | 'assignee' | 'due_date' | 'place_id'> & { event_id?: string | null };
