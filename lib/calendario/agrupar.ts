/**
 * De las filas de `calendar_range` a lo que pinta la pantalla: elementos por día, puntos de la rejilla,
 * filtros, lista («Próximos», un día) y la línea de cada fila.
 *
 * Un elemento guarda dos fechas distintas: `fecha` (el día en que se pinta) e `inicio` (el día en que EMPIEZA
 * esa repetición). En un evento de varios días repartido por sus días, `fecha` cambia y `inicio` no. Todo lo
 * que identifica la repetición (abrir el detalle, borrar «solo esta vez», «Pendiente de borrar») usa `inicio`:
 * si no, el servidor rechaza con TW060 («el evento no ocurre ese día»).
 *
 * Tolerante con el servidor: si falta una columna (`recurrence`, `attendees`, `is_secret`, `occurrence_id` de
 * la migración 20261120000000; `ends_on`, `category`, `birth_year` de la 20261121000000), se trata como «no se
 * repite», «los dos», «no secreto», null, «un día», «otros» y null.
 */
import {
  CATEGORIAS_VALIDAS,
  type Asistentes,
  type CategoriaEvento,
  INFO_CATEGORIA_EVENTO,
  textoAsistentes,
  textoEdad,
  tituloCumple,
} from '@/lib/calendario/evento';
import { type Repeticion, textoCorto } from '@/lib/calendario/repeticion';
import {
  DIAS_SEMANA,
  type Vista,
  diaCorto,
  diaDeMes,
  diaMesCorto,
  diasEntre,
  inicioSemana,
  mismoPeriodo,
  numeroDia,
  primeroDelMes,
  rangoCorto,
  semanaDe,
  sumarDias,
  tituloDia,
  ultimoDelMes,
} from '@/lib/calendario/rejilla';
import { formatearImporte } from '@/lib/dinero/importe';
import { MESES, deISO } from '@/lib/gastos/fechas';
import type { Frecuencia, Recurrente } from '@/lib/gastos/recurrentes';
import { esPersonal, textoQuien } from '@/lib/gastos/recurrentes';
import type { Hueco } from '@/lib/gastos/reparto';

/** Fila tal como la devuelve `calendar_range` (lo marcado como opcional puede faltar en un servidor sin migrar). */
export type FilaRango = {
  kind: string;
  source_id: string;
  occurs_on: string;
  /** Último día de esa repetición (= `occurs_on` si dura un día). */
  ends_on?: string | null;
  title: string;
  /** Planes: su emoji (`plans.icon`). */
  icon?: string | null;
  start_time: string | null;
  all_day?: boolean | null;
  amount_cents?: number | null;
  is_estimate?: boolean | null;
  status?: string | null;
  recurrence?: string | null;
  attendees?: string | null;
  is_secret?: boolean | null;
  occurrence_id?: string | null;
  category?: string | null;
  birth_year?: number | null;
  /** Sitio del Mapa enlazado (solo eventos). */
  place_id?: string | null;
};

/** `plan`: la banda de un plan del Planificador (de `plans`; sus eventos de itinerario no salen aquí). */
export type Tipo = 'event' | 'payment' | 'plan';
/** Una opción del menú de filtros: opciones que no se solapan y que juntas lo cubren todo («other» = el resto de eventos). */
export type Filtro = 'trip' | 'eating_out' | 'leisure' | 'other' | 'birthday' | 'payment' | 'plan';
/** Filtros activos en el orden de `OPCIONES_FILTRO`; vacío = todo. Semántica O entre los elegidos. */
export type Filtros = readonly Filtro[];
export type EstadoPago = 'scheduled' | 'pending' | 'paid';

export type Elemento = {
  /** Única por fila: un evento repetido tiene una por fecha, y uno de varios días repartido, una por día pintado. */
  clave: string;
  tipo: Tipo;
  /** Evento o pago recurrente de origen. */
  origenId: string;
  /** El día en que se pinta (en un evento de varios días repartido, cada uno de sus días). */
  fecha: string;
  /** El día en que EMPIEZA esta repetición: es lo que identifica la repetición ante el servidor. */
  inicio: string;
  /** El último día de esta repetición (= `inicio` si dura un día). */
  fin: string;
  /** Si el elemento representa un día concreto de un evento de varios días: el número de ese día (1 = primero). */
  diaN: number | null;
  /** Título que se enseña: en un cumpleaños, «Cumple de Carmen». */
  titulo: string;
  /** `HH:MM`, o null si es de todo el día. */
  hora: string | null;
  todoElDia: boolean;
  importeCents: number | null;
  estimado: boolean;
  estado: EstadoPago | null;
  repeticion: Repeticion;
  asistentes: Asistentes;
  secreto: boolean;
  /** Pagos ya cobrados: el cobro de `recurring_occurrences` (su gasto lo enlaza `recurring_occurrence_id`). */
  cobroId: string | null;
  /** Categoría del evento; null en los pagos. */
  categoria: CategoriaEvento | null;
  /** Cumpleaños: año de nacimiento, si se puso. */
  anioNacimiento: number | null;
  /** Sitio del Mapa enlazado (eventos que no son cumpleaños); la línea de la fila pone su nombre si esta persona lo ve. */
  placeId?: string | null;
  /** Planes: su emoji (`plans.icon`); en un plan, `importeCents` es su presupuesto. */
  emoji?: string | null;
  /**
   * Pagos: cada cuánto se cobra (único, mensual, anual) según el recurrente de origen; null si no se sabe (los
   * eventos, o los recurrentes aún sin cargar). `calendar_range` no la devuelve: la pone `aElementos` desde la lista de recurrentes.
   */
  frecuencia: Frecuencia | null;
  /**
   * Pagos: de quién es el pago si es en solitario (lo paga y es solo de una persona, `esPersonal`); null si es
   * compartido, del bote o no se sabe. Lo pone `aElementos` desde la lista de recurrentes.
   */
  duenoSolo: Hueco | null;
};

/** Lo que `calendar_range` no dice de un pago y sale de su recurrente de origen. */
export type InfoPago = { frecuencia: Frecuencia; duenoSolo: Hueco | null };

/** Mapa recurrente → `InfoPago` para `aElementos`: frecuencia y, si es en solitario, de quién es. */
export function infoPagos(recurrentes: Pick<Recurrente, 'id' | 'frequency' | 'split_mode' | 'paid_by'>[]): Map<string, InfoPago> {
  return new Map(
    recurrentes.map((r) => [r.id, { frecuencia: r.frequency, duenoSolo: esPersonal(r) && r.paid_by !== 'pot' ? r.paid_by : null }]),
  );
}

const REPETICIONES: Repeticion[] = ['none', 'weekly', 'monthly', 'yearly'];
const ESTADOS: EstadoPago[] = ['scheduled', 'pending', 'paid'];

const comparar = (a: string, b: string) => a.localeCompare(b, 'es');

/** ¿Dura más de un día? */
export const esVariosDias = (e: Pick<Elemento, 'inicio' | 'fin'>): boolean => e.fin > e.inicio;

/** Días que dura (1 si es de un día). */
export const totalDias = (e: Pick<Elemento, 'inicio' | 'fin'>): number => diasEntre(e.inicio, e.fin) + 1;

/**
 * Orden dentro de un mismo día: los de varios días primero, luego los de todo el día, luego por hora y por título
 * (el servidor ordena igual, salvo lo de varios días, que es cosa del cliente).
 */
function compararMismoDia(a: Elemento, b: Elemento): number {
  const va = esVariosDias(a);
  const vb = esVariosDias(b);
  if (va !== vb) return va ? -1 : 1;
  return (
    (a.hora === b.hora ? 0 : a.hora === null ? -1 : b.hora === null ? 1 : comparar(a.hora, b.hora)) ||
    comparar(a.titulo, b.titulo)
  );
}

/** Mismo orden que el servidor: fecha y, dentro del día, los de varios días, los de todo el día, la hora y el título. */
export function ordenar(lista: Elemento[]): Elemento[] {
  return [...lista].sort((a, b) => comparar(a.fecha, b.fecha) || compararMismoDia(a, b));
}

/**
 * Filas del servidor → elementos. Un plan (`kind = 'plan'`) es un elemento `plan` con su emoji, sus fechas y, como
 * importe, su presupuesto.
 * `pagos`: la frecuencia y el dueño en solitario de cada pago recurrente por su id (`calendar_range` no los trae).
 */
export function aElementos(filas: FilaRango[], pagos?: ReadonlyMap<string, InfoPago>): Elemento[] {
  const lista: Elemento[] = [];
  for (const f of filas) {
    if (f.kind !== 'event' && f.kind !== 'payment' && f.kind !== 'plan') continue;
    const hora = f.start_time ? f.start_time.slice(0, 5) : null;
    const rec = f.recurrence as Repeticion | null | undefined;
    const categoria =
      f.kind === 'event' ? (CATEGORIAS_VALIDAS.includes(f.category as CategoriaEvento) ? (f.category as CategoriaEvento) : 'other') : null;
    const fin = f.ends_on && f.ends_on > f.occurs_on ? f.ends_on : f.occurs_on;
    lista.push({
      clave: `${f.kind}:${f.source_id}:${f.occurs_on}`,
      tipo: f.kind,
      origenId: f.source_id,
      fecha: f.occurs_on,
      inicio: f.occurs_on,
      fin,
      diaN: null,
      titulo: categoria === 'birthday' ? tituloCumple(f.title) : f.title,
      hora,
      todoElDia: hora === null,
      importeCents: f.amount_cents ?? null,
      estimado: !!f.is_estimate,
      estado: f.kind === 'payment' && ESTADOS.includes(f.status as EstadoPago) ? (f.status as EstadoPago) : null,
      repeticion: rec && REPETICIONES.includes(rec) ? rec : 'none',
      asistentes: f.attendees === 'm1' || f.attendees === 'm2' ? f.attendees : 'both',
      secreto: !!f.is_secret,
      cobroId: f.occurrence_id ?? null,
      categoria,
      anioNacimiento: categoria === 'birthday' && typeof f.birth_year === 'number' ? f.birth_year : null,
      placeId: f.kind === 'event' && categoria !== 'birthday' ? (f.place_id ?? null) : null,
      emoji: f.kind === 'plan' ? (f.icon ?? null) : null,
      frecuencia: f.kind === 'payment' ? (pagos?.get(f.source_id)?.frecuencia ?? null) : null,
      duenoSolo: f.kind === 'payment' ? (pagos?.get(f.source_id)?.duenoSolo ?? null) : null,
    });
  }
  return ordenar(lista);
}

const CATEGORIAS_FILTRO: ReadonlySet<string> = new Set(['trip', 'eating_out', 'leisure', 'birthday']);

/** A qué opción pertenece un elemento: un pago, «Pagos»; un plan, «Planes»; un evento, su categoría (desconocida o sin ella, «Otros»). */
export function claveFiltro(e: Pick<Elemento, 'tipo' | 'categoria'>): Filtro {
  if (e.tipo === 'payment') return 'payment';
  if (e.tipo === 'plan') return 'plan';
  return e.categoria && CATEGORIAS_FILTRO.has(e.categoria) ? (e.categoria as Filtro) : 'other';
}

/** Qué elementos pasan los filtros: los de cualquiera de las opciones elegidas; sin ninguna, todos. */
export function filtrar(lista: Elemento[], filtros: Filtros): Elemento[] {
  if (filtros.length === 0) return lista;
  return lista.filter((e) => filtros.includes(claveFiltro(e)));
}

/** Lo máximo que se reparte un evento (el servidor ya limita a 31 días): por si llegara algo raro. */
const MAX_REPARTO = 62;

/**
 * Elementos por día. Un evento de varios días sale en CADA día que dura, con `fecha` = ese día, `diaN` = su
 * número y `inicio`/`fin` intactos (riesgo 1: la repetición se identifica por `inicio`).
 */
export function agruparPorDia(lista: Elemento[]): Record<string, Elemento[]> {
  const dias: Record<string, Elemento[]> = {};
  for (const e of lista) {
    if (!esVariosDias(e)) {
      (dias[e.fecha] ??= []).push(e);
      continue;
    }
    const total = Math.min(totalDias(e), MAX_REPARTO);
    for (let i = 0; i < total; i++) {
      const dia = sumarDias(e.inicio, i);
      (dias[dia] ??= []).push({ ...e, fecha: dia, diaN: i + 1, clave: `${e.clave}:${dia}` });
    }
  }
  for (const k of Object.keys(dias)) dias[k].sort(compararMismoDia);
  return dias;
}

/** Glifos que caben en una celda del Mes; si hay más, se ven estos y un «+N» pequeño al lado. */
export const MAX_PUNTOS = 2;

/** ¿Es un cumpleaños? Va en la esquina de la celda y en la info extra de la lista del día, no entre los glifos. */
export const esCumple = (e: Pick<Elemento, 'tipo' | 'categoria'>): boolean => e.tipo === 'event' && e.categoria === 'birthday';

/** Un plan de varios días enseña su emoji en su primer día (la barra, de 8 px, no lo puede llevar). */
const llevaGlifo = (e: Elemento): boolean => (!esVariosDias(e) && !esCumple(e)) || (e.tipo === 'plan' && e.diaN === 1);

/**
 * Glifos de un día de la rejilla: uno por elemento de UN día (los de varios días se dibujan como barras, salvo el
 * emoji de un plan en su primer día, y los cumpleaños, en la esquina: `cumples`), como mucho 2. `restantes`: los glifos que no caben más las barras ocultas
 * (`ocultos`, las que no cabían en los carriles); es el N del «+N». Con 2 o menos se ven todos y no hay «+N». Candado si hay un secreto (también de varios días).
 */
export function puntosDelDia(
  lista: Elemento[],
  ocultos = 0,
): { puntos: Elemento[]; restantes: number; secreto: boolean; cumples: number } {
  const sueltos = lista.filter(llevaGlifo);
  return {
    puntos: sueltos.slice(0, MAX_PUNTOS),
    restantes: Math.max(0, sueltos.length - MAX_PUNTOS) + Math.max(0, ocultos),
    secreto: lista.some((e) => e.secreto),
    cumples: lista.filter(esCumple).length,
  };
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/**
 * Qué hay en un día, para leerlo: «Viaje a Roma, día 2 de 5; 1 cumpleaños; 2 eventos; 1 pago recurrente». Los de
 * varios días van por su nombre; el resto, contados (un pago, como único o recurrente si se sabe). Vacío si no hay nada.
 */
export function resumenDia(lista: Elemento[]): string {
  // Los planes, como los de varios días, van por su nombre: «Plan: Lisboa, día 2 de 4».
  const varios = lista
    .filter((e) => esVariosDias(e) || e.tipo === 'plan')
    .map((e) => `${e.tipo === 'plan' ? 'Plan: ' : ''}${e.titulo}${esVariosDias(e) ? `, día ${e.diaN ?? 1} de ${totalDias(e)}` : ''}`);
  const sueltos = lista.filter((e) => !esVariosDias(e) && e.tipo !== 'plan');
  const cumples = sueltos.filter((e) => e.categoria === 'birthday').length;
  const pagos = sueltos.filter((e) => e.tipo === 'payment');
  const unicos = pagos.filter((e) => e.frecuencia === 'once').length;
  const recurrentes = pagos.filter((e) => e.frecuencia !== null && e.frecuencia !== 'once').length;
  const sinDato = pagos.length - unicos - recurrentes;
  const eventos = sueltos.length - cumples - pagos.length;
  return [
    ...varios,
    cumples ? plural(cumples, 'cumpleaños', 'cumpleaños') : '',
    eventos ? plural(eventos, 'evento', 'eventos') : '',
    unicos ? plural(unicos, 'pago único', 'pagos únicos') : '',
    recurrentes ? plural(recurrentes, 'pago recurrente', 'pagos recurrentes') : '',
    sinDato ? plural(sinDato, 'pago', 'pagos') : '',
  ]
    .filter(Boolean)
    .join('; ');
}

/** «14 de noviembre: Viaje a Roma, día 2 de 5; 1 cumpleaños; 2 eventos; 1 pago» (con «, hoy» si es hoy). */
export function etiquetaDia(iso: string, lista: Elemento[], hoy: string): string {
  const resumen = resumenDia(lista);
  return `${diaDeMes(iso)}${iso === hoy ? ', hoy' : ''}${resumen ? `: ${resumen}` : ''}`;
}

/** Clave de una solicitud de borrado: el id del evento (o pago) y, si es de «solo este día», esa fecha. */
export const claveBorrado = (origenId: string, fecha?: string | null) => (fecha ? `${origenId}:${fecha}` : origenId);

/** Lo que hace falta para la línea de una fila: quién soy, cómo se llama la pareja y el reparto de cada pago. */
export type ContextoLinea = {
  yo: Hueco;
  nombrePareja: string;
  /** Si la pareja ya se ha unido (por defecto sí): sin ella, «Vais los dos» o «de parte de los dos» no dicen nada. */
  conPareja?: boolean;
  recurrentes?: ReadonlyMap<string, Pick<Recurrente, 'paid_by' | 'split_mode' | 'split_pct_m1'>>;
  /** Solicitudes de borrado pendientes (`claveBorrado`): la fila lo dice. Una de la serie vale para todas sus fechas. */
  pendientesDeBorrar?: ReadonlySet<string>;
  /** Nombres de los sitios del Mapa que esta persona ve, por id: los eventos enlazados lo muestran en su línea. */
  sitios?: ReadonlyMap<string, string>;
};

/**
 * ¿Tiene esta fila una solicitud de borrado pendiente (de toda la serie o de su repetición)? La repetición se
 * identifica por `inicio`, no por el día pintado.
 */
export const pendienteDeBorrar = (e: Elemento, ctx: Pick<ContextoLinea, 'pendientesDeBorrar'>): boolean =>
  !!ctx.pendientesDeBorrar &&
  (ctx.pendientesDeBorrar.has(claveBorrado(e.origenId)) || (e.tipo === 'event' && ctx.pendientesDeBorrar.has(claveBorrado(e.origenId, e.inicio))));

/** «12,99 €» o, si es un importe aproximado y aún sin cobrar, «~48,00 €»; null si no hay importe. */
export const textoImporte = (e: Pick<Elemento, 'importeCents' | 'estimado' | 'estado'>): string | null =>
  e.importeCents === null ? null : `${e.estimado && e.estado !== 'paid' ? '~' : ''}${formatearImporte(e.importeCents)}`;

/** «bote común», «a medias», «pagas tú»… (minúscula inicial) según el reparto del pago recurrente; null si no se sabe. */
export function textoQuienPago(e: Pick<Elemento, 'origenId'>, ctx: ContextoLinea): string | null {
  const r = ctx.recurrentes?.get(e.origenId);
  const quien = r ? textoQuien(r, ctx.yo, ctx.nombrePareja) : null;
  return quien ? quien.charAt(0).toLowerCase() + quien.slice(1) : null;
}

const mayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** «Día 2 de 5 · hasta el dom 16» (un día concreto) o «14 – 18 nov» / «Hasta el 3 nov» (la repetición entera). */
function textoVarios(e: Elemento): string {
  if (e.diaN !== null) return `Día ${e.diaN} de ${totalDias(e)} · hasta el ${diaCorto(e.fin)}`;
  // En «Próximos» la fila va en el primer día del mes: si empezó antes, solo se dice hasta cuándo dura.
  return e.inicio < e.fecha ? `Hasta el ${diaMesCorto(e.fin)}` : rangoCorto(e.inicio, e.fin);
}

/** «el sábado 5 de diciembre» (un día) o «del sábado 5 al martes 8 de diciembre»: las fechas de un plan, para leerlas. */
export function textoFechasPlan(inicio: string, fin: string): string {
  const dia = (iso: string) => `${DIAS_SEMANA[deISO(iso).getDay()].toLowerCase()} ${numeroDia(iso)}`;
  const mes = (iso: string) => MESES[deISO(iso).getMonth()].toLowerCase();
  if (fin <= inicio) return `el ${dia(inicio)} de ${mes(inicio)}`;
  return mes(inicio) === mes(fin) ? `del ${dia(inicio)} al ${dia(fin)} de ${mes(fin)}` : `del ${dia(inicio)} de ${mes(inicio)} al ${dia(fin)} de ${mes(fin)}`;
}

/** «de tu parte», «de parte de Meri», «de parte de los dos»; null si no hay pareja. */
export function textoParteDe(e: Elemento, ctx: ContextoLinea): string | null {
  if (ctx.conPareja === false) return null;
  if (e.asistentes === 'both') return 'de parte de los dos';
  return e.asistentes === ctx.yo ? 'de tu parte' : `de parte de ${ctx.nombrePareja}`;
}

/**
 * La línea de una fila. Evento: «21:30», «Todo el día · cada año», «14 – 18 nov», «Día 2 de 5 · hasta el dom 16»,
 * «Solo va Meri»; cumpleaños: «Cumple 60 · de parte de Meri» (sin año, «De parte de Meri»). Pago: «12,99 € ·
 * bote común», «~48,00 € · a medias». Todos pueden acabar en «Pendiente de borrar».
 */
export function lineaElemento(e: Elemento, ctx: ContextoLinea): string {
  const pendiente = pendienteDeBorrar(e, ctx) ? 'Pendiente de borrar' : null;
  if (e.tipo === 'plan') {
    return [esVariosDias(e) ? textoVarios(e) : 'Todo el día', e.importeCents ? `~${formatearImporte(e.importeCents)}` : null, pendiente].filter(Boolean).join(' · ');
  }
  if (e.tipo === 'event') {
    if (e.categoria === 'birthday') {
      const partes = [textoEdad(e.anioNacimiento, e.inicio), textoParteDe(e, ctx), pendiente].filter(Boolean) as string[];
      return mayuscula(partes.join(' · '));
    }
    return [
      esVariosDias(e) ? textoVarios(e) : (e.hora ?? 'Todo el día'),
      textoCorto(e.repeticion),
      e.asistentes === 'both' ? null : e.asistentes === ctx.yo ? 'Solo vas tú' : `Solo va ${ctx.nombrePareja}`,
      (e.placeId && ctx.sitios?.get(e.placeId)) || null,
      pendiente,
    ]
      .filter(Boolean)
      .join(' · ');
  }
  return [textoImporte(e), textoQuienPago(e, ctx), e.estado === 'pending' ? 'falta el importe' : null, pendiente]
    .filter(Boolean)
    .join(' · ');
}

/** «Pago único», «Pago recurrente» o, si no se sabe, «Pago»: lo que dice el icono del pago. */
export const textoTipoPago = (e: Pick<Elemento, 'frecuencia'>): string =>
  e.frecuencia === 'once' ? 'Pago único' : e.frecuencia ? 'Pago recurrente' : 'Pago';

/** Etiqueta de accesibilidad de una fila: título, línea, categoría y «Vais los dos» (el color no es lo único que lo dice). */
export function etiquetaAccesible(e: Elemento, linea: string, ctx: ContextoLinea): string {
  if (e.tipo === 'plan') {
    return [`Plan: ${e.titulo}`, textoFechasPlan(e.inicio, e.fin), pendienteDeBorrar(e, ctx) ? 'pendiente de borrar' : null].filter(Boolean).join(', ');
  }
  const tipo = e.tipo === 'payment' ? textoTipoPago(e) : e.secreto ? 'Secreto, solo tú' : INFO_CATEGORIA_EVENTO[e.categoria ?? 'other'].etiqueta;
  const quien =
    e.tipo === 'event' && e.categoria !== 'birthday' && ctx.conPareja !== false && e.asistentes === 'both'
      ? textoAsistentes('both', ctx.yo, ctx.nombrePareja)
      : null;
  return [e.titulo, linea, tipo, quien].filter(Boolean).join('. ');
}

export type Seccion = {
  clave: string;
  /** Título del día cuando la lista junta varios; null si es una sola lista. */
  cabecera: string | null;
  elementos: Elemento[];
  /** Texto cuando la sección no tiene nada. */
  vacio: string | null;
  /** Info extra del día (cumpleaños y secretos): va al final de la lista, con un estilo más discreto. */
  extra?: boolean;
};

export type Lista = {
  titulo: string;
  /** Cada fila lleva su día de la semana y número (lista plana del mes). */
  conDia: boolean;
  secciones: Seccion[];
  /** Texto de estado vacío de toda la lista, o null si hay algo que enseñar. */
  vacio: string | null;
};

/**
 * Reparte lo de un día en lo normal (eventos y pagos) y la info extra (primero los cumpleaños y luego los
 * secretos, un elemento solo una vez). Cada bloque conserva el orden de entrada (por hora y título).
 */
export function separarExtras(delDia: Elemento[]): { normales: Elemento[]; extras: Elemento[] } {
  const cumples = delDia.filter(esCumple);
  const secretos = delDia.filter((e) => e.secreto && !esCumple(e));
  const extras = new Set<Elemento>([...cumples, ...secretos]);
  return { normales: delDia.filter((e) => !extras.has(e)), extras: [...cumples, ...secretos] };
}

/** Título del bloque de info extra según lo que lleva: «Cumpleaños», «Secreto», «Cumpleaños y secretos»… */
function tituloExtras(extras: Elemento[]): string {
  const cumples = extras.some(esCumple);
  const secretos = extras.filter((e) => !esCumple(e)).length;
  const secreto = secretos > 1 ? 'secretos' : 'secreto';
  return cumples ? (secretos ? `Cumpleaños y ${secreto}` : 'Cumpleaños') : mayuscula(secreto);
}

/**
 * Qué lista enseña la pantalla, o null si no toca ninguna. `elementos`: todo lo cargado (un elemento por
 * repetición, sin repartir por días), ya filtrado.
 * - Con un día seleccionado dentro del periodo: ese día (un viaje sale en cada día que dura). Los eventos y pagos
 *   van primero y, al final, un bloque de info extra con los cumpleaños y los secretos (`separarExtras`).
 * - Semana sin día seleccionado: ninguna (la vista de la semana ya lo enseña todo), salvo «Nada esta semana».
 * - Mes: «Próximos» (de hoy a fin de mes si es el actual) o el mes entero («En diciembre»). Un viaje sale una
 *   sola vez, en su primer día dentro del mes, mientras no haya terminado.
 */
export function construirLista(p: {
  vista: Vista;
  ancla: string;
  seleccionado: string | null;
  hoy: string;
  elementos: Elemento[];
  filtros: Filtros;
}): Lista | null {
  const { vista, ancla, seleccionado, hoy, elementos, filtros } = p;
  const dias = agruparPorDia(elementos);

  if (seleccionado && mismoPeriodo(vista, ancla, seleccionado)) {
    const delDia = dias[seleccionado] ?? [];
    const { normales, extras } = separarExtras(delDia);
    const secciones: Seccion[] = [];
    if (normales.length > 0 || extras.length === 0) secciones.push({ clave: seleccionado, cabecera: null, elementos: normales, vacio: null });
    if (extras.length > 0) {
      secciones.push({ clave: `${seleccionado}:extra`, cabecera: tituloExtras(extras), elementos: extras, vacio: null, extra: true });
    }
    return { titulo: tituloDia(seleccionado), conDia: false, secciones, vacio: delDia.length === 0 ? 'Nada este día' : null };
  }

  if (vista === 'semana') {
    if (semanaDe(ancla).some((d) => (dias[d] ?? []).length > 0)) return null;
    return {
      titulo: inicioSemana(ancla) === inicioSemana(hoy) ? 'Esta semana' : `Semana del ${diaMesCorto(inicioSemana(ancla))}`,
      conDia: false,
      secciones: [],
      vacio: 'Nada esta semana',
    };
  }

  const mes = ancla.slice(0, 7);
  const primero = primeroDelMes(ancla);
  const ultimo = ultimoDelMes(ancla);
  // Lo que toca el mes (un viaje que empezó antes también) y, en el mes actual, lo que aún no ha terminado.
  const delMes = elementos
    .filter((e) => e.inicio <= ultimo && e.fin >= primero)
    .map((e) => (e.inicio < primero ? { ...e, fecha: primero } : e));
  const esActual = hoy.slice(0, 7) === mes;
  const lista = ordenar(esActual ? delMes.filter((e) => e.fin >= hoy) : delMes);
  const nombre = MESES[Number(mes.slice(5, 7)) - 1].toLowerCase();
  const anio = mes.slice(0, 4);
  return {
    titulo: esActual ? 'Próximos' : `En ${nombre}${anio === hoy.slice(0, 4) ? '' : ` de ${anio}`}`,
    conDia: true,
    secciones: [{ clave: mes, cabecera: null, elementos: lista, vacio: null }],
    vacio:
      lista.length > 0
        ? null
        : delMes.length > 0
          ? 'No queda nada este mes'
          : filtros.length === 0
            ? 'Aún no hay nada en el calendario'
            : 'Nada de este tipo este mes',
  };
}
