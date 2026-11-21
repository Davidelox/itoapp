/** Lógica pura de los planes (docs/plan-planificador.md §F2). Sin red ni React: fechas `YYYY-MM-DD` en hora de pared. */
import { abreviaturaDia, diaMesCorto, diasEntre, numeroDia, sumarDias } from '@/lib/calendario/rejilla';
import { formatearEuros, leerEuros } from '@/lib/dinero/importe';
import { MESES } from '@/lib/gastos/fechas';
import { type Hueco, pctDeYo, pctM1DesdeYo } from '@/lib/gastos/reparto';
import { MAX_ICONO, pareceEmoji } from '@/lib/mapa/colecciones';
import type { DivisionPlan, FilaPlan, Plan, TipoPlan } from '@/lib/planificador/tipos';

export const MAX_NOMBRE_PLAN = 80;
export const MAX_DIAS_PLAN = 60;
export const MAX_NOTAS_PLAN = 2000;

export const TIPOS_PLAN: readonly { valor: TipoPlan; etiqueta: string; emoji: string; ayuda: string }[] = [
  { valor: 'trip', etiqueta: 'Viaje', emoji: '✈️', ayuda: 'Una escapada o unas vacaciones, con sus fechas.' },
  { valor: 'celebration', etiqueta: 'Celebración', emoji: '🎂', ayuda: 'Un cumpleaños, un aniversario, una fiesta: un solo día.' },
  { valor: 'other', etiqueta: 'Otro', emoji: '⭐', ayuda: 'Una mudanza, la Navidad, un proyecto: lo que no es un viaje.' },
];

/** Iconos sugeridos de un plan; «Otro…» abre el teclado de emojis. */
export const EMOJIS_PLAN: readonly { emoji: string; nombre: string }[] = [
  { emoji: '✈️', nombre: 'Avión' },
  { emoji: '🏖️', nombre: 'Playa' },
  { emoji: '🏔️', nombre: 'Montaña' },
  { emoji: '🎂', nombre: 'Tarta' },
  { emoji: '🎄', nombre: 'Navidad' },
  { emoji: '🎉', nombre: 'Fiesta' },
  { emoji: '💍', nombre: 'Anillo' },
  { emoji: '🍷', nombre: 'Vino' },
  { emoji: '🏠', nombre: 'Casa' },
  { emoji: '📦', nombre: 'Caja' },
  { emoji: '🎭', nombre: 'Teatro' },
  { emoji: '⭐', nombre: 'Estrella' },
];

export const etiquetaTipo = (t: TipoPlan): string => TIPOS_PLAN.find((x) => x.valor === t)?.etiqueta ?? 'Otro';
export const iconoDeTipo = (t: TipoPlan): string => TIPOS_PLAN.find((x) => x.valor === t)?.emoji ?? '⭐';

/** Estado de edición de un plan (todo texto, como lo escribe la persona). */
export type FormularioPlan = {
  tipo: TipoPlan;
  nombre: string;
  icono: string;
  destino: string;
  inicio: string;
  fin: string;
  /** Importe escrito en euros; vacío = sin presupuesto. */
  presupuesto: string;
  division: DivisionPlan;
  /** % de la persona que mira (solo con `custom`). */
  pctYo: number;
  notas: string;
};

/** Días que dura (los dos extremos cuentan): del 5 al 8 → 4. */
export const duracionPlan = (inicio: string, fin: string): number => diasEntre(inicio, fin) + 1;

export const textoDuracion = (dias: number): string => (dias === 1 ? '1 día' : `${dias} días`);

/** Cambia el inicio y arrastra el fin para que nunca quede antes (en una celebración, fin = inicio). */
export function conInicio(f: FormularioPlan, inicio: string): FormularioPlan {
  return { ...f, inicio, fin: f.tipo === 'celebration' || f.fin < inicio ? inicio : f.fin };
}

/**
 * Cambia el tipo. El icono acompaña al tipo solo si aún era el del tipo anterior (no se pisa uno elegido);
 * una celebración pasa a un solo día.
 */
export function conTipo(f: FormularioPlan, tipo: TipoPlan): FormularioPlan {
  const icono = f.icono === iconoDeTipo(f.tipo) ? iconoDeTipo(tipo) : f.icono;
  return { ...f, tipo, icono, fin: tipo === 'celebration' ? f.inicio : f.fin };
}

export type ErroresPlan = {
  nombre: string | null;
  icono: string | null;
  fechas: string | null;
  presupuesto: string | null;
};

export function validarPlan(f: FormularioPlan): ErroresPlan {
  const nombre = f.nombre.trim();
  const fin = f.tipo === 'celebration' ? f.inicio : f.fin;
  const dias = duracionPlan(f.inicio, fin);
  const presupuesto = f.presupuesto.trim();
  return {
    nombre: nombre.length === 0 ? 'Ponle un nombre al plan.' : nombre.length > MAX_NOMBRE_PLAN ? `El nombre admite hasta ${MAX_NOMBRE_PLAN} letras.` : null,
    icono: pareceEmoji(f.icono) && Array.from(f.icono).length <= MAX_ICONO ? null : 'Elige un icono: uno de los sugeridos o un emoji del teclado.',
    fechas:
      fin < f.inicio
        ? 'El final no puede ser antes del inicio.'
        : dias > MAX_DIAS_PLAN
          ? `Un plan dura como mucho ${MAX_DIAS_PLAN} días.`
          : null,
    presupuesto: presupuesto !== '' && leerEuros(presupuesto) === null ? 'Escribe un importe válido, como 900 o 1.250,50.' : null,
  };
}

export const hayErroresPlan = (e: ErroresPlan) => Object.values(e).some((x) => x !== null);

/** Fila que se envía a `plans`. El destino solo existe en un viaje; una celebración dura un día. */
export function filaDePlan(f: FormularioPlan, yo: Hueco): FilaPlan {
  const destino = f.destino.trim();
  const notas = f.notas.trim();
  return {
    type: f.tipo,
    name: f.nombre.trim(),
    icon: f.icono,
    destination: f.tipo === 'trip' && destino !== '' ? destino : null,
    start_date: f.inicio,
    end_date: f.tipo === 'celebration' ? f.inicio : f.fin,
    budget_cents: f.presupuesto.trim() === '' ? null : leerEuros(f.presupuesto),
    default_split_mode: f.division,
    // `half` guarda 50; `custom`, el % de m1; el resto no lleva % (proporcional usa el de la pareja).
    default_split_pct_m1: f.division === 'half' ? 50 : f.division === 'custom' ? pctM1DesdeYo(yo, f.pctYo) : null,
    notes: notas === '' ? null : notas,
  };
}

/** Formulario de un plan existente (`pctYo`: el % de la persona que mira). */
export function formularioDePlan(p: Plan, yo: Hueco): FormularioPlan {
  return {
    tipo: p.type,
    nombre: p.name,
    icono: p.icon,
    destino: p.destination ?? '',
    inicio: p.start_date,
    fin: p.end_date,
    presupuesto: p.budget_cents === null ? '' : p.budget_cents % 100 === 0 ? String(p.budget_cents / 100) : (p.budget_cents / 100).toFixed(2).replace('.', ','),
    division: p.default_split_mode,
    pctYo: p.default_split_pct_m1 === null ? 50 : pctDeYo(yo, p.default_split_pct_m1),
    notas: p.notes ?? '',
  };
}

export function formularioNuevo(hoy: string): FormularioPlan {
  return { tipo: 'trip', nombre: '', icono: iconoDeTipo('trip'), destino: '', inicio: hoy, fin: sumarDias(hoy, 2), presupuesto: '', division: 'half', pctYo: 50, notas: '' };
}

/** «diciembre». */
export const mesDe = (iso: string) => MESES[Number(iso.slice(5, 7)) - 1].toLowerCase();

/** «Sáb 5 – mar 8 de diciembre», «Sáb 28 nov – mar 1 dic» o «Dom 15 de noviembre»; con otro año, lo añade. */
export function rangoPlan(inicio: string, fin: string, hoy?: string): string {
  const minus = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
  const anio = hoy && (inicio.slice(0, 4) !== hoy.slice(0, 4) || fin.slice(0, 4) !== hoy.slice(0, 4)) ? ` de ${fin.slice(0, 4)}` : '';
  if (inicio === fin) return `${abreviaturaDia(inicio)} ${numeroDia(inicio)} de ${mesDe(inicio)}${anio}`;
  if (inicio.slice(0, 7) === fin.slice(0, 7)) return `${abreviaturaDia(inicio)} ${numeroDia(inicio)} – ${minus(abreviaturaDia(fin))} ${numeroDia(fin)} de ${mesDe(fin)}${anio}`;
  return `${abreviaturaDia(inicio)} ${diaMesCorto(inicio)} – ${minus(abreviaturaDia(fin))} ${diaMesCorto(fin)}${anio}`;
}

/** Rango y duración: «Sáb 5 – mar 8 de diciembre · 4 días»; en un plan de un día, solo la fecha. */
export function textoFechas(inicio: string, fin: string, hoy?: string): string {
  const r = rangoPlan(inicio, fin, hoy);
  return inicio === fin ? r : `${r} · ${textoDuracion(duracionPlan(inicio, fin))}`;
}

export type SeccionPlan = 'proximo' | 'curso' | 'pasado';

export function seccionDe(p: Pick<Plan, 'start_date' | 'end_date'>, hoy: string): SeccionPlan {
  return p.end_date < hoy ? 'pasado' : p.start_date > hoy ? 'proximo' : 'curso';
}

/** Próximos = en curso y futuros, el que antes empieza primero. */
export function proximos<T extends Pick<Plan, 'start_date' | 'end_date' | 'name'>>(planes: T[], hoy: string): T[] {
  return planes
    .filter((p) => seccionDe(p, hoy) !== 'pasado')
    .sort((a, b) => a.start_date.localeCompare(b.start_date) || a.end_date.localeCompare(b.end_date) || a.name.localeCompare(b.name));
}

/** Cuenta atrás: «En 23 días», «Mañana», «Hoy» (un día), «En curso» (varios días) o «Terminado». */
export function cuentaAtras(p: Pick<Plan, 'start_date' | 'end_date'>, hoy: string): string {
  switch (seccionDe(p, hoy)) {
    case 'pasado':
      return 'Terminado';
    case 'curso':
      return p.start_date === p.end_date ? 'Hoy' : 'En curso';
    default: {
      const n = diasEntre(hoy, p.start_date);
      return n === 1 ? 'Mañana' : `En ${n} días`;
    }
  }
}

/** Porcentaje de la barra: de 0 a 100, entero (lleno si se pasa del presupuesto). */
export function porcentajeGastado(gastado: number, presupuesto: number): number {
  if (presupuesto <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((gastado / presupuesto) * 100)));
}

export type VistaPresupuesto =
  | { tipo: 'ninguno'; texto: string }
  /** Hay presupuesto pero se desconoce lo gastado: no se inventa. */
  | { tipo: 'solo'; texto: string; total: number }
  | { tipo: 'barra'; texto: string; detalle: string; pct: number; pasado: boolean; gastado: number; total: number };

export function vistaPresupuesto(presupuesto: number | null, gastado: number | null): VistaPresupuesto {
  if (presupuesto === null) return { tipo: 'ninguno', texto: 'Sin presupuesto' };
  if (gastado === null) return { tipo: 'solo', texto: `Presupuesto de ${formatearEuros(presupuesto)}`, total: presupuesto };
  const resto = presupuesto - gastado;
  return {
    tipo: 'barra',
    texto: `${formatearEuros(gastado)} de ${formatearEuros(presupuesto)}`,
    detalle: resto >= 0 ? `Quedan ${formatearEuros(resto)}` : `Os habéis pasado ${formatearEuros(-resto)}`,
    pct: porcentajeGastado(gastado, presupuesto),
    pasado: resto < 0,
    gastado,
    total: presupuesto,
  };
}

/** «312 € gastados»; null si no hay gasto (o no se sabe): sin presupuesto, es lo único que se dice del dinero de un plan. */
export const textoGastadoPlan = (gastado: number | null | undefined): string | null => (gastado ? `${formatearEuros(gastado)} gastados` : null);

/** Etiqueta de lector de pantalla de una tarjeta (docs/plan-planificador.md §5.4). Con `presupuestos` apagado solo habla de lo gastado. */
export function etiquetaPlan(p: Plan & { gastado_cents?: number | null }, hoy: string, pendientes = 0, presupuestos = true): string {
  const mismoMes = p.start_date.slice(0, 7) === p.end_date.slice(0, 7);
  const fechas =
    p.start_date === p.end_date
      ? `el ${numeroDia(p.start_date)} de ${mesDe(p.start_date)}`
      : mismoMes
        ? `del ${numeroDia(p.start_date)} al ${numeroDia(p.end_date)} de ${mesDe(p.end_date)}`
        : `del ${numeroDia(p.start_date)} de ${mesDe(p.start_date)} al ${numeroDia(p.end_date)} de ${mesDe(p.end_date)}`;
  const v = vistaPresupuesto(p.budget_cents, p.gastado_cents ?? null);
  const dinero = !presupuestos
    ? p.gastado_cents
      ? `${Math.round(p.gastado_cents / 100)} euros gastados`
      : null
    : v.tipo === 'barra'
      ? `${Math.round(v.gastado / 100)} de ${Math.round(v.total / 100)} euros gastados`
      : v.tipo === 'solo'
        ? `presupuesto de ${Math.round(v.total / 100)} euros`
        : 'sin presupuesto';
  const tareas = pendientes > 0 ? (pendientes === 1 ? '1 tarea pendiente' : `${pendientes} tareas pendientes`) : null;
  return [p.name, etiquetaTipo(p.type).toLowerCase(), fechas, cuentaAtras(p, hoy).toLowerCase(), dinero, tareas].filter(Boolean).join(', ');
}

/** Solo los campos que han cambiado (así no se reenvía un reparto que ya no se podría elegir, como el bote apagado). */
export function cambiosPlan(antes: FilaPlan, despues: FilaPlan): Partial<FilaPlan> {
  const cambios: Record<string, unknown> = {};
  for (const k of Object.keys(despues) as (keyof FilaPlan)[]) if (antes[k] !== despues[k]) cambios[k] = despues[k];
  return cambios as Partial<FilaPlan>;
}
