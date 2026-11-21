/**
 * Lógica pura de Inicio (docs/revision-diseno.md, mockups Main e Inicio-vacio): el saludo, el próximo plan y su
 * etiqueta, los primeros pasos y qué estado se enseña. Sin red ni React: todo se puede probar.
 */
import { type Elemento, esVariosDias } from '@/lib/calendario/agrupar';
import { DIAS_SEMANA, diaCorto, diaMesCorto, diasEntre, rangoCorto, sumarDias } from '@/lib/calendario/rejilla';
import { MESES, deISO, fechaEnZona } from '@/lib/gastos/fechas';
import { formatearImporte } from '@/lib/dinero/importe';
import type { Gasto } from '@/lib/gastos/consultas';
import { textoPago } from '@/lib/gastos/saldar';
import type { Pago } from '@/lib/gastos/saldar';
import type { Hueco } from '@/lib/gastos/reparto';
import type { Sitio } from '@/lib/mapa/tipos';

/** «Jueves, 12 de noviembre». */
export function fechaSaludo(iso: string): string {
  const d = deISO(iso);
  return `${DIAS_SEMANA[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()].toLowerCase()}`;
}

/** Día desde el que cuenta un elemento: el suyo, o hoy si es un viaje que ya empezó. */
const diaEfectivo = (e: Pick<Elemento, 'inicio'>, hoy: string) => (e.inicio < hoy ? hoy : e.inicio);

const porDiaYHora = (hoy: string) => (a: Elemento, b: Elemento) =>
  diaEfectivo(a, hoy).localeCompare(diaEfectivo(b, hoy)) || (a.hora ?? '').localeCompare(b.hora ?? '') || a.titulo.localeCompare(b.titulo, 'es');

/**
 * Un elemento del itinerario de un plan que ya sale en Inicio (la tarjeta «Próximo plan» o el plan como próximo evento):
 * no se repite como evento suelto. Los de otros planes sí cuentan, con su línea «Plan: …» al abrirlos.
 */
const delPlanMostrado = (e: Pick<Elemento, 'tipo' | 'planId'>, planes: readonly string[]): boolean => e.tipo === 'event' && !!e.planId && planes.includes(e.planId);

/**
 * El próximo evento de un día (no cumpleaños, pago ni viaje de varios días; un plan de un día, como una celebración,
 * sí): el primero que aún no ha pasado. Uno de hoy con hora ya pasada se descarta; uno de todo el día cuenta hoy.
 * `hora` es `HH:MM`.
 */
export function proximoPlan(lista: Elemento[], hoy: string, hora: string, planesYaMostrados: readonly string[] = []): Elemento | null {
  const candidatos = lista.filter(
    (e) =>
      (e.tipo === 'plan' || (e.tipo === 'event' && e.categoria !== 'birthday')) &&
      !delPlanMostrado(e, planesYaMostrados) &&
      !esVariosDias(e) &&
      e.fin >= hoy &&
      !(e.fin === hoy && e.hora !== null && e.hora < hora),
  );
  return candidatos.sort(porDiaYHora(hoy))[0] ?? null;
}

/** Un plan del Planificador (`usePlanes`) con lo gastado si se sabe (`plan_summaries`). */
export type PlanBD = { id: string; name: string; icon: string; start_date: string; end_date: string; budget_cents: number | null; gastado_cents?: number | null };

/** Lo que enseña la tarjeta «Próximo plan»: una planificación de 2 o más días (de `plans` o un evento de varios días). */
export type PlanMultidia = {
  origen: 'plan' | 'evento';
  id: string;
  titulo: string;
  inicio: string;
  fin: string;
  /** Emoji del plan; null en un evento (se pinta el icono de su categoría). */
  emoji: string | null;
  categoria: Elemento['categoria'];
  presupuestoCents: number | null;
  /** Gastado en el plan (solo planes); null si no se sabe. */
  gastadoCents?: number | null;
};

/**
 * La próxima planificación de varios días: la que empieza antes entre TODOS los planes de 2 o más días y el primer
 * evento de varios días del calendario (en un empate, el plan). Una en curso cuenta desde hoy. Los planes de un día
 * no cuentan aquí (salen como próximo evento o en «Esta semana»).
 */
export function proximoPlanMultidia(planes: PlanBD[], lista: Elemento[], hoy: string): PlanMultidia | null {
  const plan = planes
    .filter((p) => p.end_date > p.start_date && p.end_date >= hoy)
    .sort((a, b) => diaEfectivo({ inicio: a.start_date }, hoy).localeCompare(diaEfectivo({ inicio: b.start_date }, hoy)) || a.start_date.localeCompare(b.start_date) || a.name.localeCompare(b.name, 'es'))[0];
  const desdePlan: PlanMultidia | null = plan
    ? { origen: 'plan', id: plan.id, titulo: plan.name, inicio: plan.start_date, fin: plan.end_date, emoji: plan.icon, categoria: null, presupuestoCents: plan.budget_cents, gastadoCents: plan.gastado_cents ?? null }
    : null;
  const e = lista.filter((x) => x.tipo === 'event' && x.categoria !== 'birthday' && esVariosDias(x) && x.fin >= hoy).sort(porDiaYHora(hoy))[0];
  const desdeEvento: PlanMultidia | null = e
    ? { origen: 'evento', id: e.origenId, titulo: e.titulo, inicio: e.inicio, fin: e.fin, emoji: null, categoria: e.categoria, presupuestoCents: e.importeCents }
    : null;
  if (desdePlan && desdeEvento) return diaEfectivo(desdeEvento, hoy) < diaEfectivo(desdePlan, hoy) ? desdeEvento : desdePlan;
  return desdePlan ?? desdeEvento;
}

/** «hoy», «mañana», «en 22 días» o «en curso» (ya ha empezado). */
export function textoEnDias(inicio: string, hoy: string): string {
  const n = diasEntre(hoy, inicio);
  if (n < 0) return 'en curso';
  if (n === 0) return 'empieza hoy';
  return n === 1 ? 'mañana' : `en ${n} días`;
}

/** «5 – 8 dic · 4 días · ~900 €»; con gasto en el plan, «312 € de 900 €» (sin presupuesto, «312 € gastados»). */
export function lineaMultidia(p: Pick<PlanMultidia, 'inicio' | 'fin' | 'presupuestoCents' | 'gastadoCents'>): string {
  const dias = diasEntre(p.inicio, p.fin) + 1;
  const gastado = p.gastadoCents && p.gastadoCents > 0 ? p.gastadoCents : null;
  const dinero = gastado
    ? p.presupuestoCents
      ? `${eurosCortos(gastado)} de ${eurosCortos(p.presupuestoCents)}`
      : `${eurosCortos(gastado)} gastados`
    : p.presupuestoCents
      ? textoPresupuesto(p.presupuestoCents)
      : null;
  return [rangoCorto(p.inicio, p.fin), `${dias} días`, dinero].filter(Boolean).join(' · ');
}

/** «Esta semana»: lo que ocurre en los próximos 7 días (cumpleaños y pagos incluidos), sin lo que ya sale arriba. */
export function proximosDeLaSemana(lista: Elemento[], hoy: string, hora: string, excluir: (string | null)[], max = 4, planesYaMostrados: readonly string[] = []): Elemento[] {
  const hasta = sumarDias(hoy, 6);
  return lista
    .filter(
      (e) =>
        !excluir.includes(e.clave) &&
        !delPlanMostrado(e, planesYaMostrados) &&
        !esVariosDias(e) &&
        e.fecha >= hoy &&
        e.fecha <= hasta &&
        !(e.fecha === hoy && e.hora !== null && e.hora < hora) &&
        !(e.tipo === 'payment' && e.estado === 'paid'),
    )
    .sort(porDiaYHora(hoy))
    .slice(0, max);
}

/**
 * Último lugar visitado: el del sitio con la visita más reciente (`place_visits`, ya ordenada por el servidor) y su
 * fecha. Sin visita (o si su sitio no se ve), el «Hemos ido» más reciente por `created_at` y `fecha` null («sin fecha»).
 */
export function ultimoLugarVisitado(sitios: Sitio[], ultimaVisita: { place_id: string; visited_on: string } | null = null): { sitio: Sitio; fecha: string | null } | null {
  const conVisita = ultimaVisita ? sitios.find((s) => s.id === ultimaVisita.place_id) : undefined;
  if (conVisita && ultimaVisita) return { sitio: conVisita, fecha: ultimaVisita.visited_on };
  const sitio = sitios.filter((s) => s.status === 'been').sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  return sitio ? { sitio, fecha: null } : null;
}

/** Media de las valoraciones de la pareja (solo las puestas), o null si nadie ha valorado. */
export function mediaValoracion(sitio: Pick<Sitio, 'place_notes'>): number | null {
  const v = sitio.place_notes.map((n) => n.rating).filter((r): r is number => typeof r === 'number');
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

/** «4,5»: la media con una coma y sin ceros de más. */
export const textoMedia = (m: number): string => (Math.round(m * 10) / 10).toString().replace('.', ',');

/** «hace 5 min», «hace 2 h», «ayer», «hace 3 días» o «12 nov». `ahora` y la fecha, en la zona de la pareja. */
export function haceCuanto(iso: string, ahora = new Date()): string {
  const t = new Date(iso);
  const min = Math.floor((ahora.getTime() - t.getTime()) / 60_000);
  if (min < 1) return 'ahora mismo';
  if (min < 60) return `hace ${min} min`;
  const dias = diasEntre(fechaEnZona(t), fechaEnZona(ahora));
  if (dias <= 0) return `hace ${Math.floor(min / 60)} h`;
  if (dias === 1) return 'ayer';
  if (dias < 7) return `hace ${dias} días`;
  return diaMesCorto(fechaEnZona(t));
}

export type EventoReciente = { id: string; title: string; created_by: string | null; created_at: string };

export type Movimiento = {
  clave: string;
  tipo: 'gasto' | 'pago' | 'sitio' | 'evento';
  /** Quién lo hizo (`profiles.id`), o null si no se sabe. */
  quien: string | null;
  texto: string;
  cuando: string;
};

export type OrigenMovimientos = {
  gastos: Gasto[];
  pagos: Pago[];
  sitios: Sitio[];
  eventos: EventoReciente[];
  /** Mi `profiles.id`, mi hueco y el nombre de mi pareja: para decir «Añadiste» o «María añadió». */
  yoId: string | null;
  yo: Hueco;
  nombrePareja: string;
};

/** Feed corto de actividad reciente: gastos, pagos entre vosotros, sitios guardados y eventos creados, lo más nuevo primero. */
export function movimientosRecientes(o: OrigenMovimientos, max = 5): Movimiento[] {
  const hizo = (id: string | null, yoVerbo: string, otroVerbo: string, cosa: string) =>
    id === o.yoId ? `${yoVerbo} ${cosa}` : `${o.nombrePareja} ${otroVerbo} ${cosa}`;
  const lista: Movimiento[] = [
    ...o.gastos.map((g) => ({
      clave: `gasto:${g.id}`,
      tipo: 'gasto' as const,
      quien: g.created_by,
      texto: hizo(g.created_by, 'Añadiste', 'añadió', `«${g.concept}» · ${formatearImporte(g.amount_cents)}`),
      cuando: g.created_at,
    })),
    ...o.pagos.map((p) => ({
      clave: `pago:${p.id}`,
      tipo: 'pago' as const,
      quien: p.created_by,
      texto: textoPago(p, o.yo, o.nombrePareja),
      cuando: p.created_at,
    })),
    ...o.sitios.map((s) => ({
      clave: `sitio:${s.id}`,
      tipo: 'sitio' as const,
      quien: s.created_by,
      texto: hizo(s.created_by, 'Guardaste', 'guardó', `«${s.name}»`),
      cuando: s.created_at,
    })),
    ...o.eventos.map((e) => ({
      clave: `evento:${e.id}`,
      tipo: 'evento' as const,
      quien: e.created_by,
      texto: hizo(e.created_by, 'Apuntaste', 'apuntó', `«${e.title}»`),
      cuando: e.created_at,
    })),
  ];
  return lista.sort((a, b) => b.cuando.localeCompare(a.cuando)).slice(0, max);
}

/** «HOY · 21:30», «MAÑANA · 10:00», «VIE 14 · 20:00» (sin la hora si es de todo el día). */
export function etiquetaPlan(e: Pick<Elemento, 'inicio' | 'hora'>, hoy: string): string {
  const dia = diaEfectivo(e, hoy);
  const texto = dia === hoy ? 'HOY' : dia === sumarDias(hoy, 1) ? 'MAÑANA' : diaCorto(dia).toUpperCase();
  return e.hora ? `${texto} · ${e.hora}` : texto;
}

/** «60 €» o «60,50 €»: sin decimales si es entero. */
const eurosCortos = (cents: number): string => {
  const euros = cents / 100;
  return `${Number.isInteger(euros) ? euros : euros.toFixed(2).replace('.', ',')} €`;
};

/** «~60 €»: presupuesto estimado sin decimales si es entero. */
export const textoPresupuesto = (cents: number): string => `~${eurosCortos(cents)}`;

export type ClavePaso = 'gasto' | 'sitio' | 'evento' | 'recurrente';

export const PASOS: { clave: ClavePaso; titulo: string; detalle: string }[] = [
  { clave: 'gasto', titulo: 'Añade vuestro primer gasto', detalle: 'Un ticket, una cena, lo que sea' },
  { clave: 'sitio', titulo: 'Guarda un sitio que os apetezca', detalle: 'Un restaurante, un bar, una escapada' },
  { clave: 'evento', titulo: 'Apunta un evento en el calendario', detalle: 'Una cena, el cine o una fecha importante' },
  { clave: 'recurrente', titulo: 'Añade vuestros pagos recurrentes', detalle: 'Suscripciones, luz, internet: os avisamos antes de cada cobro' },
];

export type Hechos = Record<ClavePaso, boolean>;

/** Progreso de «Primeros pasos». */
export function progresoPasos(hechos: Hechos) {
  const hecho = PASOS.filter((p) => hechos[p.clave]).length;
  return { hechos: hecho, total: PASOS.length, completo: hecho === PASOS.length };
}

/** «El código caduca en 7 días» (o «mañana», «hoy»); `null` si no hay código; «ha caducado» si ya pasó. */
export function textoCaducidad(caduca: Date | null, ahora = new Date()): string | null {
  if (!caduca) return null;
  const ms = caduca.getTime() - ahora.getTime();
  if (ms <= 0) return 'El código ha caducado';
  const dias = Math.ceil(ms / 86_400_000);
  return dias <= 1 ? 'El código caduca hoy' : `El código caduca en ${dias} días`;
}

export type EstadoInicio = {
  /** Bienvenida «Tu espacio está listo»: aún no hay ningún dato (ni plan próximo). */
  bienvenida: boolean;
  /** Aviso de invitación: la pareja aún no se ha unido (y su cuenta no se ha borrado). */
  invitacion: boolean;
  /** Tarjeta de saldo: solo con la pareja unida. */
  saldo: boolean;
  /** «Primeros pasos»: hasta que estén los cuatro. */
  primerosPasos: boolean;
};

/**
 * Qué bloques enseña Inicio. Con pareja y datos: plan, saldo, pendientes y pasos que falten. Sin pareja: el aviso de
 * invitación y sin saldo. Sin ningún dato: bienvenida y primeros pasos (con el aviso solo si falta la pareja).
 */
export function estadoInicio(p: { unida: boolean; parejaBorrada: boolean; hayPlan: boolean; hechos: Hechos }): EstadoInicio {
  const { hechos, completo } = progresoPasos(p.hechos);
  return {
    bienvenida: hechos === 0 && !p.hayPlan,
    invitacion: !p.unida && !p.parejaBorrada,
    saldo: p.unida,
    primerosPasos: !completo,
  };
}
